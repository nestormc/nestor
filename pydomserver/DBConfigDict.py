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

DOMSERVER_CONFIG_DEFAULTS = {
    'domserver.ipc_host':       'localhost',
    'domserver.ipc_port':       21900,
    'domserver.log_file':       '/var/log/domserver/domserver.log',
    'domserver.log_level':      3,
    'domserver.use_psyco':      0,
    
    'amule.enabled':            0,
    'amule.log_file':           '/var/log/domserver/domserver.log',
    'amule.log_level':          3,
    'amule.amule_dir':          '/home/amule/.aMule',
    'amule.tcp_port':           20101,
    'amule.udp_port':           20102,
    'amule.max_upload':         40,
    'amule.max_download':       600,
    'amule.ec_port':            21100,
    'amule.ec_password':        'emule',
    'amule.ec_delay':           2,
    'amule.update_interval':    1,
    
    'bt.enabled':               0,
    'bt.log_file':              '/var/log/domserver/bt.log',
    'bt.log_level':             3,
    'bt.port':                  20111,
    'bt.max_upload':            40,
    'bt.max_download':          600,
    'bt.run_dir':               '/data/.control/.torrents/running',
    'bt.drop_dir':              '/data/.control/.torrents/drop',
    'bt.run_interval':          1,
    'bt.refresh_interval':      1,
    
    'media.lobby_dir':          '/data/test_lobby',
    'media.music_dir':          '/data/test_media/music',
    'media.log_file':           '/var/log/domserver/media.log',
    'media.log_level':          3,
    'media.deter':              'the,le,la,les',
    
    'fileman.log_file':         '/var/log/domserver/fileman.log',
    'fileman.log_level':        3
}

class DBConfigDict:
    def __init__(self, db):
        self.db = db
        self.callbacks = {}
        self._apply_defaults()
        
    def _apply_defaults(self):
        for key in DOMSERVER_CONFIG_DEFAULTS.keys():
            if not self.has_key(key):
                self[key] = DOMSERVER_CONFIG_DEFAULTS[key]
        
    def __getitem__(self, key):
        if not self.has_key(key):
            raise KeyError("Config key '%s' not found" % key)
                
        db = self.db()
        query = "SELECT value FROM config WHERE key = ?"
        ret = db.execute(query, (key,)).fetchone()[0]
        db.close()
        return ret
        
    def __delitem__(self, key):
        if not self.has_key(key):
            raise KeyError("Config key '%s' not found" % key)
        db = self.db()
        query = "DELETE FROM config WHERE key = ?"
        db.execute(query, (key,))
        db.commit()
        db.close()
    
    def __setitem__(self, key, value):
        try:
            oldval = self[key]
        except KeyError:
            oldval = None
            
        db = self.db()
        query = "INSERT OR REPLACE INTO config (key,value) VALUES(?,?)"
        db.execute(query, (key, value))
        db.commit()
        db.close()
        
        if value != oldval and self.callbacks.has_key(key):
            for callback in self.callbacks[key]:
                if callback['args'] is None:
                    callback['func'](value)
                else:
                    callback['func'](value, callback['args'])
        
    def has_key(self, key):
        db = self.db()
        query = "SELECT COUNT(*) FROM config WHERE key = ?"
        ret = int(db.execute(query, (key,)).fetchone()[0]) != 0
        db.close()
        return ret
    
    def keys(self):
        db = self.db()
        query = "SELECT key FROM config"
        ret = [r[0] for r in db.execute(query)]
        db.close()
        return ret

    def register_callback(self, key, callback, args=None):
        new = {'func': callback, 'args': args}
        if self.callbacks.has_key(key):
            self.callbacks[key].append(new)
        else:
            self.callbacks[key] = [new]
            
