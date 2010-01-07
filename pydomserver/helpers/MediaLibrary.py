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

from mpd import MPDClient

from ..Errors import ObjectError
from ..Objects import ObjectProvider, ObjectProcessor
from ..SocketInterfaceCodes import SIC
from .media.Import import LobbyWatcherThread
from .media.Music import MusicLibrary, MusicTypes


class MLObjectProvider(ObjectProvider):
    """Media library object provider
    
    Provides:
        media:music-artist/<artist>
        media:music-album/<artist>/<album>
        media:music-track/<artist>/<album>/<title>
    """
    
    def __init__(self, domserver, helper):
        ObjectProvider.__init__(self, domserver, 'media')
        self.music = helper['music']
        self.mpd = helper['mpd']
        
    def get_oids(self):
        mpd_oids = ['mpd-item/%d' % i for i in range(len(self.mpd.playlist()))]
        return mpd_oids
        
    def _decompose_oid(self, oid):
        """Validate and decompose an object id"""
        
        desc = []
        try:
            kind, desc = oid.split('/', 1)
        except ValueError:
            return False
            
        if kind in ('mpd-item', 'music-artist'):
            return [kind, desc]
        elif kind == 'music-album':
            try:
                artist, album = desc.split('/', 1)
            except ValueError:
                return False
            return [kind, artist, album]
        elif kind == 'music-track':
            try:
                artist, album, title = desc.split('/', 2)
            except ValueError:
                return False
            return [kind, artist, album, title]
        else:
            return False
        
    def valid_oid(self, oid):
        if oid in self.get_oids():
            return True
    
        desc = self._decompose_oid(oid)
        if not desc:
            return False
            
        if desc[0] == 'music-artist':
            return self.music.get_artist_id(desc[1]) is not None
        elif desc[0] == 'music-album':
            return self.music.get_album_id(desc[1], desc[2]) is not None
        elif desc[0] == 'music-track':
            return self.music.get_track_id(desc[1], desc[2], desc[3]) is not None
            
        return False
            
    def get_types(self, oid):
        desc = self._decompose_oid(oid)
        if desc[0] == 'music-artist':
            return ['music', 'music-artist', 'folder']
        elif desc[0] == 'music-album':
            return ['music', 'music-album', 'folder']
        elif desc[0] == 'music-track':
            return ['music', 'music-track', 'file']
        elif desc[0] == 'mpd-item':
            return ['music', 'mpd-item', 'file']

    def get_value(self, oid, prop):
        types = self.get_types(oid)
        desc = self._decompose_oid(oid)
 
        if 'music-artist' in types:
            artist = desc[1]
            if prop in ('keywords', 'name'):
                return artist
            elif prop == 'id':
                return self.music.get_artist_id(artist)
            elif ('file' in types or 'folder' in types) and prop == 'path':
                meta = {'artist': artist}
                return self.music.meta_to_filename(meta, MusicTypes.ARTIST)
                
        if 'music-album' in types:
            artist, album = desc[1:3]
            album_id = self.music.get_album_id(artist, album)
            if prop == 'keywords':
                return "%s %s" % (artist, album)
            elif prop == 'title':
                return album
            elif prop == 'artist':
                return artist
            elif prop == 'id':
                return album_id
            elif ('file' in types or 'folder' in types) and prop == 'path':
                meta = {'artist': artist, 'album': album}
                return self.music.meta_to_filename(meta, MusicTypes.ALBUM)
            elif prop in ('year', 'genre'):
                meta = self.music.get_album_metadata(album_id)
                return meta[prop]
                
        if 'music-track' in types:
            artist, album, title = desc[1:4]
            track_id = self.music.get_track_id(artist, album, title)
            if prop == 'keywords':
                return "%s %s %s" % (artist, album, title)
            elif prop == 'title':
                return title
            elif prop == 'album':
                return album
            elif prop == 'artist':
                return artist
            elif prop == 'id':
                return track_id
            else:
                meta = self.music.get_track_metadata(track_id)
                if ('file' in types or 'folder' in types) and prop == 'path':
                    return self.music.meta_to_filename(meta, MusicTypes.TRACK)
                elif prop in ('year', 'genre', 'len', 'fmt', 'num'):
                    return meta[prop]
                    
        if 'mpd-item' in types:
            idx = int(desc[1])
            relpath = self.mpd.playlist()[idx]
            abspath = "%s/%s" % (self.domserver.config['media.music_dir'], 
                relpath)
            meta, mtype = self.music.filename_to_meta(relpath)
            if prop == 'keywords':
                return '%s %s %s' % (meta['artist'], meta['album'],
                    meta['title'])
            elif prop == 'pos':
                return idx
            elif prop == 'ml_objref':
                return 'music-track/%s/%s/%s' % (meta['artist'], meta['album'],
                    meta['title'])
            elif ('file' in types or 'folder' in types) and prop == 'path':
                return abspath
            
        raise KeyError("Object '%s' has no property '%s'" % (oid, prop))
        
    def set_value(self, oid, prop, val):
        raise KeyError('MediaLibrary does not support writing')
        
    def describe_props(self, oid, detail_level):
        types = self.get_types(oid)
        props = []
        if 'music' in types:
            props.extend(['keywords'])
        if 'music-artist' in types:
            props.extend(['id', 'name'])
        if 'music-album' in types:
            props.extend(['id', 'title', 'year', 'genre', 'artist'])
        if 'music-track' in types:
            props.extend(['id', 'album', 'year', 'genre', 'artist', 'title',
                'num', 'len', 'fmt'])
        if 'mpd-item' in types:
            props.extend(['pos', 'ml_objref'])
        if 'file' in types or 'folder' in types:
            props.extend(['path'])
        
        desc = {}
        for k in props:
            if k in ('keywords', 'name', 'title', 'genre', 'artist', 'album',
                'fmt', 'path', 'ml_objref'):
                desc[k] = {'type': 'string'}
            elif k in ('id', 'year', 'num', 'len', 'pos'):
                desc[k] = {
                    'type': 'uint32',
                    'conv': lambda x: int(x)
                }
        return desc
        
    def matching_oids(self, expr, types):
        oids = []
        types = types or []
        
        if 'music-track' in types:
            track_ids = self.music.match(expr, MusicTypes.TRACK)
            for i in track_ids:
                m = self.music.get_track_metadata(i)
                oids.append('music-track/%s/%s/%s' % (m['artist'], m['album'],
                    m['title']))
        if 'music-album' in types:
            album_ids = self.music.match(expr, MusicTypes.ALBUM)
            for i in album_ids:
                m = self.music.get_album_metadata(i)
                oids.append('music-album/%s/%s' % (m['artist'], m['title']))
        if 'music-artist' in types:
            artist_ids = self.music.match(expr, MusicTypes.ARTIST)
            for i in artist_ids:
                m = self.music.get_artist_metadata(i)
                oids.append('music-artist/%s' % m['name'])
                
        oids.extend(ObjectProvider.matching_oids(self, expr, types))
        return oids


class MLObjectProcessor(ObjectProcessor):

    def __init__(self, domserver, helper):
        ObjectProcessor.__init__(self, domserver, 'media')
        self.objs = helper['objs']
        self.music = helper['music']
        
    def get_action_names(self, obj):
        names = []
        
        if obj.is_a('music-artist'):
            names.extend(['edit-artist'])
        if obj.is_a('music-album'):
            names.extend(['edit-album'])
        if obj.is_a('music-track'):
            names.extend(['edit-track'])
        if obj.is_a('music'):
            names.extend(['remove', 'mpd-play', 'mpd-enqueue'])
            
        return names
        
    def describe_action(self, act):
        name = act.name
        obj = act.obj
        
        if name == 'edit-artist':
            act.add_param('name', SIC.APFLAG_TYPE_STRING, obj['name'])
        elif name == 'edit-album':
            act.add_param('artist', SIC.APFLAG_TYPE_STRING, obj['artist'])
            act.add_param('title', SIC.APFLAG_TYPE_STRING, obj['title'])
            act.add_param('year', SIC.APFLAG_TYPE_NUMBER, obj['year'])
            act.add_param('genre', SIC.APFLAG_TYPE_STRING, obj['genre'])
        elif name == 'edit-track':
            act.add_param('artist', SIC.APFLAG_TYPE_STRING, obj['artist'])
            act.add_param('album', SIC.APFLAG_TYPE_STRING, obj['album'])
            act.add_param('num', SIC.APFLAG_TYPE_NUMBER, obj['num'])
            act.add_param('title', SIC.APFLAG_TYPE_STRING, obj['title'])
    
    def execute_action(self, act):
        name = act.name
        obj = act.obj
        
        if name == 'edit-artist':
            meta = self.music.get_artist_metadata(obj['id'])
            meta['artist'] = act['name']
            self.music.update_artist(meta, obj['id'])
        elif name == 'edit-album':
            meta = self.music.get_album_metadata(obj['id'])
            meta['artist'] = act['artist']
            meta['album'] = act['title']
            meta['year'] = act['year']
            meta['genre'] = act['genre']
            self.music.update_album(meta, obj['id'])
        elif name == 'edit-track':
            metaa = self.music.get_track_metadata(obj['id'])
            meta['artist'] = act['artist']
            meta['album'] = act['album']
            meta['num'] = act['num']
            meta['title'] = act['title']
            self.music.update_track(meta, obj['id'])

class MPDWrapper:
    
    def __init__(self, domserver):
        self.domserver = domserver
    
    def connect(self):
        client = MPDClient()
        client.connect(
            self.domserver.config['media.mpd_host'],
            int(self.domserver.config['media.mpd_port'])
        )
        client.password(self.domserver.config['media.mpd_password'])
        return client
        
    def playlist(self):
        client = self.connect()
        ret = client.playlist()
        client.disconnect()
        return ret
        

class MediaLibraryHelper:

    def __init__(self, domserver):
        self.domserver = domserver
        self.domserver.info("Initializing media library helper")
        self.logger = domserver.get_logger('media.log_file', 'media.log_level')
        
        self.mpd = MPDWrapper(self.domserver)
        self.music = MusicLibrary(self.domserver, self.logger)
        
        self.lw_thread = LobbyWatcherThread(self.domserver, self.logger, self)
        ret = self.domserver.add_thread(self.lw_thread, True)
        
        self.objs = MLObjectProvider(domserver, self)
        self.proc = MLObjectProcessor(domserver, self)
        
        domserver.register_object_interface(
            name='media',
            provider=self.objs,
            processor=self.proc
        )
        
    def __getitem__(self, key):
        if key == 'music':
            return self.music
        elif key == 'mpd':
            return self.mpd
        elif key == 'objs':
            return self.objs
        else:
            raise KeyError("MediaLibraryHelper has no key '%s'" % key)
        
