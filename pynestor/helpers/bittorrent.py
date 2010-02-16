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

import libtorrent as lt
import os
import os.path
from pyinotify import WatchManager, ThreadedNotifier, ProcessEvent, EventsCodes
import shutil
import tempfile
import time
import urllib

from ..errors import ObjectError
from ..thread import Thread
from ..objects import ObjectProvider, ObjectProcessor, ObjectWrapper
from ..utils import fileIsOpen

class DictTorrent:
    def __init__(self, logger, handle, bt):
        self.log = logger
        self.h = handle
        self.bt = bt
        
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
        elif key == 'done':
            return self.h.status().total_wanted_done
        elif key == 'seeds':
            return self.h.status().num_seeds
        elif key == 'progress':
            size = self.h.status().total_wanted
            done = self.h.status().total_wanted_done
            if size == 0:
                return 0.0
            else:
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
                           'allocating', '2'):
                return 1
            elif state == 'downloading':
                return 3
            elif state == 'seeding':
                return 4
            else:
                self.log.debug("Unknown status : %s, %s" % (repr(pause), state))
        elif key == 'files':
            try:
                info = self.h.get_torrent_info()
            except RuntimeError:
                # Torrent metadata not yet downloaded
                return []
            ret = {}
            for f in info.files():
                ret[f.path] = f.size
            return ret
        elif key == 'magnet-uri':
            return self.bt.get_magnet_uri(self.h)
        else:
            raise KeyError("DictTorrent has no item named '%s'" % key)
            
    def keys(self):
        return ['name', 'size', 'done', 'seeds', 'progress', 'speed', 'status', 
            'files', 'magnet-uri']
            
        
class BitTorrent:
    def __init__(self, nestor, logger):
        self.nestor = nestor
        self.log = logger
        self.s = None
        self.options = {}
        
    def is_active(self):
        return self.s
        
    def status(self):
        return self.s.status()
        
    def start(self, port):
        self.set_option("port", port)
        self.s = lt.session()
        for k in self.options.keys():
            self.set_option(k, self.options[k])
        
    def stop(self, save_callback=None):
        if self.is_active():
            self.s.pause()
            if callable(save_callback):
                save_callback(self)
            del(self.s)
            self.s = None
            
    def set_option(self, key, value):
        if self.is_active():
            if key == 'max_upload':
                self.s.set_upload_rate_limit(int(value))
            elif key == 'max_download':
                self.s.set_download_rate_limit(int(value))
            elif key == 'port':
                self.s.listen_on(int(value), int(value))
        else:
            self.options[key] = value
            
    def add_magnet(self, magnet, destdir, destdir_hash=None):
        """Add magnet URI 'magnet' for download.
        
        'destdir' is used as the save path. If 'destdir' is None, start
        downloading in a temporary folder, get the torrent hash and then move
        the save path to 'destdir_hash' % hash."""
        
        if self.is_active():
            dest = destdir or tempfile.mkdtemp('magnet')
            
            self.log.debug("Adding magnet %s, store in %s" % (magnet, dest))
            
            options = {
                'save_path': dest.encode('utf-8'),
                'storage_mode': lt.storage_mode_t.storage_mode_sparse,
                'paused': True,
                'auto_managed': True,
                'duplicate_is_error': True
            }
            handle = lt.add_magnet_uri(self.s, magnet.encode('utf-8'), options)
            
            if handle and not destdir:
                dest = destdir_hash % (str(handle.info_hash()))
                self.log.debug("Moving download to %s" % dest)
                handle.move_storage(dest.encode('utf-8'))
        
    def add_torrent(self, torrent, destdir):
        if self.is_active():
            info = lt.torrent_info(lt.bdecode(open(torrent, 'rb').read()))
            ret = self.s.add_torrent(info, destdir)
            if ret:
                return str(ret.info_hash())
                
    def get_magnet_uri(self, handle):
        magnet = "magnet:?xt=urn:btih:%s" % handle.info_hash()
        magnet += "&" + urllib.urlencode([("dn", handle.name())])
        for tr in handle.trackers():
            magnet += "&" + urllib.urlencode([("tr", tr.url)])
        return magnet
            
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
        return DictTorrent(self.log, self._get(hash), self)
    
    def keys(self):
        if self.is_active():
            return ["%s" % h.info_hash() for h in self.s.get_torrents()]
        else:
            return []
            

class BTDownloadObj(ObjectWrapper):
    
    def describe(self):
        self.types = ['download', 'torrent']
        self._props = ('name', 'hash', 'speed', 'seeds', 'status',
            'seed', 'cancel', 'date_started', 'size', 'done', 'progress',
            'magnet-uri', 'path')
        self._files = []
        
        try:
            self.provider.bt[self.oid]
            found_active = 1
            self._files = self.provider.bt[self.oid]['files']
        except KeyError:
            found_active = 0
        
        for p in self._props:
            if found_active and p in self.provider.bt[self.oid].keys():
                self.props[p] = self.provider.bt[self.oid][p]
            else:
                try:
                    val = self.provider.load_object_property(self.oid, p)
                except KeyError:
                    if p in ('seed', 'cancel', 'date_started'):
                        val = 0
                    else:
                        val = ''
                self.props[p] = val

    def update(self):
        try:
            self.provider.bt[self.oid]
            found_active = 1
        except KeyError:
            found_active = 0
        
        proplist = ['speed', 'seeds', 'status', 'cancel', 'seed', 'done',
            'progress', 'path']
        if found_active and len(self._files) == 0:
            # Torrent metadata was not available last time, retry now
            self._files = self.provider.bt[self.oid]['files']
            proplist.extend(['size', 'name'])
            
        for p in proplist:
            if found_active and p in self.provider.bt[self.oid].keys():
                self.props[p] = self.provider.bt[self.oid][p]
            else:
                try:
                    val = self.provider.load_object_property(self.oid, p)
                except KeyError:
                    if p in ('seed', 'cancel', 'date_started'):
                        val = 0
                    else:
                        val = ''
                self.props[p] = val
                        
    def set_value(self, key, value):
        if key in ('seed', 'cancel', 'hash', 'date_started'):
            self.props[key] = value
            self.provider.save_object_property(self.oid, key, value)
        else:
            raise KeyError("Cannot write to BTDownloadObj['%s']" % key)
            
            
class BitTorrentObj(ObjectWrapper):

    def describe(self):
        self.types = ['bt-app']
        self.update()
    
    def update(self):
        bt = self.provider.bt
        self.props['active'] = int(bt.is_active() is not None)
        self.props['dl_files'] = len(bt.keys())
        if bt.is_active():
            self.props['dl_speed'] = int(bt.status().download_rate)
            self.props['ul_speed'] = int(bt.status().upload_rate)
        else:
            self.props['dl_speed'] = 0
            self.props['ul_speed'] = 0
        
    def set_value(self, key, value):
        raise KeyError("Cannot write to BittorrentObj['%s']" % key)
        
            
class BTObjectProvider(ObjectProvider):

    def __init__(self, nestor, bt):
        ObjectProvider.__init__(self, nestor, 'bt')
        self.bt = bt
                
    def save_on_stop(self, bt):
        for hash in bt.keys():
            tdata = {
                "magnet-uri": bt[hash]["magnet-uri"],
                "name": bt[hash]["name"],
                "size": bt[hash]["size"],
                "done": bt[hash]["done"],
                "seeds": 0,
                "progress": bt[hash]["progress"],
                "speed": 0,
                "status": 0
            }
            self.save_object(hash, tdata)
        
    def get_oids(self):
        oids = ['']
        oids.extend(self.bt.keys())
        oids.extend([h for h in self.list_objects() if h not in oids])
        return oids
        
    def get_object(self, oid):
        if oid == '':
            return BitTorrentObj(self.nestor, self, '')
        else:
            return BTDownloadObj(self.nestor, self, oid)
        
                    
class BTObjectProcessor(ObjectProcessor):
    
    def __init__(self, nestor, name, objs):
        ObjectProcessor.__init__(self, nestor, name)
        self.objs = objs
        
    def get_actions(self, obj=None):
        names = []
        
        if obj.is_a("bt-app"):
            names.extend(['bt-clear-finished', 'bt-download-magnet'])
            
        if obj.is_a("download") and obj.is_a("torrent"):
            status = obj["status"]
            try:
                seed = obj["seed"]
            except KeyError:
                seed = 0
            try:
                cancel = obj["cancel"]
            except KeyError:
                cancel = 0
                
            if status < 4 and not cancel:
                names.append('torrent-cancel')
            if status < 5:
                names.append('torrent-resume' if status == 2 else 'torrent-pause')
                names.append('torrent-unseed' if seed else 'torrent-seed')
            if status == 6:
                names.append('torrent-clear')
                
        return names
                
    def describe(self, act):
        name = act.name
        obj = act.obj
            
        noparam = ['torrent-cancel', 'torrent-resume', 'torrent-pause', 
            'torrent-unseed', 'torrent-seed', 'torrent-clear',
            'bt-clear-finished']
        if name in noparam:
            return
        else:
            if name == 'bt-download-magnet':
                act.add_param('magnet-link')
            
    def execute(self, act):
        name = act.name
        obj = act.obj
            
        if name == 'torrent-seed':
            obj["seed"] = 1
        elif name == 'torrent-unseed':
            obj["seed"] = 0
        elif name == 'torrent-cancel':
            obj["cancel"] = 1
        elif name == 'torrent-clear':
            self.objs.cache.remove("bt:%s" % obj.oid)
            self.objs.remove_object(obj.oid)
        elif name == 'torrent-pause':
            self.objs.bt[obj['hash']].pause()
        elif name == 'torrent-resume':
            self.objs.bt[obj['hash']].resume()
        elif name == 'bt-clear-finished':
            hashes = self.objs.list_objects()
            for h in hashes:
                if self.objs.load_object_property(h, 'status') == 6:
                    self.objs.cache.remove("bt:%s" % h)
                    self.objs.remove_object(h)
        elif name == 'bt-download-magnet':
            ddir = os.path.join(self.nestor.config['bt.run_dir'], '%s')
            self.objs.bt.add_magnet(act['magnet-link'], None, ddir)
        return None
        
            
class BTDropCatcher(ProcessEvent):
    """CREATE event catcher for items in the torrent drop dir"""

    def __init__(self, thread):
        ProcessEvent.__init__(self)
        self.thread = thread

    def process_IN_CREATE(self, event):
        time.sleep(1)
        while fileIsOpen(os.path.join(event.path, event.name)):
            time.sleep(1)
        self.thread.add_torrent_file(event.path, event.name)
        
        
class BTWatcherThread(Thread):
    
    def __init__(self, nestor, logger, objs, bt):
        Thread.__init__(self, nestor, logger)
        self.bt = bt
        self.objs = objs
        self.running = False
        
    def add_torrent_file(self, path, name):
        torrent = os.path.join(path, name)
        
        if name.startswith("."):
            try:
                os.unlink(torrent)
            except:
                pass
            return
        
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
            
        rundir = self.nestor.config['bt.run_dir']
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
        self.verbose("Adding torrent '%s'" % name)
        ret = self.bt.add_torrent(rtorrent, destdir)
        if ret:
            self.debug("add_torrent returned %r" % ret)
            obj = self.objs.get(ret)
            obj["date_started"] =  time.time()
            obj["hash"] = ret
            os.unlink(rtorrent)
        else:
            self.debug("add_torrent failed")
            
        
    def initialize(self):
        self.verbose("Starting BitTorrent watcher thread")
        self.bt.start(self.nestor.config['bt.port'])
        
        # Restart previously running torrents
        rundir = self.nestor.config["bt.run_dir"]
        for o in self.objs.list_objects():
            op = self.objs.load_object(o)
            if op['status'] == 0:
                destdir = os.path.join(rundir, op['hash'])
                self.bt.add_magnet(op['magnet-uri'], destdir)
            
        # Add existing torrents in DROP directory
        dropdir = self.nestor.config["bt.drop_dir"]
        for r, d, files in os.walk(dropdir):
            for f in files:
                self.add_torrent_file(dropdir, f)
            d[0:len(d)] = []
        
        self.wm = WatchManager()
        self.ntf = ThreadedNotifier(self.wm, BTDropCatcher(self))
        self.ntf.start()
        self.watch = self.wm.add_watch(
            self.nestor.config['bt.drop_dir'],
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
            obj = self.objs.get(hash)
            seed = obj["seed"]
            
            if seed == 0 and obj['status'] == 4:
                self.bt[hash].pause()
                
                # Set finishing status
                self.verbose("Moving torrent '%s'..." % hash)
                d = {
                    "name": self.bt[hash]["name"],
                    "size": self.bt[hash]["size"],
                    "done": self.bt[hash]["done"],
                    "seeds": self.bt[hash]["seeds"],
                    "progress": self.bt[hash]["progress"],
                    "speed": 0,
                    "status": 5,
                }
                self.objs.save_object(hash, d)
                
                # Remove torrent
                self.bt.del_torrent(hash)
                
                # Move to lobby
                rundir = self.nestor.config['bt.run_dir']
                dldir = os.path.join(rundir, hash)
                lobby = self.nestor.config['media.lobby_dir']
                destdir = os.path.join(lobby, d["name"])
                shutil.move(dldir, destdir)
                
                # Set finished status and send notification
                self.verbose("Finished torrent '%s'" % hash)
                self.objs.save_object(hash, {"status": 6, "path": destdir})
                self.nestor.notify("download-finished", "bt:%s" % hash)
                
    def check_canceled(self):
        for hash in self.bt.keys():
            obj = self.objs.get(hash)
            cancel = obj["cancel"]
            if cancel and obj["status"] < 4:
                self.bt[hash].pause()
                self.bt.del_torrent(hash)
                while hash in self.bt.keys():
                    time.sleep(0.2)
                rundir = self.nestor.config['bt.run_dir']
                shutil.rmtree(os.path.join(rundir, hash))
                self.objs.remove_object(hash)
                self.objs.cache.remove("bt:%s" % hash)
                self.verbose("Torrent '%s' canceled" % hash)
        
    def nestor_run(self):
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

    def __init__(self, nestor):
        self.reset()
        self.nestor = nestor
        self.nestor.info("Initializing bittorrent helper")
        self.logger = nestor.get_logger('bt.log_file', 'bt.log_level')
        self.bt = BitTorrent(self.nestor, self.logger)
        
        self.objs = BTObjectProvider(self.nestor, self.bt)
        self.proc = BTObjectProcessor(self.nestor, 'bt', self.objs)
        nestor.register_object_interface(
            name='bt',
            provider=self.objs,
            processor=self.proc
        )
    
        self.confkeys = ['enabled', 'max_upload', 'max_download']
        for ck in self.confkeys:
            self.config_changed(ck, self.nestor.config['bt.%s' % ck])
            self.nestor.config.register_callback(
                'bt.%s' % ck,
                self._make_config_changed(ck)
            )
            
    def __del__(self):
        self.disable()
        
    def _make_config_changed(self, key):
        return lambda v:self.config_changed(key, v)
        
    def config_changed(self, key, value):
        if key == 'enabled':
            if int(value):
                self.enable()
            else:
                self.disable()
        elif key in ['max_upload', 'max_download']:
            self.bt.set_option(key, int(value) * 1024)
                
    def reset(self):
        self._thread = None
        self._tid = None
        
    def enable(self):
        self._thread = BTWatcherThread(self.nestor, self.logger, self.objs,
            self.bt)
        self._tid = self.nestor.add_thread(self._thread, True)
    
    def disable(self):
        if self._tid is not None:
            self.nestor.remove_thread(self._tid)
        self.reset()
        
    def restart(self):
        self.disable()
        self.enable()
        
