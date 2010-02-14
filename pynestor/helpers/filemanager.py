# This file is part of nestor.
#
# nestor is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# nestor is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with nestor.  If not, see <http://www.gnu.org/licenses/>.

import dbus
from dbus.mainloop.glib import DBusGMainLoop, threads_init
import gobject
import os
import os.path

from ..objects import OCriterion, OExpression, ObjectProvider, ObjectProcessor
from ..socketinterface import SIStringTag, SIUInt32Tag
from ..socketinterfacecodes import SIC
from ..thread import Thread

class StorageDeviceWatcher(Thread):

    def __init__(self, nestor, objs, logger=None):
        Thread.__init__(self, nestor, logger)
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
        self.objs.add_device(device_file, label, fstype, size, mounted,
            mount_point)
            
    def nestor_run(self):
        self.verbose("Starting storage device watcher thread...")
        self.loop.run()
        self.verbose("Stopped storage device watcher thread")
        
    def stop(self):
        self.loop.quit()
        
        
class FileObjectProvider(ObjectProvider):
    """Filesystem object provider
    
    Provides files and folders as file:/path/to/item as well as external storage
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
        return []
        
    def matching_oids(self, expr, types):
        ret = []
        
        if not types or 'device' in types:
            ret.extend(["#%s" % d for d in self.devices.keys()])
    
        if not types or 'file' in types or 'folder' in types:
            # Only handle expressions with one criterion on dirname
            if not (expr.oper != '' or
                expr.crit_a is None or
                expr.crit_a.prop != 'dirname' or
                expr.crit_a.oper != '==' or
                not os.path.exists(expr.crit_a.val)):
                
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
                
                ret.extend([os.path.join(dirname, o) for o in objs])
            
        return list(set(ret))
        
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
            dev = self.devices[path[1:]]
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
        
    def describe_props(self, path, lod):
        props = []
        if path.startswith('#'):
            if lod >= SIC.LOD_BASIC:
                props.extend(['label'])
            if lod == SIC.LOD_MAX:
                props.extend(['size', 'path', 'fs', 'dev'])
                
        elif path.startswith('/'):
            if lod >= SIC.LOD_BASIC:
                props.extend(['path'])
            if lod == SIC.LOD_MAX:
                props.extend(['size', 'owner', 'group', 'mtime', 'perms',
                    'basename', 'dirname'])
                    
        desc = {}
        for k in props:
            if k == 'size':
                if path.startswith('#'):
                    desc[k] = {
                        'type': 'uint32',
                        'conv': lambda x:int(x / 1024 ** 2)
                    }
                elif path.startswith('/'):
                    desc[k] = {
                        'type': 'uint32',
                        'conv': lambda x:int(x / 1024)
                    }
            elif k in ('path', 'label', 'fs', 'dev', 'basename', 'dirname'):
                desc[k] = {'type': 'string'}
            elif k in ('owner', 'group', 'mtime', 'perms'):
                desc[k] = {'type': 'uint32'}
        return desc
        
        
class FileObjectProcessor(ObjectProcessor):

    def get_action_names(self, obj=None):
        names = []
        if obj is not None and obj.is_oneof(['file', 'folder']):
            path = obj['path']
            dirname = os.path.dirname(path)
            if os.access(dirname, os.W_OK) and dirname != path:
                names.extend(['delete', 'rename'])
        return names
        
    def describe_action(self, act):
        name = act.name
        obj = act.obj
            
        if name == 'rename':
            act.add_param('new-name', SIC.APFLAG_TYPE_STRING)
            
    def execute_action(self, act):
        name = act.name
        obj = act.obj
            
        if name == 'delete':
            os.unlink(obj['path'])
        elif name == 'rename':
            pass
            
        
class FileManagerHelper:

    def __init__(self, nestor):
        self.nestor = nestor
        self.nestor.info("Initializing file manager helper")
        self.logger = nestor.get_logger('fileman.log_file', 'fileman.log_level')
        
        self.objs = FileObjectProvider(self.nestor, 'file')
        self.proc = FileObjectProcessor(self.nestor, 'file')
        nestor.register_object_interface(
            name='file',
            provider=self.objs,
            processor=self.proc
        )
