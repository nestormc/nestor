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

from ..Errors import ObjectError
from ..Objects import ObjectProvider, ObjectProcessor
from ..RunWatcherThread import RunWatcherThread
from ..SocketInterface import SIPacket, SIStringTag, SIUInt32Tag, SIUInt8Tag
from ..SocketInterfaceCodes import SIC


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
            
            
class DictResult:

    def __init__(self, domserver, amule, hash):
        self.domserver = domserver
        self.am = amule
        self.hash = hash
        
    def download(self):
        try:
            return self.am.client.download_search_results([self.hash])
        except ValueError:
            return False
        
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
            self.domserver.debug("dbg:: amule._update refetch")
            self.downloads = self.client.get_download_list()
            self.results = self.client.get_search_results()
            self.last_updated = time.time()
            
    def keys(self):
        if self.connected:
            self._update()
            d = ["download/%s" % h for h in self.downloads.keys()]
            r = ["result/%s" % h for h in self.results.keys()]
            return d + r
        else:
            return []
        
        
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
        return list(set(self.am.keys()) | set(self.list_objects()))
        
    def valid_oid(self, hash):
        return hash in self.get_oids()
            
    def get_types(self, oid):
        try:
            kind, hash = oid.split('/', 1)
        except ValueError:
            raise ObjectError('invalid-oid:%s' % oid)

        if kind == 'download':
            return ['download', 'amule-partfile']
        elif kind == 'result':
            return ['result', 'amule-result']
            
    def get_value(self, oid, prop):
        obj_exists = False
        if oid in self.am.keys():
            obj_exists = True
            try:
                return self.am[oid][prop]
            except KeyError:
                pass
        
        try:
            return self.load_object_property(oid, prop)
        except ObjectError:
            if obj_exists:
                raise KeyError("No property '%s' for '%s'" % (prop, oid))
            else:
                raise
            
    def set_value(self, oid, prop, val):
        if prop not in ('date_started', 'hash') or not oid.startswith('download/'):
            raise KeyError("Property '%s' is readonly" % prop)
        self.save_object_property(oid, prop, val)
        
    def describe_props(self, oid, detail_level):
        kind, hash = oid.split('/', 1)
        
        desc = {}
        for k in ('name', 'hash'):
            desc[k] = {'type':'string'}
        desc['size'] = {
            'type':'uint32',
            'conv':(lambda x: int(x / 1024))
        }
        
        if kind == 'download':
            for k in ('speed', 'seeds', 'status'):
                desc[k] = {'type':'uint32'}
            desc['progress'] = {
                'type':'string',
                'conv':(lambda x: "%.2f%%" % x)
            }
        elif kind == 'result':
            desc['seeds'] = {'type':'uint32'}
            
        return desc
        
        
class AmuleObjectProcessor(ObjectProcessor):

    def __init__(self, domserver, name, objs):
        ObjectProcessor.__init__(self, domserver, name)
        self.objs = objs
        
    def get_action_names(self, obj=None):
        names = []
        if obj and obj.is_a("amule-partfile"):
            status = obj["status"]
            if status < 4:
                names.append('partfile-cancel')
            if status > 0 and status < 5:
                names.append('partfile-pause' if status != 2 else 'partfile-resume')
            if status == 6:
                names.append('partfile-clear')
        if obj and obj.is_a('amule-result'):
            if obj['downloading'] < 1:
                names.append('result-download')
        if not obj:
            names.extend(['amule-search', 'amule-download-ed2k'])
        return names
        
    def describe_action(self, act):
        name = act.name
        obj = act.obj
        
        if name == 'amule-search':
            act.add_param('query', SIC.APFLAG_TYPE_STRING)
            act.add_param('search-type', SIC.APFLAG_TYPE_NUMBER)
            act.add_param('file-type', SIC.APFLAG_TYPE_STRING)
            act.add_param('min-size', SIC.APFLAG_TYPE_NUMBER | SIC.APFLAG_OPTION_OPTIONAL)
            act.add_param('max-size', SIC.APFLAG_TYPE_NUMBER | SIC.APFLAG_OPTION_OPTIONAL)
            act.add_param('avail', SIC.APFLAG_TYPE_NUMBER | SIC.APFLAG_OPTION_OPTIONAL)
            act.add_param('file-ext', SIC.APFLAG_TYPE_STRING | SIC.APFLAG_OPTION_OPTIONAL)
        if name == 'amule-download-ed2k':
            act.add_param('ed2k-link', SIC.APFLAG_TYPE_STRING)
        
    def execute_action(self, act):
        name = act.name
        obj = act.obj
        
        if name.startswith("partfile-"):
            pf = self.objs.am["download/%s" % obj['hash']]
            if name == 'partfile-cancel':
                pf.cancel()
                self.objs.remove_object("download/%s" % obj['hash'])
            elif name == 'partfile-pause':
                pf.pause()
            elif name == 'partfile-resume':
                pf.resume()
            elif name == 'partfile-clear':
                self.objs.remove_object("download/%s" % obj['hash'])
        elif name == 'result-download':
            rs = self.objs.am["result/%s" % obj['hash']]
            rs.download()
        elif name == 'amule-search':
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
        delay = self.domserver.config['amule.ec_delay']
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
        
