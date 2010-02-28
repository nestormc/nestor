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
import os.path
import threading
import time

from ..errors import ObjectError
from ..objects import ObjectProvider, ObjectProcessor, ObjectWrapper
from ..socketinterfacecodes import SIC
from .media.importer import ImporterThread
from .media.music import MusicLibrary, MusicTypes, MediaUpdateError


class MPDPlayerObj(ObjectWrapper):
    
    def describe(self):
        self.types = ['mpd-player']
        self.update()
        
    def update(self):
        status = self.provider.mpd_status
        self.props = {
            'state': status.get('state', ''),
            'time': int(status.get('time', '0:0').split(':', 1)[0]),
            'random': int(status.get('random', '0')),
            'repeat': int(status.get('repeat', '0')),
            'volume': int(status.get('volume', '0')),
            'xfade': int(status.get('xfade', '0')),
            'song': int(status.get('song', '-1'))
        }
        
    def set_value(self, key, value):
        raise KeyError("Cannot write to MPDPlayerObj['%s']" % key)


class MusicArtistObj(ObjectWrapper):
    
    def describe(self):
        self.types = ['music-artist']
        
        music = self.provider.music
        artist_id = int(self.oid.split('|', 1)[1])
        meta = music.get_artist_metadata(artist_id)
        self.props = {
            'artist': meta['artist'],
            'artist_id': artist_id,
            'keywords': meta['artist'],
            'path': music.meta_to_filename(meta, MusicTypes.ARTIST)
        }
    
    def update(self):
        # No update needed: we're cleared from cache on metadata change.
        pass
        
    def set_value(self, key, value):
        raise KeyError("Cannot write to MusicArtistObj['%s']" % key)
        
        
class MusicAlbumObj(ObjectWrapper):
    
    def describe(self):    
        self.types = ['music-album']
        
        music = self.provider.music
        album_id = int(self.oid.split('|', 1)[1])
        meta = music.get_album_metadata(album_id)
        self.props = {
            'album': meta['album'],
            'artist': meta['artist'],
            'album_id': album_id,
            'year': int(meta['year']),
            'genre': meta['genre'],
            'keywords': "%s %s" % (meta['artist'], meta['album']),
            'path': music.meta_to_filename(meta, MusicTypes.ALBUM)
        }
    
    def update(self):
        # No update needed: we're cleared from cache on metadata change.
        pass
        
    def set_value(self, key, value):
        raise KeyError("Cannot write to MusicAlbumObj['%s']" % key)


class MusicTrackObj(ObjectWrapper):

    def describe(self):
        kind, id = self.oid.split('|', 1)
        id = int(id)
        self.types = ['music-track']
        
        music = self.provider.music
        playlist = self.provider.mpd_playlist
        status = self.provider.mpd_status
        
        if kind == 'music-track':
            meta = music.get_track_metadata(id)
            rpath = music.meta_to_filename(meta, MusicTypes.TRACK, True)
            track_id = id
            
            try:
                mpd_pos = playlist.index(rpath)
                self.types.append('mpd-item')
            except ValueError:
                mpd_pos = -1
                
        elif kind == 'mpd-item':
            self.types.append('mpd-item')
            rpath = playlist[id].decode('utf-8')
            meta, mtype = music.filename_to_meta(rpath)
            mpd_pos = id
            if not meta:
                self.provider.log.debug("Could not find metadata for %s (path=%s)" % (self.oid, rpath))
                raise ObjectError("invalid-object:%s" % self.oid)
            
            track_id = music.get_track_id(meta['artist'], meta['album'],
                meta['title'])
           
        song = int(status.get('song', -1))
        if song != -1 and song == mpd_pos:
            playing = 1
        else:
            playing = 0
            
        self.props = {
            'title': meta['title'],
            'mpd-position': mpd_pos,
            'mpd-playing': playing,
            'album': meta['album'],
            'artist': meta['artist'],
            'track_id': track_id,
            'len': int(meta['len']),
            'fmt': meta['fmt'],
            'num': int(meta['num']),
            'year': int(meta['year']),
            'genre': meta['genre'],
            'keywords': "%s %s %s " % (meta['artist'], meta['album'], 
                meta['title']),
            'path': os.path.join(self.nestor.config['media.music_dir'], rpath),
            
            # Not transmitted - just there to avoid re-fetching metadata
            'meta': meta
        }
        
    def update(self):
        kind, id = self.oid.split('|', 1)
        id = int(id)
        music = self.provider.music
        playlist = self.provider.mpd_playlist
        status = self.provider.mpd_status
                
        # Only update mpd-position and mpd-playing
        if kind == 'music-track':
            rpath = music.meta_to_filename(self.props['meta'], MusicTypes.TRACK, True)
            try:
                mpd_pos = playlist.index(rpath)
                self.types.append('mpd-item')
            except ValueError:
                mpd_pos = -1
                try:
                    self.types.remove('mpd-item')
                except ValueError:
                    pass
            
            self.props['mpd-position'] = mpd_pos
        
        song = int(status.get('song', -1))
        if song != -1 and song == self.props["mpd-position"]:
            self.props["mpd-playing"] = 1
        else:
            self.props["mpd-playing"] = 0
            
        
    def set_value(self, key, value):
        raise KeyError("Cannot write to MusicTrackObj['%s']" % key)
        

class MLObjectProvider(ObjectProvider):
    """Media library object provider
    
    Provides:
        media:music-artist|<artist id>
        media:music-album|<album id>
        media:music-track|<track id>
        media:mpd
        media:mpd-item|<position>
    """
    
    def __init__(self, nestor, helper):
        ObjectProvider.__init__(self, nestor, 'media')
        self.music = helper['music']
        self.mpd = helper['mpd']
        self.changed = {
            "paths": [],
            "artists": [],
            "albums": [],
            "tracks": []
        }
        self.changed_lock = threading.Condition(threading.Lock())
        
    def on_query_start(self):
        self.mpd_playlist = self.mpd.playlist()
        self.mpd_status = self.mpd.status()
    
    def on_query_end(self):
        pass
        
    def get_object(self, oid):
        if oid == 'mpd':
            return MPDPlayerObj(self.nestor, self, 'mpd')
            
        try:
            kind, id = oid.split('|', 1)
        except ValueError:
            raise ObjectError("invalid-oid:media:%s" % oid)
            
        if kind == 'music-artist':
            return MusicArtistObj(self.nestor, self, oid)
        elif kind == 'music-album':
            return MusicAlbumObj(self.nestor, self, oid)
        elif kind in ('music-track', 'mpd-item'):
            return MusicTrackObj(self.nestor, self, oid)
        
    def get_oids(self):
        mpd_oids = ['mpd-item|%d' % i for i in range(len(self.mpd_playlist))]
        return ['mpd'] + mpd_oids
        
    def match_oids(self, expr, types):
        oids = []
        types = types or []
        
        if 'music-track' in types:
            track_ids = self.music.match(expr, MusicTypes.TRACK)
            return ['music-track|%d' % i for i in track_ids]
            
        if 'music-album' in types:
            album_ids = self.music.match(expr, MusicTypes.ALBUM)
            return ['music-album|%d' % i for i in album_ids]
            
        if 'music-artist' in types:
            art_ids = self.music.match(expr, MusicTypes.ARTIST)
            return ['music-artist|%d' % i for i in art_ids]
                
        if len(types) == 0 or 'mpd-player' in types or 'mpd-item' in types:
            return ObjectProvider.match_oids(self, expr, types)
            
    def infer_oids(self, obj):
        oids = []
        if obj.owner == 'media':
            oids.append(obj.oid)
            if obj.oid != "mpd":
                kind, id = obj.oid.split("|", 1)
                if kind == 'music-track' and obj["mpd-position"] != -1:
                    oids.append("mpd-item|%d" % obj["mpd-position"])
                if kind == 'mpd-item':
                    oids.append("music-track|%d" % obj["track_id"])
        return oids
        
    def on_artist_changed(self, id, path):
        with self.changed_lock:
            if path not in self.changed["paths"]:
                self.changed["paths"].append(path)
            if id not in self.changed["artists"]:
                self.changed["artists"].append(id)
        
    def on_album_changed(self, id, path):
        with self.changed_lock:
            if path not in self.changed["paths"]:
                self.changed["paths"].append(path)
            if id not in self.changed["albums"]:
                self.changed["albums"].append(id)
        
    def on_track_changed(self, id, path):
        with self.changed_lock:
            if path not in self.changed["paths"]:
                self.changed["paths"].append(path)
            if id not in self.changed["tracks"]:
                self.changed["tracks"].append(id)
            
    def commit_changes(self):
        with self.changed_lock:
            changed = self.changed.copy()
            for k in self.changed:
                self.changed[k] = []
                
        for id in changed["artists"]:
            self.cache.remove("media:music-artist|%d" % id)
        for id in changed["albums"]:
            self.cache.remove("media:music-album|%d" % id)
        for id in changed["tracks"]:
            self.cache.remove("media:music-track|%d" % id)
            
        paths = []
        for p in changed["paths"]:
            if '/' not in p or not os.path.dirname(p) in changed["paths"]:
                self.debug("Commit: updating mpd for '%s'" % p)
                try:
                    self.mpd.update(p)
                except:
                    pass
        

class MLObjectProcessor(ObjectProcessor):

    def __init__(self, nestor, helper):
        ObjectProcessor.__init__(self, nestor, 'media')
        self.objs = helper['objs']
        self.music = helper['music']
        self.mpd = helper['mpd']
        
    def get_actions(self, obj):
        names = []
        
        if obj.is_a('music-artist'):
            names.extend(['edit-artist', 'remove', 'mpd-play', 'mpd-enqueue'])
        if obj.is_a('music-album'):
            names.extend(['edit-album', 'remove', 'mpd-play', 'mpd-enqueue'])
        if obj.is_a('music-track'):
            names.extend(['edit-track', 'remove', 'mpd-play', 'mpd-enqueue'])
        if obj.is_a('mpd-item'):
            names.extend(['mpd-item-remove', 'mpd-item-move', 'mpd-item-play'])
        if obj.is_a('mpd-player'):
            status = self.objs.mpd_status
            names.extend(['mpd-player-random', 'mpd-player-repeat',
                'mpd-player-clear', 'mpd-player-volume'])
            if status['state'] in ('stop', 'pause'):
                names.extend(['mpd-player-play'])
            if status['state'] in ('pause', 'play'):
                names.extend(['mpd-player-next', 'mpd-player-prev',
                    'mpd-player-seek', 'mpd-player-stop'])
            if status['state'] in ('play'):
                names.extend(['mpd-player-pause'])
            
        return names
        
    def describe(self, act):
        name = act.name
        obj = act.obj
        
        # Metadata edition
        if name == 'edit-artist':
            act.add_param('artist', False, obj['artist'])
        elif name == 'edit-album':
            act.add_param('artist', True, obj['artist'])
            act.add_param('album', False, obj['album'])
            act.add_param('year', False, obj['year'])
            act.add_param('genre', False, obj['genre'])
        elif name == 'edit-track':
            act.add_param('artist', True, obj['artist'])
            act.add_param('album', True, obj['album'])
            act.add_param('num', False, obj['num'])
            act.add_param('title', False, obj['title'])
            
        # MPD Player controls
        elif name == 'mpd-player-seek':
            act.add_param('position', False, obj['time'])
        elif name == 'mpd-player-volume':
            act.add_param('volume', False, obj['volume'])
            
        # MPD Playlist controls
        elif name == 'mpd-enqueue':
            act.add_param('position', False, len(self.objs.mpd_playlist))
        elif name == 'mpd-item-move':
            act.add_param('position', False, obj['mpd-position'])
    
    def execute(self, act):
        name = act.name
        obj = act.obj
        
        # Metadata edition
        if name.startswith('edit-'):            
            if name == 'edit-artist':
                self.debug("edit-artist on %s" % obj.objref)
                meta = self.music.get_artist_metadata(obj['artist_id'])
                meta['artist'] = act['artist']
                id = obj['artist_id']
                type = MusicTypes.ARTIST

            elif name == 'edit-album':
                self.debug("edit-album on %s" % obj.objref)
                meta = self.music.get_album_metadata(obj['album_id'])
                    
                meta['artist'] = act['artist']
                meta['album'] = act['album']
                meta['year'] = act['year']
                meta['genre'] = act['genre']
                id = obj['album_id']
                type = MusicTypes.ALBUM
            
            elif name == 'edit-track':
                self.debug("edit-track on %s" % obj.objref)
                meta = self.music.get_track_metadata(obj['track_id'])
                
                meta['artist'] = act['artist']
                meta['album'] = act['album']
                meta['num'] = act['num']
                meta['title'] = act['title']
                id = obj['track_id']
                type = MusicTypes.TRACK
                
            try:
                self.music.update_metadata(meta, id, type)
            except MediaUpdateError, e:
                raise ObjectError("update-error:%s" % e)
                
            # Commit changes
            self.objs.commit_changes()
            
        # MPD Player controls
        elif name == 'mpd-player-play':
            self.mpd.play()
        elif name == 'mpd-player-pause':
            self.mpd.pause()
        elif name == 'mpd-player-next':
            self.mpd.next()
        elif name == 'mpd-player-prev':
            self.mpd.previous()
        elif name == 'mpd-player-stop':
            self.mpd.stop()
        elif name == 'mpd-player-seek':
            self.mpd.seek(self.objs.mpd_status['song'], act['position'])
        elif name == 'mpd-player-random':
            self.mpd.random(1 - int(self.objs.mpd_status['random']))
        elif name == 'mpd-player-repeat':
            self.mpd.repeat(1 - int(self.objs.mpd_status['repeat']))
        elif name == 'mpd-player-volume':
            self.mpd.setvol(act['volume'])
            
        # MPD Playlist controls
        elif name == 'mpd-player-clear':
            for idx in range(len(self.objs.mpd_playlist)):
                self.objs.cache.remove("media:mpd-item|%d" % idx)
            self.mpd.clear()
        elif name in ('mpd-play', 'mpd-enqueue'):
            mdir = self.nestor.config['media.music_dir']
            if obj['path'].startswith(mdir):
                path = obj['path'][len(mdir):]
                if path.startswith('/'):
                    path = path[1:]
            else:
                return
                
            oldlen = len(self.objs.mpd_playlist)
            if name == 'mpd-play':
                self.mpd.clear()
                
            self.mpd.add(path)
            
            if name == 'mpd-play':
                self.mpd.play(0)
                for idx in range(oldlen):
                    self.objs.cache.remove("media:mpd-item|%d" % idx)
            elif name == 'mpd-enqueue':
                dst = act['position']
                if dst < oldlen:
                    for offset in range(len(self.objs.mpd.playlist()) - oldlen):
                        self.mpd.move(oldlen + offset, dst + offset)
                for idx in range(dst, len(self.objs.mpd_playlist)):
                    self.objs.cache.remove("media:mpd-item|%d" % idx)
                
        elif name == 'mpd-item-remove':
            src = obj['mpd-position']
            for idx in range(src, len(self.objs.mpd_playlist)):
                self.objs.cache.remove("media:mpd-item|%d" % idx)
            self.mpd.delete(src)
        elif name == 'mpd-item-move':
            src = obj['mpd-position']
            dst = act['position']
            for idx in range(min(src, dst), max(src, dst) + 1):
                self.objs.cache.remove("media:mpd-item|%d" % idx)
            self.mpd.move(src, dst)
        elif name == 'mpd-item-play':
            self.mpd.play(obj['mpd-position'])
            

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
            ret = eval("self.client.%s(*args_str)" % cmd)
        return ret
        
    def __getattr__(self, attr):
        if attr in self._commands:
            return lambda *x: self._command(attr, *x)
        else:
            raise AttributeError("MPDWrapper has no '%s' attribute" % attr)
        

class MediaLibraryHelper:

    def __init__(self, nestor):
        self.nestor = nestor
        self.nestor.info("Initializing media library helper")        
        self.mpd = MPDWrapper(self.nestor)
        self.music = MusicLibrary(self.nestor)
        
        self.import_thread = ImporterThread('Media Importer', self.nestor, self)
        ret = self.nestor.add_thread(self.import_thread, True)
        
        self.objs = MLObjectProvider(nestor, self)
        self.proc = MLObjectProcessor(nestor, self)
        
        self.music.set_callbacks({
            "track_changed": self.objs.on_track_changed,
            "album_changed": self.objs.on_album_changed,
            "artist_changed": self.objs.on_artist_changed
        })
        
        self.import_thread.set_callback(self.objs.commit_changes)
        
        nestor.register_object_interface(
            name='media',
            provider=self.objs,
            processor=self.proc
        )
        
        nestor.register_notification(
            "download-finished",
            self.import_file_notification
        )
        
    def import_file_notification(self, notif):
        try:
            obj = self.nestor._obj.get_object(notif.objref)
            path = obj["path"]
            self.import_thread.enqueue(path, True)
        except (ObjectError, KeyError):
            pass
        
    def __getitem__(self, key):
        if key == 'music':
            return self.music
        elif key == 'mpd':
            return self.mpd
        elif key == 'objs':
            return self.objs
        else:
            raise KeyError("MediaLibraryHelper has no key '%s'" % key)
        
