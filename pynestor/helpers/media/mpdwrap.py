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
# along with nestor.  If not, smee <http://www.gnu.org/licenses/>.

import mpd
import threading


class MPDError(mpd.CommandError): pass
class MPDFileNotFound(MPDError): pass
class MPDAlreadyUpdating(MPDError): pass
class MPDBadSongIndex(MPDError): pass

          
class MPDWrapper:
    """MPDClient wrapper using nestor config to connect.  Automatically
    reconnects on failure."""

    _commands = [
        # Playback control
        'play',
        'pause',
        'stop',
        'seek',
        'next',
        'previous',
        
        # Status control
        'status',
        'random',
        'repeat',
        'setvol',
        
        # Playlist control
        'playlist',
        'add',
        'clear',
        'move',
        'delete',
        
        # DB control
        'update'
    ]
    
    def __init__(self, nestor):
        self.nestor = nestor
        self.client = mpd.MPDClient()
        self.cmdlock = threading.Condition(threading.Lock())
        
    def _connect(self):
        try:
            self.client.ping()
        except (mpd.ConnectionError, mpd.ProtocolError):
            try:
                self.client.disconnect()
            except mpd.ConnectionError:
                pass
            self.client.connect(
                self.nestor.config['media.mpd_host'],
                int(self.nestor.config['media.mpd_port'])
            )
            self.client.password(self.nestor.config['media.mpd_password'])
            self._connect()
        
    def _command(self, cmd, *args):
        args_str = []
        for a in args:
            if isinstance(a, unicode):
                args_str.append(a.encode('utf-8'))
            else:
                args_str.append(a)
                
        # The MPD library is not thread-safe, thus we lock here
        with self.cmdlock:
            self._connect()
            try:
                ret = eval("self.client.%s(*args_str)" % cmd)
            except mpd.CommandError, e:
                raise self._translate_exc(e, cmd, *args_str)
        return ret
        
    def __getattr__(self, attr):
        if attr in self._commands:
            return lambda *x: self._command(attr, *x)
        else:
            raise AttributeError("MPDWrapper has no '%s' attribute" % attr)
        
    def _translate_exc(self, e, cmd, *args):
        es = str(e)
        s = "%s (command: %s %r)" % (es, cmd, args)
        if es.endswith("directory or file not found"):
            return MPDFileNotFound(s)
        elif es.endswith("already updating"):
            return MPDAlreadyUpdating(s)
        elif es.endswith("bad song index"):
            return MPDBadSongIndex(s)
        else:
            return MPDError(s)
            
            
