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

import hashlib
import os
import StringIO
import time
import threading
from amule import AmuleClient, ECConnectionError

from ..errors import ObjectError
from ..objects import ObjectProvider, ObjectProcessor, ObjectWrapper
from ..runwatcherthread import RunWatcherThread


class DictDownload:

    def __init__(self, nestor, amule, hash):
        self.nestor = nestor
        self.am = amule
        self.hash = hash
        
    def pause(self):
        try:
            return self.am.client.partfile_pause([self.hash])
        except ValueError:
            return False
    
    def resume(self):
        try:
            return self.am.client.partfile_resume([self.hash])
        except ValueError:
            return False
            
    def cancel(self):
        try:
            return self.am.client.partfile_delete([self.hash])
        except ValueError:
            return False
        
    def __getitem__(self, key):
        self.am._update()
        if key in ('name', 'size', 'speed'):
            return self.am.downloads[self.hash][key]
        elif key == 'done':
            return self.am.downloads[self.hash]['size_done']
        elif key == 'status':
            stopped = self.am.downloads[self.hash].get('stopped', False)
            status = self.am.downloads[self.hash]['status']
            size = self.am.downloads[self.hash]['size']
            done = self.am.downloads[self.hash]['size_done']
            seeds_xfer = self.am.downloads[self.hash]['src_count_xfer']
            if stopped:
                return 0
            elif status == 7:
                return 2
            elif seeds_xfer > 0:
                return 3
            elif size == done:
                return 5
            else:
                return 1
        elif key == 'seeds':
            return self.am.downloads[self.hash]['src_count']
        elif key == 'progress':
            size = self.am.downloads[self.hash]['size']
            done = self.am.downloads[self.hash]['size_done']
            if size == 0:
                return 0.0
            else:
                return 100.0 * float(done) / float(size)
        elif key == 'hash':
            return self.hash
        else:
            raise KeyError("DictDownload has no item named '%s'" % key)
            
    def keys(self):
        if self.am.connected:
            return ['name', 'size', 'done', 'speed', 'status', 'seeds',
                'progress', 'hash']
        else:
            return []
            
            
class DictResult:

    def __init__(self, nestor, amule, hash):
        self.nestor = nestor
        self.am = amule
        self.hash = hash
        
    def download(self):
        try:
            ret = self.am.client.download_search_results([self.hash])
        except ValueError:
            return False
            
        if ret:
            self.am.objs.save_object("download|%s" % self.hash,
                {"date_started": time.time()})
        return ret
        
    def __getitem__(self, key):
        self.am._update()
        if key in ('name', 'size'):
            return self.am.results[self.hash][key]
        elif key == 'seeds':
            return self.am.results[self.hash]['src_count']
        elif key == 'downloading':
            return int(self.hash in self.am.downloads)
        elif key == 'hash':
            return self.hash
        else:
            raise KeyError("DictResult has no item named '%s'" % key)
            
    def keys(self):
        if self.am.connected:
            return ['name', 'size', 'seeds', 'downloading', 'hash']
        else:
            return []
            
            
class Amule:

    def __init__(self, nestor, logger):
        self.nestor = nestor
        self.log = logger
        self.connected = False
        self.client = AmuleClient()
        self.objs = None
        self.last_updated = 0
        self.downloads = {}
        self.results = {}
        self.status = {}
        self.lock = threading.Condition(threading.Lock())
        
    def register_object_provider(self, objs):
        self.objs = objs
    
    def connect(self):
        if not self.connected:
            try:
                self.client.connect(
                    'localhost',
                    int(self.nestor.config['amule.ec_port']),
                    self.nestor.config['amule.ec_password'],
                    'nestor',
                    'TODOversion'
                )
            except ECConnectionError, e:
                self.log.info("Could not connect to amule - <%s>" % e)
                self.connected = False
            else:
                self.log.info("Connected to amule")
                self.connected = True
            
    def disconnect(self):
        if self.connected:
            self.objs.save_on_stop()
            self.client.disconnect()
            self.connected = False
            
    def __getitem__(self, key):
        if self.connected:
            self._update()
            kind, hash = key.split("|", 1)
            if kind == 'download':
                if hash in self.downloads:
                    return DictDownload(self.nestor, self, hash)
            elif kind == 'result':
                if hash in self.results:
                    return DictResult(self.nestor, self, hash)
        raise KeyError(key)
            
    def _update(self):
        interval = int(self.nestor.config['amule.update_interval'])
        self.lock.acquire()
        try:
            if self.last_updated + interval < time.time():
                self.downloads = self.client.get_download_list()
                self.results = self.client.get_search_results()
                self.status = self.client.get_server_status()
                self.last_updated = time.time()
        finally:
            self.lock.release()
            
    def keys(self):
        if self.connected:
            self._update()
            d = ["download|%s" % h for h in self.downloads]
            r = ["result|%s" % h for h in self.results]
            return d + r
        else:
            return []
            
            
class AmuleDownloadObj(ObjectWrapper):

    def describe(self):
        self.types = ['download', 'amule-partfile']
        self._props = ('name', 'hash', 'speed', 'seeds', 'status', 'size',
            'done', 'progress', 'date_started', 'path')
        
        am = self.provider.am
        try:
            amdl = am[self.oid]
        except KeyError:
            amdl = None
        
        for p in self._props:
            if amdl and p in amdl.keys():
                self.props[p] = amdl[p]
            else:
                try:
                    val = self.provider.load_object_property(self.oid, p)
                except KeyError:
                    if p in ('date_started', 'seeds', 'status', 'size', 'done',
                        'progress', 'speed'):
                        val = 0
                    elif p == 'name':
                        val = '(waiting for metadata)'
                    else:
                        val = ''
                self.props[p] = val
    
    def update(self):
        am = self.provider.am
        try:
            amdl = am[self.oid]
        except KeyError:
            amdl = None
        
        proplist = ('speed', 'seeds', 'status', 'progress', 'done', 'path')
        if self.props['name'] == '(waiting for metadata)':
            proplist = self._props
        
        for p in proplist:
            if amdl and p in amdl.keys():
                self.props[p] = amdl[p]
            else:
                try:
                    val = self.provider.load_object_property(self.oid, p)
                except KeyError:
                    if p in ('date_started', 'seeds', 'status', 'size', 'done',
                        'progress', 'speed'):
                        val = 0
                    elif p == 'name':
                        val = '(waiting for metadata)'
                    else:
                        val = ''
                self.props[p] = val
                
    def set_value(self, key, value):
        raise KeyError("Cannot write to AmuleDownloadObj['%s']" % key)
        
        
class AmuleResultObj(ObjectWrapper):

    def describe(self):
        self.types = ['result', 'amule-result']
        self._props = ('name', 'hash', 'size', 'seeds', 'downloading')
    
        for p in self._props:
            self.props[p] = self.provider.am[self.oid][p]
        self.props["name"] = self.props["name"].decode("utf-8")
    
    def update(self):
        for p in ('size', 'seeds', 'downloading'):
            self.props[p] = self.provider.am[self.oid][p]
    
    def set_value(self, key, value):
        raise KeyError("Cannot write to AmuleResultObj['%s']" % key)
            
            
class AmuleObj(ObjectWrapper):

    def describe(self):
        self.types = ['amule-app']
        self._props = ('active', 'dl_speed', 'dl_files', 'ul_speed',
            'ed2k_users', 'ed2k_files', 'kad_users', 'kad_files')
        self.update()
    
    def update(self):
        am = self.provider.am
        am._update()
        
        for p in self._props:
            if am.connected:
                if p == 'active':
                    self.props[p] = 1
                elif p == 'dl_files':
                    self.props[p] = len(am.downloads.keys())
                else:
                    try:
                        self.props[p] = int(am.status[p])
                    except KeyError:
                        self.props[p] = 0
            else:
                self.props[p] = 0
        
    def set_value(self, key, value):
        raise KeyError("Cannot write to AmuleObj['%s']" % key)
        
        
class AmuleObjectProvider(ObjectProvider):
    """Object provider for amule. Provides access to downloads and search
    results with two kinds of objects: 'amule:download|<hash>' and
    'amule:result|<hash>'.
    """

    def __init__(self, nestor, am):
        ObjectProvider.__init__(self, nestor, 'amule')
        self.am = am
        am.register_object_provider(self)
        nestor.register_notification("amule-finished", self.finish_download)
                
    def save_on_stop(self):
        for oid in self.am.keys():
            if oid.startswith('download|'):
                data = {
                    "hash": self.am[oid]["hash"],
                    "name": self.am[oid]["name"],
                    "size": self.am[oid]["size"],
                    "done": self.am[oid]["done"],
                    "seeds": 0,
                    "progress": self.am[oid]["progress"],
                    "speed": 0,
                    "status": 0
                }
                self.save_object(oid, data)
        
    def get_oids(self):
        oids = ['']
        oids.extend(self.am.keys())
        oids.extend([h for h in self.list_objects() if h not in oids])
        return oids
        
    def get_object(self, oid):
        if oid == '':
            return AmuleObj(self.nestor, self, '')
        else:
            kind, desc = oid.split('|', 1)
            if kind == 'download':
                return AmuleDownloadObj(self.nestor, self, oid)
            elif kind == 'result':
                return AmuleResultObj(self.nestor, self, oid)
                
    def finish_download(self, notif):
        """Finish a download
        
        Called when an 'amule-finished' notification is received.
        """
        
        if notif.objref.startswith("amule:download|"):
            oid = notif.objref[len("amule:"):]
            hash = notif.objref[len("amule:download|"):]
            
            # Save finishing status
            self.save_object(oid, {
                "hash": hash,
                "name": self.am[oid]["name"],
                "size": self.am[oid]["size"],
                "done": self.am[oid]["size"],
                "seeds": 0,
                "progress": 100,
                "speed": 0,
                "status": 5
            })
            
            # Move file to lobby
            rundir = self.nestor.config['amule.finished_dir']
            dlpath = os.path.join(rundir, self.am[oid]["name"])
            lobby = self.nestor.config["media.lobby_dir"]
            destpath = os.path.join(lobby, d.am[oid]["name"])
            shutil.move(dlpath, destpath)
                
            # Set finished status and send notification
            self.verbose("Finished amule file '%s'" % self.am[oid]["name"])
            self.objs.save_object(oid, {"status": 6, "path": destpath})
            self.nestor.notify("download-finished", notif.objref)
        
        
class AmuleObjectProcessor(ObjectProcessor):

    def __init__(self, nestor, name, objs):
        ObjectProcessor.__init__(self, nestor, name)
        self.objs = objs
        
    def get_actions(self, obj=None):
        names = []
        
        if obj.is_a("amule-partfile"):
            status = obj["status"]
            if status < 4:
                names.append('partfile-cancel')
            if status > 0 and status < 5:
                names.append('partfile-pause' if status != 2 else 'partfile-resume')
            if status == 6:
                names.append('partfile-clear')
                
        if obj.is_a('amule-result'):
            if obj['downloading'] < 1:
                names.append('result-download')
                
        if obj.is_a('amule-app'):
            if obj['active']:
                names.extend(['amule-search', 'amule-download-ed2k'])
            
        return names
        
    def describe(self, act):
        name = act.name
        obj = act.obj
        
        if name == 'amule-search':
            act.add_param('query')
            act.add_param('search-type')
            act.add_param('file-type')
            act.add_param('min-size', True)
            act.add_param('max-size', True)
            act.add_param('avail', True)
            act.add_param('file-ext', True)
        if name == 'amule-download-ed2k':
            act.add_param('ed2k-link')
        
    def execute(self, act):
        name = act.name
        obj = act.obj
        
        if name.startswith("partfile-"):
            pf = self.objs.am[obj.oid]
            if name == 'partfile-cancel':
                pf.cancel()
                self.objs.remove_object(obj.oid)
                self.objs.cache.invalidate(obj)
            elif name == 'partfile-pause':
                pf.pause()
            elif name == 'partfile-resume':
                pf.resume()
            elif name == 'partfile-clear':
                self.objs.remove_object(obj.oid)
                self.objs.cache.invalidate(obj)
        elif name == 'result-download':
            rs = self.objs.am[obj.oid]
            rs.download()
        elif name == 'amule-search':
            ors = ["amule:result|%s" % h for h in self.objs.am.results.keys()]
            for objref in ors:
                self.objs.cache.remove(objref)
                
            ac = self.objs.am.client
            ac.search_start(act['query'], act['search-type'], act['min-size'],
                act['max-size'], act['file-type'], act['avail'],
                act['file-ext'])
        elif name == 'amule-download-ed2k':
            ac = self.objs.am.client
            am.download_ed2klinks([act['ed2k-link']])
        
        
class AmuleRunWatcherThread(RunWatcherThread):

    def __init__(self, am, nestor, logger, command, **kwargs):
        RunWatcherThread.__init__(self, nestor, logger, command, **kwargs)
        self.am = am
        
    def on_start(self):
        delay = int(self.nestor.config['amule.ec_delay'])
        self.verbose("RunWatcher: waiting %d seconds before connecting..." % delay)
        time.sleep(delay)
        self.am.connect()
            
    def on_kill(self):
        if self.am.connected:
            self.info("RunWatcher: disconnecting from amule")
            self.am.disconnect()
            
    def on_check(self):
        if not self.am.connected:
            self.info("RunWatcher: retrying connection to amule...")
            self.am.connect()
    
    
class AmuleHelper:

    def __init__(self, nestor):
        self._reset()
        self.nestor = nestor
        self.nestor.info("Initializing amule helper")
        self.logger = nestor.get_logger('amule.log_file', 'amule.log_level')
        
        self.amule = Amule(self.nestor, self.logger)
        
        self.objs = AmuleObjectProvider(nestor, self.amule)
        self.proc = AmuleObjectProcessor(nestor, 'amule', self.objs)
        
        nestor.register_object_interface(
            name='amule',
            provider=self.objs,
            processor=self.proc
        )
        
        self.update_amule_config()
        self.config_changed(nestor.config['amule.enabled'])
        
        nestor.config.register_callback('amule.enabled', self.config_changed)
        
    def _reset(self):
        self._rw_thread = None
        self._rw_tid = None
        
    def config_changed(self, value):
        if int(value):
            self.enable()
        else:
            self.disable()
        
    def enable(self):
        self._rw_thread = AmuleRunWatcherThread(
            self.amule,
            self.nestor,
            self.logger,
            '/usr/share/amule/amuled_home_wrapper.sh',
            pidof = 'amuled',
            kill = True,
            user = 'amule'
        )
        self._rw_tid = self.nestor.add_thread(self._rw_thread, True)
    
    def disable(self):
        if self._rw_tid is not None:
            self.nestor.remove_thread(self._rw_tid)
        self._reset()
        
    def update_amule_config(self):
        acfile = os.path.join(self.nestor.config["amule.amule_dir"],
                                "amule.conf")
        ec_password = self.nestor.config["amule.ec_password"]
        webhost = self.nestor.config["web.host"]
        webport = int(self.nestor.config["web.port"])
        if webhost == '':
            webhost = 'localhost'
        notifurl = "http://%s:%d/obj/notify/amule-finished" % (webhost, webport)
        settings = {
            "[eMule]": {
                "Port": self.nestor.config["amule.tcp_port"],
                "UDPPort": self.nestor.config["amule.udp_port"],
                "MaxUpload": self.nestor.config["amule.max_upload"],
                "MaxDownload": self.nestor.config["amule.max_download"],
                "IncomingDir": self.nestor.config["amule.finished_dir"]
            },
            "[ExternalConnect]": {
                "AcceptExternalConnections": 1,
                "ECPort": self.nestor.config["amule.ec_port"],
                "ECPassword": hashlib.md5(ec_password).hexdigest()
            },
            "[UserEvents/DownloadCompleted]": {
                "CoreEnabled": 1,
                "CoreCommand": 'wget -O- %s/amule:download|%%HASH' % notifurl
            }
        }

        acfp = open(acfile, "r")
        config = acfp.read().split("\n")
        acfp.close()

        cursection = ""
        newconfig = []
        for cline in config:
            if cline.startswith("["):
                cursection = cline
            else:
                option = cline.split("=")[0]
                try:
                    cline = "%s=%s" % (option, settings[cursection][option])
                except KeyError:
                    pass
            newconfig.append(cline)

        acfp = open(acfile, "w")
        acfp.write("\n".join(newconfig))
        acfp.close()
        
