# This file is part of domserver.
#
# domserver is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# domserver is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with domserver.  If not, see <http://www.gnu.org/licenses/>.

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

    def __init__(self, domserver, objs, logger=None):
        Thread.__init__(self, domserver, logger)
        self.objs = objs
        
        gobject.threads_init()
        threads_init()
        DBusGMainLoop(set_as_default=True)
        self.loop = gobject.MainLoop()
        
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
        self.objs.add_device(device_file, labe, fstype, size, mounted,
            mount_point)
            
    def domserver_run(self):
        self.verbose("Starting storage device watcher thread...")
        self.loop.run()
        self.verbose("Stopped storage device watcher thread")
        
    def stop(self):
        self.loop.quit()
        
        
class FileObjectProvider(ObjectProvider):
    """Filesystem object provider
    
    Provides files and folder as file:/path/to/item as well as external storage
    devices as file:#/dev/xxx"""  

    _fprops = ['size', 'path', 'basename', 'dirname', 'owner', 'group', 'perms', 'mtime']
    _dprops = ['size', 'path', 'label', 'fs', 'dev']
    devices = {}
    
    def add_device(self, dev, label, fs, size, mounted, mntpoint):
        self.devices[dev]= {
            'label': label, 'fs': fs, 'size': size, 'mounted': mounted,
            'mntpoint': mntpoint
        }
        
    def del_device(self, dev):
        del self.devices[dev]
    
    def get_oids(self):
        devoids = ["file:#%s" % dev for dev in self.devices.keys()]
        return devoids
        
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
        if path.startswith('#'):
            return path[1:] in self.devices.keys()
        elif path.startswith('/'):
            return os.path.exists(path)
        else:
            return False
        
    def get_types(self, path):
        types = []
        if path.startswith('#'):
            types.append('device')
            if self.devices[path[1:]][mounted]:
                types.append('folder')
        elif path.startswith('/'):
            if os.path.isdir(path):
                types.append('folder')
            elif os.path.isfile(path):
                types.append('file')
        return types
        
    def get_value(self, path, prop):
        if path.startswith('#'):
            if prop not in self._dprops:
                raise KeyError("No property '%s' for object '%s'" % (prop, path))
            dev = self.devices(path[1:])
            if prop == 'path':
                if dev['mounted']:
                    return dev['mntpoint']
                else:
                    return ''
            elif prop == 'dev':
                return path[1:]
            else:
                return dev[prop]
        elif path.startswith('/'):
            if prop not in self._fprops:
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
                
    def set_value(self, path, prop, val):
        raise KeyError("Property '%s' is readonly" % prop)
        
    def describe_props(self, path, detail_level):
        desc = {}
        if path.startswith('#'):
            desc['size'] = {
                'type': 'uint32',
                'conv': lambda x:int(x / 1024 ** 2)
            }
            for k in ('path', 'label', 'fs', 'dev'):
                desc[k] = {'type': 'string'}
        elif path.startswith('/'):
            desc['size'] = {
                'type': 'uint32',
                'conv': lambda x:int(x / 1024)
            }
            for k in ('owner', 'group', 'mtime', 'perms'):
                desc[k] = {'type': 'uint32'}
            for k in ('path', 'basename', 'dirname'):
                desc[k] = {'type': 'string'}
        return desc
        
        
class FileObjectProcessor(ObjectProcessor):

    def get_action_names(self, obj=None):
        names = []
        if obj is not None and obj.is_oneof(['file', 'folder']):
            path = obj['path']
            dirname = os.path.dirname(path)
            if os.access(dirname, os.W_OK) and dirname != path:
                names.append('delete', 'rename')
        return names
        
    def describe_action(self, act):
        name = act.name
        obj = act.obj
        
        if name not in self.get_action_names(obj):
            raise ObjectError("Invalid action specification")
            
        if name == 'rename':
            act.add_param('new-name', SIC.APFLAG_TYPE_STRING)
            
    def execute_action(self, act):
        name = act.name
        obj = act.obj
        
        if name not in self.get_action_names(obj):
            raise ObjectError("Invalid action specification")
            
        if name == 'delete':
            os.unlink(obj['path'])
        elif name == 'rename':
            pass
            
        
class FileManagerHelper:

    def __init__(self, domserver):
        self.domserver = domserver
        self.domserver.info("Initializing file manager helper")
        self.logger = domserver.get_logger('fileman.log_file', 'fileman.log_level')
        
        self.objs = FileObjectProvider(self.domserver, 'file')
        self.proc = FileObjectProcessor(self.domserver, 'file')
        domserver.register_object_interface(
            name='file',
            provider=self.objs,
            processor=self.proc
        )
        
        self._sdthread = StorageDeviceWatcher(self.domserver, self.objs,
            self.logger)
        self._sdtid = domserver.add_thread(self._sdthread, True)
        
        
