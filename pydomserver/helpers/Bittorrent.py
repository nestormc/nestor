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

import libtorrent as lt
import os
import os.path
from pyinotify import WatchManager, ThreadedNotifier, ProcessEvent, EventsCodes
import shutil
import time

from ..Errors import ObjectError
from ..Thread import Thread
from ..Objects import ObjectProvider, ObjectProcessor
from ..SocketInterface import SIPacket, SIStringTag, SIUInt32Tag, SIUInt8Tag
from ..SocketInterfaceCodes import SIC
from ..Utils import fileIsOpen

class DictTorrent:
    def __init__(self, logger, handle):
        self.log = logger
        self.h = handle
        
    def pause(self):
        self.h.auto_managed(False)
        self.h.pause()
        
    def resume(self):
        self.h.resume()
        self.h.auto_managed(True)
        
    def __getitem__(self, key):
        if key == 'name':
            return self.h.name()
        elif key == 'size':
            return self.h.status().total_wanted
        elif key == 'seeds':
            return self.h.status().num_seeds
        elif key == 'progress':
            size = self.h.status().total_wanted
            done = self.h.status().total_wanted_done
            return float(done) / float(size) * 100.0
        elif key == 'speed':
            return self.h.status().download_rate
        elif key == 'status':
            state = str(self.h.status().state)
            pause = self.h.status().paused
            if pause:
                return 2
            elif state in ('queued_for_checking',
                           'checking_files',
                           'downloading_metadata',
                           'allocating'):
                return 1
            elif state == 'downloading':
                return 3
            elif state == 'seeding':
                return 4
            else:
                self.log.debug("Unknown status : %s, %s" % (repr(pause), state))
        elif key == 'files':
            info = self.h.get_torrent_info()
            ret = {}
            for f in info.files():
                ret[f.path] = f.size
            return ret
        else:
            raise KeyError("DictTorrent has no item named '%s'" % key)
            
        
class BitTorrent:
    def __init__(self, domserver, logger):
        self.domserver = domserver
        self.log = logger
        self.s = None
        
    def is_active(self):
        return not self.s is None
        
    def start(self):
        self.s = lt.session()
        self.s.listen_on(
            self.domserver.config['bt.port'],
            self.domserver.config['bt.port']
        )
        
    def stop(self, save_callback=None):
        if self.is_active():
            self.s.pause()
            if callable(save_callback):
                save_callback(self)
            del(self.s)
            self.s = None
        
    def add_torrent(self, torrent, destdir):
        if self.is_active():
            info = lt.torrent_info(lt.bdecode(open(torrent, 'rb').read()))
            ret = self.s.add_torrent(info, destdir)
            return str(info.info_hash())
            
    def del_torrent(self, hash):
        h = self._get(hash)
        h.pause()
        self.s.remove_torrent(h)
            
    def _get(self, hash):
        if self.is_active():
            for h in self.s.get_torrents():
                if str(h.info_hash()) == hash:
                    return h
        raise KeyError("Torrent hash '%s' not found" % hash)
        
    def __getitem__(self, hash):
        return DictTorrent(self.log, self._get(hash))
    
    def keys(self):
        if self.is_active():
            return ["%s" % h.info_hash() for h in self.s.get_torrents()]
        else:
            return []
            
            
class BTObjectProvider(ObjectProvider):

    def __init__(self, domserver, bt):
        ObjectProvider.__init__(self, domserver, 'bt')
        self.bt = bt
        
    def get_oids(self):
        return list(set(self.bt.keys()) | set(self.list_objects()))
        
    def valid_oid(self, hash):
        return hash in self.get_oids()
        
    def get_types(self, hash):
        return ['download', 'torrent']
        
    def get_value(self, hash, prop):
        obj_exists = False
        if hash in self.bt.keys():
            obj_exists = True
            try:
                return self.bt[hash][prop]
            except KeyError:
                pass
        
        try:
            try:
                return self.load_object_property(hash, prop)
            except ObjectError:
                if obj_exists:
                    raise KeyError("No property '%s' for '%s'" % (prop, hash))
                else:
                    raise
        except KeyError:
            # Default values
            if prop in ('seed', 'cancel'):
                return 0
            else:
                raise
                
    def set_value(self, hash, prop, val):
        if prop not in ('seed', 'cancel', 'date_started', 'hash'):
            raise KeyError("Property '%s' is readonly" % prop)
        self.save_object_property(hash, prop, val)
                
    def save_on_stop(self, bt):
        for hash in bt.keys():
            tdata = {
                "name": bt[hash]["name"],
                "size": bt[hash]["size"],
                "seeds": 0,
                "progress": bt[hash]["progress"],
                "speed": 0,
                "status": 0,
                "files": bt[hash]["files"]
            }
            self.save_object(hash, tdata)
        
    def describe_props(self, hash, detail_level):
        desc = {}
        for k in ('name','hash'):
            desc[k] = {'type':'string'}
        for k in ('speed', 'seeds', 'status', 'seed', 'cancel', 'date_started'):
            desc[k] = {'type':'uint32'}
        desc['size'] = {
            'type':'uint32',
            'conv':(lambda x: int(x / 1024))
        }
        desc['progress'] = {
            'type':'string',
            'conv':(lambda x: "%.2f%%" % x)
        }
        if detail_level == 0:
            desc['files'] = {
                'type':'uint32',
                'conv':(lambda x: len(x))
            }
        else:
            desc['files'] = {
                'type':'dict',
                'desc': {
                    '*': {
                        'type':'uint32',
                        'conv':(lambda x: int(x / 1024))
                    }
                }
            }
        return desc
        
                    
class BTObjectProcessor(ObjectProcessor):
    
    def __init__(self, domserver, name, objs):
        ObjectProcessor.__init__(self, domserver, name)
        self.objs = objs
        
    def get_action_names(self, obj=None):
        if obj is None:
            return []
        elif obj.is_a("download") and obj.is_a("torrent"):
            names = []
            status = obj.get_value("status")
            try:
                seed = obj.get_value("seed")
            except KeyError:
                seed = 0
            try:
                cancel = obj.get_value("cancel")
            except KeyError:
                cancel = 0
                
            if status < 4 and not cancel:
                names.append('torrent-cancel')
            if status < 5:
                names.append('torrent-resume' if status == 2 else 'torrent-pause')
                names.append('torrent-unseed' if seed else 'torrent-seed')
            if status == 6:
                names.append('torrent-clear')
                
    def describe_action(self, act):
        name = act.name
        obj = act.obj
        
        if name not in self.get_action_names(obj):
            raise ObjectError("Invalid action call")
            
        noparam = ['torrent-cancel', 'torrent-resume', 'torrent-pause', 
            'torrent-unseed', 'torrent-seed', 'torrent-clear']
        if name in noparam:
            return
        else:
            # Call act.add_param
            pass
            
    def execute_action(self, act):
        name = act.name
        obj = act.obj
        
        if name not in self.get_action_names(obj):
            raise ObjectError("Invalid action call")
            
        if name == 'seed':
            obj["seed"] = 1
        elif name == 'unseed':
            obj["seed"] = 0
        elif name == 'cancel':
            obj["cancel"] = 1
        elif name == 'clear':
            self.objs.remove_object(obj['hash'])
        elif action == 'pause':
            self.objs.bt[obj['hash']].pause()
        elif action == 'resume':
            self.objs.bt[obj['hash']].resume()
            
        return None
        
            
class BTDropCatcher(ProcessEvent):
    """CREATE event catcher for items in the torrent drop dir"""

    def __init__(self, thread):
        ProcessEvent.__init__(self)
        self.thread = thread

    def process_IN_CREATE(self, event):
        if event.name.startswith('.'):
            return
        time.sleep(1)
        while fileIsOpen(os.path.join(event.path, event.name)):
            time.sleep(1)
        self.thread.add_torrent_file(event.path, event.name)
        
        
class BTWatcherThread(Thread):
    
    def __init__(self, domserver, logger, objs, bt):
        Thread.__init__(self, domserver, logger)
        self.bt = bt
        self.objs = objs
        self.running = False
        
    def add_torrent_file(self, path, name):
        torrent = os.path.join(path, name)
        
        try:
            info = lt.torrent_info(lt.bdecode(open(torrent, 'rb').read()))
            hash = str(info.info_hash())
        except IOError:
            self.info("Error: cannot read torrent '%s'" % name)
            return
        except RuntimeError:
            self.info("Error: torrent '%s' is invalid" % name)
            os.unlink(torrent)
            return
            
        rundir = self.domserver.config['bt.run_dir']
        rtorrent = os.path.join(rundir, "%s.torrent" % hash)
        destdir = os.path.join(rundir, "%s" % hash)
        
        try:
            a = self.bt[hash]
        except KeyError:
            pass
        else:
            self.info("Torrent '%s' already downloading." % name)
            os.unlink(torrent)
            return
        
        try:
            shutil.move(torrent, rtorrent)
        except IOError:
            self.info("Error: cannot move torrent '%s'" % name)
            return
            
        os.mkdir(destdir)
        self.verbose("Adding torrent '%s' as '%s'" % (name, rtorrent))
        ret = self.bt.add_torrent(rtorrent, destdir)
        self.objs.set_value(hash, "date_started", time.time())
        self.objs.set_value(hash, "hash", hash)
        self.debug("add_torrent returned %s" % repr(ret))
        
    def initialize(self):
        self.verbose("Starting BitTorrent watcher thread")
        self.bt.start()
        
        # Restart previously running torrents
        rundir = self.domserver.config["bt.run_dir"]
        for r, d, files in os.walk(rundir):
            for f in files:
                if f.endswith(".torrent"):
                    hash = f.split(".", 1)[0]
                    destdir = os.path.join(rundir, hash)
                    if os.path.isdir(destdir):
                        self.verbose("Restarting torrent '%s'" % hash)
                        self.bt.add_torrent(os.path.join(rundir, f), destdir)
            d[0:len(d)] = []
            
        # Add existing torrents in DROP directory
        dropdir = self.domserver.config["bt.drop_dir"]
        for r, d, files in os.walk(dropdir):
            for f in files:
                self.add_torrent_file(dropdir, f)
            d[0:len(d)] = []
        
        self.wm = WatchManager()
        self.ntf = ThreadedNotifier(self.wm, BTDropCatcher(self))
        self.ntf.start()
        self.watch = self.wm.add_watch(
            self.domserver.config['bt.drop_dir'],
            EventsCodes.OP_FLAGS['IN_CREATE'],
            rec = False
        )
        
    
    def cleanup(self):
        self.verbose("Stopping BitTorrent watcher thread...")
        self.ntf.stop()
        self.bt.stop(self.objs.save_on_stop)
        self.verbose("BitTorrent watcher thread stopped")
        
    def check_finished(self):
        for hash in self.bt.keys():
            try:
                seed = self.objs.get_value(hash, "seed")
            except KeyError:
                seed = 0
            if seed == 0 and self.bt[hash]['status'] == 4:
                self.bt[hash].pause()
                
                # Set finishing status
                self.verbose("Moving torrent '%s'..." % hash)
                d = {
                    "name": self.bt[hash]["name"],
                    "size": self.bt[hash]["size"],
                    "seeds": self.bt[hash]["seeds"],
                    "progress": self.bt[hash]["progress"],
                    "speed": 0,
                    "status": 5,
                    "files": self.bt[hash]["files"],
                }
                self.objs.save_object(hash, d)
                
                # Remove torrent
                self.bt.del_torrent(hash)
                
                # Remove .torrent file
                rundir = self.domserver.config['bt.run_dir']
                tfile = os.path.join(rundir, "%s.torrent" % hash)
                os.unlink(tfile)
                
                # Move to lobby
                dldir = os.path.join(rundir, hash)
                lobby = self.domserver.config['media.lobby_dir']
                for r, dirs, files in os.walk(dldir):
                    for f in dirs + files:
                        orig = os.path.join(dldir, f)
                        dest = os.path.join(lobby, f)
                        shutil.move(orig, dest)
                    dirs[0:len(dirs)] = []
                shutil.rmtree(dldir)
                
                # Set finished status
                self.verbose("Finished torrent '%s'" % hash)
                self.objs.save_object(hash, {"status": 6})
                
    def check_canceled(self):
        for hash in self.bt.keys():
            try:
                cancel = self.objs.get_value(hash, "cancel")
            except KeyError:
                cancel = 0
            if cancel and self.objs.get_value(hash, "status") < 4:
                self.bt[hash].pause()
                self.bt.del_torrent(hash)
                while hash in self.bt.keys():
                    time.sleep(0.2)
                rundir = self.domserver.config['bt.run_dir']
                os.unlink(os.path.join(rundir, "%s.torrent" % hash))
                shutil.rmtree(os.path.join(rundir, hash))
                self.objs.remove_object(hash)
                self.verbose("Torrent '%s' canceled" % hash)
        
    def domserver_run(self):
        self.initialize()
        
        self.running = True
        while self.running:
            time.sleep(1)
            try:
                self.check_finished()
                self.check_canceled()
            except Exception, e:
                self.log_exception(e)
                break
            
        self.cleanup()
        
    def stop(self):
        self.running = False
        

class BitTorrentHelper:

    def __init__(self, domserver):
        self.reset()
        self.domserver = domserver
        self.domserver.info("Initializing bittorrent helper")
        self.logger = domserver.get_logger('bt.log_file', 'bt.log_level')
        self.bt = BitTorrent(self.domserver, self.logger)
        
        self.objs = BTObjectProvider(self.domserver, self.bt)
        self.proc = BTObjectProcessor(self.domserver, 'bt', self.objs)
        domserver.register_object_interface(
            name='bt',
            provider=self.objs,
            processor=self.proc
        )
    
        self.config_changed(self.domserver.config['bt.enabled'])
        self.domserver.config.register_callback('bt.enabled', self.config_changed)
            
    def __del__(self):
        self.disable()
        
    def config_changed(self, value):
        if int(value):
            self.enable()
        else:
            self.disable()
                
    def reset(self):
        self._thread = None
        self._tid = None
        
    def enable(self):
        self._thread = BTWatcherThread(self.domserver,self.logger,self.objs,self.bt)
        self._tid = self.domserver.add_thread(self._thread, True)
    
    def disable(self):
        if self._tid is not None:
            self.domserver.remove_thread(self._tid)
        self.reset()
        
