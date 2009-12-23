# This file is part of avhes.
#
# avhes is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# avhes is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with avhes.  If not, see <http://www.gnu.org/licenses/>.

import dbus
from dbus.mainloop.glib import DBusGMainLoop, threads_init
import gobject
import os
import os.path

from ..Objects import OCriterion, OExpression, ObjectProvider, ObjectProcessor
from ..SocketInterface import SIStringTag, SIUInt32Tag
from ..SocketInterfaceCodes import SIC
from ..Thread import Thread

class StorageDeviceWatcher(Thread):

    def __init__(self, avhes, logger=None):
        threads_init()
        Thread.__init__(self, avhes, logger)
        self.bus = dbus.SystemBus()
        self.hal_manager_obj = self.bus.get_object(
            "org.freedesktop.Hal", 
            "/org/freedesktop/Hal/Manager"
        )
        self.hal_manager = dbus.Interface(
            self.hal_manager_obj,
            "org.freedesktop.Hal.Manager"
        )
        self.hal_manager.connect_to_signal("DeviceAdded", self._filter_add)
        
    def _filter_add(self, udi):
        device_obj = self.bus.get_object ("org.freedesktop.Hal", udi)
        device = dbus.Interface(device_obj, "org.freedesktop.Hal.Device")
        if device.QueryCapability("volume"):
            return self._device_added(device)
            
    def _device_added(self, volume):
        device_file = volume.GetProperty("block.device")
        label = volume.GetProperty("volume.label")
        fstype = volume.GetProperty("volume.fstype")
        mounted = volume.GetProperty("volume.is_mounted")
        mount_point = volume.GetProperty("volume.mount_point")
        try:
            size = volume.GetProperty("volume.size")
        except:
            size = 0
            
        self.verbose("New storage device: %s ('%s', %s, %.2fGB)" %
            (device_file, label, fstype, float(size) / 1024**3))
            
    def avhes_run(self):
        DBusGMainLoop(set_as_default=True)
        loop = gobject.MainLoop()
        loop.run()
        
        
class FileObjectProvider(ObjectProvider):       

    _props = ['size', 'path', 'basename', 'dirname', 'owner', 'group', 'perms', 'mtime']

    def get_oids(self):
        expr = OExpression('', OCriterion('dirname', '==', '/'))
        return self.matching_oids(expr, None)
        
    def matching_oids(self, expr, types):
        # Only handle expressions with one criterion on dirname
        if (expr.oper != '' or
            expr.crit_a is None or
            expr.crit_a.prop != 'dirname' or
            expr.crit_a.oper != '==' or
            not os.path.exists(expr.crit_a.val)):
            return []
            
        dirname = expr.crit_a.val
            
        if types is None or len(types) == 0:
            match_dirs = True
            match_files = True
        else:
            match_dirs = 'folder' in types
            match_files = 'file' in types
                    
        objs = []
        for r, d, f in os.walk(dirname):
            if match_dirs:
                objs.extend(d)
            if match_files:
                objs.extend(f)
            d[0:len(d)] = []
            
        return [os.path.join(dirname, o) for o in objs]
        
    def valid_oid(self, path):
        return os.path.exists(path)
        
    def get_types(self, path):
        types = []
        if os.path.isdir(path):
            types.append('folder')
        elif os.path.isfile(path):
            types.append('file')
            if path.startswith('/dev/'):
                types.append('device')
        
    def get_value(self, path, prop):
        if prop not in self._props:
            raise KeyError("No property '%s' for object '%s'" % (prop, path))
            
        if prop in ['size', 'owner', 'group', 'perms', 'mtime']:
            statinfo = os.stat(path)
            if prop == 'size':
                return statinfo.st_size
            elif prop == 'owner':
                return statinfo.st_uid
            elif prop == 'group':
                return statinfo.st_gid
            elif prop == 'perms':
                return statinfo.st_mode
            elif prop == 'mtime':
                return statinfo.st_mtime
        elif prop == 'basename':
            return os.path.basename(path)
        elif prop == 'dirname':
            return os.path.dirname(path)
        elif prop == 'path':
            return path
        
    def to_sitags(self, path, detail_level):
        tags = []
        for k in self._props:
            val = self.get_value(path, k)
            if k in ('size'):
                vtag = SIUInt32Tag(int(val / 1024), SIC.TAG_OBJ_VALUE)
            elif k in ('owner', 'group', 'mtime', 'perms'):
                vtag = SIUInt32Tag(val, SIC.TAG_OBJ_VALUE)
            else:
                vtag = SIStringTag(val, SIC.TAG_OBJ_VALUE)

            tag = SIStringTag(k, SIC.TAG_OBJ_PROPERTY)
            tag.subtags.append(vtag)
            tags.append(tag)
        return tags
        
        
class FileObjectProcessor(ObjectProcessor):

    def get_void_actions(self):
        return []
            
    def get_obj_actions(self, obj):
        actions = []
        if obj.is_oneof(['file', 'folder']):
            path = obj.get_value('path')
            dirname = os.path.dirname(path)
            if os.access(dirname, os.W_OK) and dirname != path:
                actions.append('delete', 'rename')
        return actions
        
    def do_void_action(self, action):
        if action not in self.get_void_actions():
            raise ObjectError("Invalid action '%s'" % action)
        
    def do_obj_action(self, action, obj):
        if action not in self.get_obj_actions(obj):
            raise ObjectError("Invalid action '%s'" % action)
        
        
class FileManagerHelper:

    def __init__(self, avhes):
        self.avhes = avhes
        self.avhes.info("Initializing file manager helper")
        self.logger = avhes.get_logger('fileman.log_file', 'fileman.log_level')
        
        self.objs = FileObjectProvider(self.avhes, 'file')
        self.proc = FileObjectProcessor(self.avhes, 'file')
        avhes.register_object_interface(
            name='file',
            provider=self.objs,
            processor=self.proc
        )
        
        self._sdthread = StorageDeviceWatcher(self.avhes, self.logger)
        self._sdtid = avhes.add_thread(self._sdthread, True)
        
        
