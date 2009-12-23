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

from ..RunWatcherThread import RunWatcherThread
from ..Objects import ObjectProvider
from ..SocketInterface import SIPacket, SIStringTag, SIUInt32Tag, SIUInt8Tag
from ..SocketInterfaceCodes import SIC


WATCHER_INITIAL_WAIT = 2

               
class AmuleRunWatcherThread(RunWatcherThread):

    def __init__(self, domserver, logger, command, **kwargs):
        RunWatcherThread.__init__(self, domserver, logger, command, **kwargs)
        self.ec_connected = False
        self.ec_client = AmuleClient()
        self.last_search = ''
        
    def _connect(self):
        try:
            self.ec_client.connect(
                'localhost',
                int(self.domserver.config['amule.ec_port']),
                self.domserver.config['amule.ec_password'],
                'domserver',
                'TODOversion'
            )
        except ECConnectionError:
            self.info("RunWatcher: could not connect to amule")
            self.ec_connected = False
        else:
            self.info("RunWatcher: connected to amule")
            self.ec_connected = True
        
    def on_start(self):
        self.verbose("RunWatcher: waiting %d seconds before connecting..." % WATCHER_INITIAL_WAIT)
        time.sleep(WATCHER_INITIAL_WAIT)
        self._connect()
            
    def on_kill(self):
        if self.ec_connected:
            self.info("RunWatcher: disconnecting from amule")
            self.ec_connected = False
            self.ec_client.disconnect()
            
    def on_check(self):
        if not self.ec_connected:
            self.info("RunWatcher: retrying connection to amule...")
            self._connect()
            
            
class AmuleObjectProvider(ObjectProvider):
    """Object provider for amule. Provides access to downloads and search
    results with two kinds of objects: 'amule:download/<hash>' and
    'amule:result/<hash>'.
    """
    
    downloads = {}
    downloads_last_update = 0
    results = {}
    results_last_update = 0

    def __init__(self, domserver, helper):
        ObjectProvider.__init__(self, domserver, 'amule')
        self.helper = helper
        
    def _amclient(self):
        return self.helper.get_amule_client()
        
    def _update_downloads(self):
        interval = self.domserver.config['amule.update_interval']
        if self.downloads_last_update + interval > time.time():
            return
        client = self._amclient()
        if client:
            queue = client.get_download_list()
            for hash in queue.keys():
                stopped = queue[hash].get('stopped', False)
                status = queue[hash]['status']
                size = queue[hash]['size']
                done = queue[hash]['size_done']
                seeds_xfer = queue[hash]['src_xfer']
                speed = queue[hash]['speed']
                
                # domserver dl statuses:
                #   0   stop
                #   1   init
                #   2   pause
                #   3   dl
                #   4   ul
                #   5   finalize
                #   6   done
                
                if stopped:
                    stnum = 0
                elif status == 7:
                    stnum = 2
                elif seeds_xfer > 0:
                    stnum = 3
                elif size == done:
                    stnum = 5
                else:
                    stnum = 1
                
                self.downloads[hash] = {
                    'name': queue[hash]['name'],
                    'size': size,
                    'seeds': queue[hash]['src_count'],
                    'speed': queue[hash]['speed'],
                    'progress': done/size*100 if size != 0 else 0,
                    'status': stnum
                }
        self.downloads_last_update = time.time()
        
    def _update_results(self):
        interval = self.domserver.config['amule.update_interval']
        if self.results_last_update + interval > time.time():
            return
        client = self._amclient()
        if client:
            res = client.get_search_results()
            for hash in res.keys():
                self.results[hash] = {
                    'name': res[hash]['name'],
                    'size': res[hash]['size'],
                    'seeds': res[hash]['src_count'],
                    'downloading': res[hash]['src_count_xfer']
                }
        self.results_last_update = time.time()
        
    def load_downloads(self):
        for oid in self.list_objects():
            kind, hash = oid.split('/', 1)
            if kind == 'download':
                self.downloads[hash] = self.load_object(hash)
    
    def save_downloads(self):
        for hash in self.downloads.keys():
            # TODO use actual amule statuses
            if self.downloads[hash]['status'] < 6:
                self.downloads[hash]['status'] = 0
            self.save_object("download/%s" % hash, self.torrents[hash])
        
    def get_oids(self):
        self._update_downloads()
        self._update_results()
        doids = [ "download/%s" % k for k in self.downloads.keys() ]
        roids = [ "result/%s" % k for k in self.results.keys() ]
        return doids + roids
        
    def valid_oid(self, oid):
        try:
            kind, hash = oid.split('/', 1)
        except ValueError:
            return False
            
        if kind == 'download':
            self._update_downloads()
            return hash in self.downloads.keys()
        elif kind == 'result':
            self._update_results()
            return hash in self.results.keys()
        else:
            return False
            
    def get_types(self, oid):
        try:
            kind, hash = oid.split('/', 1)
        except ValueError:
            return
        
        if kind in ('download', 'result'):
            return [kind, 'virtual-file']
            
    def get_value(self, oid, prop):
        kind, hash = oid.split('/', 1)
        
        if kind == 'download':
            self._update_downloads()
            return self.downloads[hash][prop]
        elif kind == 'result':
            self._update_results()
            return self.results[hash][prop]
            
    def to_sitags_download(self, hash, detail_level):
        tags = []
        dl = self.downloads[hash]
        keys = set(['name', 'size', 'seeds', 'speed', 'progress',
                    'status']) & set(dl.keys())
        for k in keys:
            if k in ('size',):
                vtag = SIUInt32Tag(int(dl[k] / 1024), SIC.TAG_OBJ_VALUE)
            elif k in ('speed', 'seeds'):
                vtag = SIUInt32Tag(dl[k], SIC.TAG_OBJ_VALUE)
            else:
                vtag = SIStringTag(dl[k], SIC.TAG_OBJ_VALUE)

            tag = SIStringTag(k, SIC.TAG_OBJ_PROPERTY)
            tag.subtags.append(vtag)
            tags.append(tag)
        return tags
        
    def to_sitags_result(self, hash, detail_level):
        tags = []
        keys = set('seeds', 'seeds_xfer', 'name', 'size')
        res = self.results[hash]
        for k in set(res.keys) & keys:
            if k in ('size',):
                vtag = SIUInt32Tag(int(res[k] / 1024), SIC.TAG_OBJ_VALUE)
            elif k in ('seeds', 'seeds_xfer'):
                vtag = SIUInt32Tag(res[k], SIC.TAG_OBJ_VALUE)
            else:
                vtag = SISTringTag(res[k], SIC.TAG_OBJ_VALUE)
            tag = SIStringTag(k, SIC.TAG_OBJ_PROPERTY)
            tag.subtags.append(vtag)
            tags.append(tag)
        return tags
            
    def to_sitags(self, oid, detail_level):
        kind, hash = oid.split('/', 1)
        
        if kind == 'download':
            self._update_downloads()
            return self.to_sitags_download(hash, detail_level)
        elif kind == 'result':
            self._update_results()
            return self.to_sitags_result(hash, detail_level)
        
    
class AmuleHelper:

    def __init__(self, domserver):
        self._reset()
        self.domserver = domserver
        self.domserver.info("Initializing amule helper")
        self.logger = domserver.get_logger('amule.log_file', 'amule.log_level')
        
        self.objs = AmuleObjectProvider(domserver, self)
        domserver.register_object_interface(
            name='amule',
            provider=self.objs
        )
        
        self.update_amule_config()
        self.config_changed(domserver.config['amule.enabled'])
        
        domserver.config.register_callback('amule.enabled', self.config_changed)
        domserver.register_packet_handler(SIC.OP_AMULE, self.handle_sipacket)
        
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
        
    def get_amule_client(self):
        if self._rw_thread is None or not self._rw_thread.ec_connected:
            return False
        else:
            return self._rw_thread.ec_client
        
    def handle_sipacket(self, siclient, packet):
        tag = packet.get_tag(SIC.TAG_AMULE_TYPE)
        
        if tag is None:
            return False
            
        if tag.value in ('download', 'pause', 'resume', 'cancel'):
            return self.partfile_command(siclient, tag)
        elif tag.value == 'download_ed2k':
            return self.download_ed2k(siclient, tag)
        elif tag.value == 'search':
            return self.search_start(siclient, tag)
        elif tag.value == 'last_search':
            return self.answer_last_search(siclient)
        elif tag.value == 'search_results':
            return self.answer_search_results(siclient)
        elif tag.value == 'download_queue':
            return self.answer_download_queue(siclient)
        elif tag.value == 'status':
            return self.answer_status(siclient)
                
        return False
        
    def partfile_command(self, client, tag):
        try:
            hash = tag.get_subtag(SIC.TAG_AMULE_HASH).value
        except AttributeError:
            return False
            
        self.logger.verbose("Received %s command for hash %s" % (tag.value, hash))
        amclient = self._rw_thread.ec_client
            
        ret = False
        if tag.value == 'pause':
            try:
                ret = amclient.partfile_pause([hash])
            except ValueError:
                ret = False
        elif tag.value == 'resume':
            try:
                ret = amclient.partfile_resume([hash])
            except ValueError:
                ret = False
        elif tag.value == 'cancel':
            try:
                ret = amclient.partfile_delete([hash])
            except ValueError:
                ret = False
        elif tag.value == 'download':
            try:
                ret = amclient.download_search_results([hash])
            except ValueError:
                ret = False
                
        if not ret:
            self.verbose("Command failed")
        else:
            client.answer_success()
            
        return ret
        
    def download_ed2k(self, client, tag):
        try:
            link = tag.get_subtag(SIC.TAG_AMULE_ED2K_LINK).value
        except AttributeError:
            return False
            
        amclient = self._rw_thread.ec_client
        ret = amclient.download_ed2klinks([link])
        if ret:
            self.logger.verbose("Downloading ED2K %s" % link)
            client.answer_success()
        else:
            self.logger.verbose("Failed to download ED2K %s" % link)
        return ret
        
    def search_start(self, client, tag):
        try:
            query = tag.get_subtag(SIC.TAG_AMULE_QUERY).value
            stype = tag.get_subtag(SIC.TAG_AMULE_STYPE).value
            ftype = tag.get_subtag(SIC.TAG_AMULE_FILETYPE).value
        except AttributeError:
            return False
            
        try:
            minsize = tag.get_subtag(SIC.TAG_AMULE_MINSIZE).value
        except AttributeError:
            minsize = None
        try:
            maxsize = tag.get_subtag(SIC.TAG_AMULE_MAXSIZE).value
        except AttributeError:
            maxsize = None
        try:
            avail = tag.get_subtag(SIC.TAG_AMULE_AVAIL).value
        except AttributeError:
            avail = None
        try:
            ext = tag.get_subtag(SIC.TAG_AMULE_EXT).value
        except AttributeError:
            ext = None
        
        self.rwt.last_search = query
        self.verbose("Starting search query for '%s'" % query)
        amclient = self._rw_thread.ec_client
        amclient.search_start(query, stype, minsize, maxsize, ftype, avail, ext)
        client.answer_success()
        return True
        
    def answer_last_search(self, client):
        if self._rw_thread.last_search == '':
            return False
        else:
            resp = SIPacket(opcode = SIC.OP_SUCCESS)
            resp.tags.append(SIStringTag(self._rw_thread.last_search, SIC.TAG_AMULE_QUERY))
            client.answer(resp)
            return True
        
    def answer_search_results(self, client):
        amclient = self._rw_thread.ec_client
        results = amclient.get_search_results()
        resp = SIPacket(opcode = SIC.OP_AMULE_SEARCH_RESULTS)
        resp.set_flag(SIC.FLAGS_USE_ZLIB)
        for h in results.keys():
            tag = SIStringTag(h, SIC.TAG_AMULE_HASH)
            tag.subtags.extend([
                SIStringTag(results[h]['name'], SIC.TAG_AMULE_NAME),
                SIUInt32Tag(int(results[h]['size'] / 1024), SIC.TAG_AMULE_SIZE),
                SIUInt32Tag(results[h]['src_count'], SIC.TAG_AMULE_SEEDS),
            ])
            resp.tags.append(tag)
        client.answer(resp)
        return True
        
    def answer_download_queue(self, client):
        amclient = self._rw_thread.ec_client
        queue = amclient.get_download_list()
        resp = SIPacket(opcode = SIC.OP_AMULE_DOWNLOAD_QUEUE)
        resp.set_flag(SIC.FLAGS_USE_ZLIB)
        for h in queue.keys():
            tag = SIStringTag(h, SIC.TAG_AMULE_HASH)
            tag.subtags.extend([
                SIStringTag(queue[h]['name'], SIC.TAG_AMULE_NAME),
                SIUInt32Tag(int(queue[h]['size'] / 1024), SIC.TAG_AMULE_SIZE),
                SIUInt32Tag(int(queue[h]['size_done'] / 1024), SIC.TAG_AMULE_SIZE_DONE),
                SIUInt32Tag(queue[h]['src_count'], SIC.TAG_AMULE_SEEDS),
                SIUInt32Tag(queue[h]['src_count_xfer'], SIC.TAG_AMULE_SEEDS_XFER),
                SIUInt32Tag(queue[h]['speed'], SIC.TAG_AMULE_SPEED),
                SIUInt8Tag(queue[h]['status'], SIC.TAG_AMULE_STATUS)
            ])
            resp.tags.append(tag)
        client.answer(resp)
        return True
        
    def answer_status(self, client):
        amclient = self._rw_thread.ec_client
        status = amclient.get_server_status()
        resp = SIPacket(opcode = SIC.OP_SUCCESS)
        for k in status.keys():
            tag = SIStringTag(k, SIC.TAG_AMULE_STATUS_KEY)
            tag.subtags.append(SIStringTag(status[k], SIC.TAG_AMULE_STATUS_VAL))
            resp.tags.append(tag)
        client.answer(resp)
        return True
        
        
        
