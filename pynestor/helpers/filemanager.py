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
import dbus.mainloop.glib
import gobject
import os
import os.path
import subprocess

import pynestor.objects as o
from ..socketinterfacecodes import SIC
from ..thread import Thread

class StorageDeviceWatcher(Thread):

    DKPATH = "/org/freedesktop/DeviceKit/Disks"
    DKDOMAIN = "org.freedesktop.DeviceKit.Disks"

    def __init__(self, nestor, objs, logger=None):
        Thread.__init__(self, nestor, logger)
        self.objs = objs
        
        gobject.threads_init()
        dbus.mainloop.glib.threads_init()
        dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
        self.loop = gobject.MainLoop()
        
        self.bus = dbus.SystemBus()
        self.dkproxy = self.bus.get_object(self.DKDOMAIN, self.DKPATH)
        self.dkiface = dbus.Interface(self.dkproxy, self.DKDOMAIN)
        self.dkiface.connect_to_signal("DeviceAdded", self._device_added)
        self.dkiface.connect_to_signal("DeviceChanged", self._device_changed)
        self.dkiface.connect_to_signal("DeviceRemoved", self._device_removed)
            
    def _device_added(self, device):
        self.debug("Device %s added" % device)
        
    def _device_changed(self, device):
        self.debug("Device %s changed" % device)
        self.objs.device_changed(str(device))
        
    def _device_removed(self, device):
        self.debug("Device %s removed" % device)
        self.objs.device_changed(str(device))
            
    def nestor_run(self):
        self.verbose("Starting disk watcher thread...")
        self.loop.run()
        self.verbose("Stopped disk watcher thread")
        
    def stop(self):
        self.loop.quit()
        
    def get_device_list(self):
        """Return an array of disk DBus paths sorted by mountpoint, with USB
        drives last"""
        
        devices = []
        domain = "%s.Device" % self.DKDOMAIN
        for d in self.dkiface.EnumerateDevices():
            dpath = str(d)
            device = self.bus.get_object(self.DKDOMAIN, dpath) 
            diface = dbus.Interface(device, "org.freedesktop.DBus.Properties")
            if str(diface.Get(domain, "id-usage")) == 'filesystem':
                mounted = bool(diface.Get(domain, "device-is-mounted"))
                mpaths = [str(p) for p in diface.Get(domain, "device-mount-paths")]
                mpath = mpaths[0] if mpaths else ''
                is_usb = str(diface.Get(domain, "drive-connection-interface")) == 'usb'
                devices.append({
                    'path': dpath,
                    'mounted': mounted,
                    'mpath': mpath,
                    'is_usb': is_usb
                })
                
        devices.sort(key=lambda x:x['mpath'])
        devices.sort(key=lambda x:x['is_usb'])
        return [d['path'] for d in devices]
        
    def get_device_props(self, dpath):
        """Return a dict of properties for device with DBus path 'dpath'"""
        
        device = self.bus.get_object(self.DKDOMAIN, dpath)
        diface = dbus.Interface(device, "org.freedesktop.DBus.Properties")
        domain = "%s.Device" % self.DKDOMAIN
        
        mounted = bool(diface.Get(domain, "device-is-mounted"))
        mpaths = [str(p) for p in diface.Get(domain, "device-mount-paths")]
        mpath = mpaths[0] if mpaths else ''
        size = int(diface.Get(domain, "device-size"))
        devfile = str(diface.Get(domain, "device-file"))
        uuid = str(diface.Get(domain, "id-uuid"))
        is_usb = str(diface.Get(domain, "drive-connection-interface")) == 'usb'
        fstype = str(diface.Get(domain, "id-type"))
        
        idlabel = str(diface.Get(domain, "id-label"))
        drivemodel = str(diface.Get(domain, "drive-model"))
        presname = str(diface.Get(domain, "device-presentation-name"))
        
        for lbl in (presname, idlabel, mpath, drivemodel, devfile):
            if lbl != '':
                label = lbl
                break
        
        return {
            "dbus-path": dpath,
            "mounted": mounted,
            "mount-point": mpath,
            "name": label,
            "size": size,
            "free": size,
            "devfile": devfile,
            "uuid": uuid,
            "is_usb": is_usb,
            "fstype": fstype
        }
        
        
class FileObject(o.ObjectWrapper):

    def describe(self):
        if os.path.isdir(self.oid):
            self.types = ["directory"]
        else:
            self.types = ["file"]
        
        statinfo = os.stat(self.oid)
        self.props = {
            'path': self.oid,
            'basename': os.path.basename(self.oid),
            'dirname': os.path.dirname(self, oid),
            'size': statinfo.st_size,
            'owner': statinfo.st_uid,
            'group': statinfo.st_gid,
            'perms': statinfo.st_mode,
            'mtime': statinfo.st_mtime
        }
    
    def update(self):
        pass
        
    def set_value(self, key, value):
        raise KeyError("FileObject.%s is read-only" % key)
        
        
class DeviceObject(o.ObjectWrapper):

    def describe(self):
        self.types = ["device"]
        path = self.oid[len('#'):]
        self.props = self.provider.dev.get_device_props(path)
        self.props["uuid"] = self.props["uuid"].translate(None, "-_:")
        self.update()
        
    def update(self):
        if self.props["mounted"]:
            out = subprocess.Popen(
                ['df', '-B', '1', self.props['mount-point']],
                stdout=subprocess.PIPE
            ).communicate()[0].split('\n')[1:]
            line = out[0].split()
            try:
                self.props['size'] = int(line[1])
                self.props['free'] = int(line[3])
            except IndexError:
                # When device name is too long, df outputs on 2 lines
                line = out[1].split()
                self.props['size'] = int(line[0])
                self.props['free'] = int(line[2])
        
    def set_value(self, key, value):
        raise KeyError("DeviceObject.%s is read-only" % key)
        
        
class FileObjectProvider(o.ObjectProvider):
    """Filesystem object provider
    
    Provides files and folders as file:/path/to/item as well as external storage
    devices as file:#<DBus DeviceKit-disk path>"""  

    _fprops = ['size', 'path', 'basename', 'dirname', 'owner', 'group', 'perms', 'mtime']
    _dprops = ['size', 'path', 'label', 'fs', 'dev']
    devices = {}
    
    def set_devthread(self, devthread):
        self.dev = devthread
        
    def device_changed(self, devpath):
        self.cache.remove("file:#%s" % devpath)
    
    def get_oids(self):
        """Only return devices, files/directories must be matched"""
        return ["#%s" % path for path in self.dev.get_device_list()]
        
    def get_object(self, oid):
        if oid.startswith("#"):
            if oid[len("#"):] in self.dev.get_device_list():
                return DeviceObject(self.nestor, self, oid)
        elif oid.startswith("/") and os.path.exists(oid):
            return FileObject(self.nestor, self, oid)
        
    def infer_oids(self, obj):
        try:
            path = obj["path"]
        except KeyError:
            pass
        else:
            if os.path.exists(path):
                return [path]
        return []
    
    def match_oids(self, expr, types):
        ret = []
    
        if not types or 'file' in types or 'directory' in types:
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
                
                ret.extend([os.path.join(dirname, obj) for obj in objs])
                
        if not types or 'device' in types:
            ret.extend(o.ObjectProvider.match_oids(self, expr, types))
            
        return ret        
        
        
class FileObjectProcessor(o.ObjectProcessor):

    def get_action(self, obj):
        names = []
        if obj.is_oneof(['file', 'directory']):
            path = obj['path']
            dirname = os.path.dirname(path)
            if os.access(dirname, os.W_OK) and dirname != path:
                names.extend(['file-delete', 'file-rename'])
        if obj.is_a('device'):
            names.append('device-set-label')
            if obj["mounted"]:
                names.append('device-unmount')
            else:
                names.append('device-mount')
        return names
        
    def describe(self, act):
        name = act.name
        obj = act.obj
            
        if name == 'rename':
            act.add_param('new-name', SIC.APFLAG_TYPE_STRING)
            
    def execute(self, act):
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
        
        self.dwthread = StorageDeviceWatcher(nestor, self.objs, self.logger)
        self.dw_tid = nestor.add_thread(self.dwthread, True)
        
        self.objs.set_devthread(self.dwthread)
        
        
