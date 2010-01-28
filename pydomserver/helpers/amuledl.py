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

import hashlib
import os
import StringIO
import time
from amule import AmuleClient, ECConnectionError

from ..errors import ObjectError
from ..objects import ObjectProvider, ObjectProcessor, ObjectWrapper
from ..runwatcherthread import RunWatcherThread
from ..socketinterfacecodes import SIC


class DictDownload:

    def __init__(self, domserver, amule, hash):
        self.domserver = domserver
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
            return done / size * 100.0 if size > 0 else 0
        elif key == 'hash':
            return self.hash
        else:
            raise KeyError("DictDownload has no item named '%s'" % key)
            
    def keys(self):
        return ['name', 'size', 'speed', 'status', 'seeds', 'progress', 'hash']
            
            
class DictResult:

    def __init__(self, domserver, amule, hash):
        self.domserver = domserver
        self.am = amule
        self.hash = hash
        
    def download(self):
        try:
            ret = self.am.client.download_search_results([self.hash])
        except ValueError:
            return False
            
        if ret:
            self.am.objs.save_object("download/%s" % self.hash,
                {"date_started": time.time()})
        return ret
        
    def __getitem__(self, key):
        self.am._update()
        if key in ('name', 'size'):
            return self.am.results[self.hash][key]
        elif key == 'seeds':
            return self.am.results[self.hash]['src_count']
        elif key == 'downloading':
            return self.am.results[self.hash]['src_count_xfer']
        elif key == 'hash':
            return self.hash
        else:
            raise KeyError("DictResult has no item named '%s'" % key)
            
    def keys(self):
        return ['name', 'size', 'seeds', 'downloading', 'hash']
            
            
class Amule:

    def __init__(self, domserver, logger):
        self.domserver = domserver
        self.log = logger
        self.connected = False
        self.client = AmuleClient()
        self.objs = None
        self.last_updated = 0
        self.downloads = {}
        self.results = {}
        self.status = {}
        
    def register_object_provider(self, objs):
        self.objs = objs
    
    def connect(self):
        try:
            self.client.connect(
                'localhost',
                int(self.domserver.config['amule.ec_port']),
                self.domserver.config['amule.ec_password'],
                'domserver',
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
        kind, hash = key.split("/", 1)
        if kind == 'download':
            return DictDownload(self.domserver, self, hash)
        elif kind == 'result':
            return DictResult(self.domserver, self, hash)
            
    def _update(self):
        interval = int(self.domserver.config['amule.update_interval'])
        if self.last_updated + interval < time.time():
            self.downloads = self.client.get_download_list()
            self.results = self.client.get_search_results()
            self.status = self.client.get_server_status()
            self.last_updated = time.time()
            
    def keys(self):
        if self.connected:
            self._update()
            d = ["download/%s" % h for h in self.downloads.keys()]
            r = ["result/%s" % h for h in self.results.keys()]
            return d + r
        else:
            return []
            
            
class AmuleDownloadObj(ObjectWrapper):

    def describe(self):
        self.types = ['download', 'amule-partfile']
        self.prop_desc = {
            'name':         {'lod': SIC.LOD_BASIC,      'type': 'string'},
            'hash':         {'lod': SIC.LOD_BASIC + 1,  'type': 'string'},
            'speed':        {'lod': SIC.LOD_BASIC + 1,  'type': 'uint32'},
            'seeds':        {'lod': SIC.LOD_BASIC + 1,  'type': 'uint32'},
            'status':       {'lod': SIC.LOD_BASIC + 1,  'type': 'uint32'},
            'size':         {'lod': SIC.LOD_BASIC + 1,  'type': 'uint32'},
            'progress':     {'lod': SIC.LOD_BASIC + 1,  'type': 'string'},
            'date_started': {'lod': SIC.LOD_BASIC + 1,  'type': 'uint32'}
        }
        
        self.prop_desc['size']['conv'] = lambda x: int(x / 1024)
        self.prop_desc['progress']['conv'] = lambda x: "%.2f%%" % x
        
        am = self.provider.am
        try:
            am[self.oid]
            found_active = 1
        except KeyError:
            found_active = 0
        
        for p in self.prop_desc:
            if found_active and p in am[self.oid].keys():
                self.props[p] = am[self.oid][p]
            else:
                try:
                    val = self.provider.load_object_property(self.oid, p)
                except KeyError:
                    if p in ('date_started'):
                        val = 0
                    else:
                        val = ''
                self.props[p] = val
    
    def update(self):
        am = self.provider.am
        try:
            am[self.oid]
            found_active = 1
        except KeyError:
            found_active = 0
        
        for p in ('speed', 'seeds', 'status', 'progress'):
            if found_active and p in am[self.oid].keys():
                self.props[p] = am[self.oid][p]
            else:
                try:
                    val = self.provider.load_object_property(self.oid, p)
                except KeyError:
                    if p in ('date_started'):
                        val = 0
                    else:
                        val = ''
                self.props[p] = val
                
    def set_value(self, key, value):
        raise KeyError("Cannot write to AmuleDownloadObj['%s']" % key)
        
        
class AmuleResultObj(ObjectWrapper):

    def describe(self):
        self.types = ['result', 'amule-result']
        self.prop_desc = {
            'name': {'lod': SIC.LOD_BASIC, 'type': 'string'},
            'hash': {'lod': SIC.LOD_BASIC, 'type': 'string'},
            'size': {'lod': SIC.LOD_BASIC + 1, 'type': 'uint32'},
            'seeds': {'lod': SIC.LOD_BASIC + 1, 'type': 'uint32'},
            'downloading': {'lod': SIC.LOD_BASIC + 1, 'type': 'uint32'}
        }
        
        self.prop_desc['size']['conv'] = lambda x: int(x / 1024)
        self.prop_desc['downloading']['conv'] = lambda x: {0:0}.get(x, 1)
    
        for p in self.prop_desc:
            self.props[p] = self.provider.am[self.oid][p]
    
    def update(self):
        for p in ('size', 'seeds', 'downloading'):
            self.props[p] = self.provider.am[self.oid][p]
    
    def set_value(self, key, value):
        raise KeyError("Cannot write to AmuleResultObj['%s']" % key)
            
            
class AmuleObj(ObjectWrapper):

    def describe(self):
        self.types = ['amule-app']
        self.prop_desc = {
            'active': {'lod': SIC.LOD_BASIC, 'type': 'uint32'},
            'dl_speed': {'lod': SIC.LOD_BASIC + 1, 'type': 'uint32'},
            'dl_files': {'lod': SIC.LOD_BASIC + 1, 'type': 'uint32'},
            'ul_speed': {'lod': SIC.LOD_BASIC + 1, 'type': 'uint32'},
            'ed2k_users': {'lod': SIC.LOD_MAX, 'type': 'uint32'},
            'ed2k_files': {'lod': SIC.LOD_MAX, 'type': 'uint32'},
            'kad_users': {'lod': SIC.LOD_MAX, 'type': 'uint32'},
            'kad_files': {'lod': SIC.LOD_MAX, 'type': 'uint32'}
        }
        self.update()
    
    def update(self):
        am = self.provider.am
        
        for p in self.prop_desc:
            if am.connected:
                if p == 'active':
                    self.props[p] = 1
                elif p == 'dl_files':
                    self.props[p] = len(am.downloads.keys())
                else:
                    try:
                        self.props[p] = int(am.status[p])
                    except KeyError:
                        self.domserver.debug("Warning: missing amule status key '%s'" % p)
                        self.props[p] = 0
            else:
                self.props[p] = 0
        
    def set_value(self, key, value):
        raise KeyError("Cannot write to AmuleObj['%s']" % key)
        
        
class AmuleObjectProvider(ObjectProvider):
    """Object provider for amule. Provides access to downloads and search
    results with two kinds of objects: 'amule:download/<hash>' and
    'amule:result/<hash>'.
    """

    def __init__(self, domserver, am):
        ObjectProvider.__init__(self, domserver, 'amule')
        self.am = am
        self.am.register_object_provider(self)
                
    def save_on_stop(self):
        for oid in self.am.keys():
            if oid.startswith('download/'):
                tdata = {
                    "name": self.am[oid]["name"],
                    "size": self.am[oid]["size"],
                    "seeds": 0,
                    "progress": self.am[oid]["progress"],
                    "speed": 0,
                    "status": 0
                }
                self.save_object(oid, tdata)
        
    def get_oids(self):
        oids = ['']
        oids.extend(self.am.keys())
        oids.extend([h for h in self.list_objects() if h not in oids])
        return oids
        
    def get_object(self, oid):
        if oid == '':
            return AmuleObj(self.domserver, self, '')
        else:
            kind, desc = oid.split('/', 1)
            if kind == 'download':
                return AmuleDownloadObj(self.domserver, self, oid)
            elif kind == 'result':
                return AmuleResultObj(self.domserver, self, oid)
        
        
class AmuleObjectProcessor(ObjectProcessor):

    def __init__(self, domserver, name, objs):
        ObjectProcessor.__init__(self, domserver, name)
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
            act.add_param('query', 'string')
            act.add_param('search-type', 'uint32')
            act.add_param('file-type', 'string')
            act.add_param('min-size', 'uint32', True)
            act.add_param('max-size', 'uint32', True)
            act.add_param('avail', 'uint32', True)
            act.add_param('file-ext', 'string', True)
        if name == 'amule-download-ed2k':
            act.add_param('ed2k-link', 'string')
        
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
            ors = ["amule:result/%s" % h for h in self.objs.am.results.keys()]
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

    def __init__(self, am, domserver, logger, command, **kwargs):
        RunWatcherThread.__init__(self, domserver, logger, command, **kwargs)
        self.am = am
        
    def on_start(self):
        delay = int(self.domserver.config['amule.ec_delay'])
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

    def __init__(self, domserver):
        self._reset()
        self.domserver = domserver
        self.domserver.info("Initializing amule helper")
        self.logger = domserver.get_logger('amule.log_file', 'amule.log_level')
        
        self.amule = Amule(self.domserver, self.logger)
        
        self.objs = AmuleObjectProvider(domserver, self.amule)
        self.proc = AmuleObjectProcessor(domserver, 'amule', self.objs)
        
        domserver.register_object_interface(
            name='amule',
            provider=self.objs,
            processor=self.proc
        )
        
        self.update_amule_config()
        self.config_changed(domserver.config['amule.enabled'])
        
        domserver.config.register_callback('amule.enabled', self.config_changed)
        
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
            self.domserver,
            self.logger,
            '/usr/share/amule/amuled_home_wrapper.sh',
            pidof = 'amuled',
            kill = True,
            user = 'amule'
        )
        self._rw_tid = self.domserver.add_thread(self._rw_thread, True)
    
    def disable(self):
        if self._rw_tid is not None:
            self.domserver.remove_thread(self._rw_tid)
        self._reset()
        
    def update_amule_config(self):
        acfile = os.path.join(self.domserver.config["amule.amule_dir"],
                                "amule.conf")
        ec_password = self.domserver.config["amule.ec_password"]
        settings = {
            "[eMule]": {
                "Port": self.domserver.config["amule.tcp_port"],
                "UDPPort": self.domserver.config["amule.udp_port"],
                "MaxUpload": self.domserver.config["amule.max_upload"],
                "MaxDownload": self.domserver.config["amule.max_download"]
            },
            "[ExternalConnect]": {
                "AcceptExternalConnections": 1,
                "ECPort": self.domserver.config["amule.ec_port"],
                "ECPassword": hashlib.md5(ec_password).hexdigest()
            },
            "[UserEvents/DownloadCompleted]": {
                "CoreEnabled": 1,
                "CoreCommand": 'mv "%%FILE" "%s"' % self.domserver.config["media.lobby_dir"]
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
        
