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

from ..Errors import ObjectError
from ..Objects import ObjectProvider, ObjectProcessor
from ..SocketInterfaceCodes import SIC
from .media.Import import LobbyWatcherThread
from .media.Music import MusicLibrary


class MLObjectProvider(ObjectProvider):
    """Media library object provider
    
    Provides:
        media:music-artist/<artist>
        media:music-album/<artist>/<album>
        media:music-track/<artist>/<album>/<title>
    """
    
    def __init__(self, domserver, music):
        ObjectProvider.__init__(self, domserver, 'media')
        self.music = music
        
    def get_oids(self):
        return []
        
    def _decompose_oid(self, oid):
        """Validate and decompose an object id"""
        
        desc = []
        try:
            kind, desc = oid.split('/', 1)
        except ValueError:
            return False
            
        if kind == 'music-artist':
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
        desc = self._decompose_oid(oid)
        if not desc:
            return False
            
        if desc[0] == 'music-artist':
            return self.music.get_artist_id(desc[1]) is not None
        elif desc[0] == 'music-album':
            return self.music.get_album_id(desc[1], desc[2]) is not None
        elif desc[0] == 'music-track':
            return self.music.get_track_id(desc[1], desc[2], desc[3]) is not None
            
    def get_types(self, oid):
        desc = self._decompose_oid(oid)
        if desc[0] == 'music-artist':
            return ['music', 'music-artist', 'folder']
        elif desc[0] == 'music-album':
            return ['music', 'music-album', 'folder']
        elif desc[0] == 'music-track':
            return ['music', 'music-track', 'file']

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
                return self.music.meta_to_filename(meta, 2)
                
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
                return self.music.meta_to_filename(meta, 1)
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
                meta = self.music.get_metadata(track_id)
                if ('file' in types or 'folder' in types) and prop == 'path':
                    return self.music.meta_to_filename(meta)
                elif prop in ('year', 'genre', 'len', 'fmt', 'num'):
                    return meta[prop]
            
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
        if 'file' in types or 'folder' in types:
            props.extend(['path'])
        
        desc = {}
        for k in props:
            if k in ('keywords', 'name', 'title', 'genre', 'artist', 'album',
                'fmt', 'path'):
                desc[k] = {'type': 'string'}
            elif k in ('year', 'num', 'len'):
                desc[k] = {
                    'type': 'uint32',
                    'conv': lambda x: int(x)
                }
        return desc
        
    def matching_oids(self, expr, types):
        oids = []
        types = types or []
        
        if 'music-track' in types:
            track_ids = self.music.match(expr, 0)
            for i in track_ids:
                m = self.music.get_metadata(i)
                oids.append('music-track/%s/%s/%s' % (m['artist'], m['album'],
                    m['title']))
        if 'music-album' in types:
            album_ids = self.music.match(expr, 1)
            for i in album_ids:
                m = self.music.get_album_metadata(i)
                oids.append('music-album/%s/%s' % (m['artist'], m['title']))
        if 'music-artist' in types:
            artist_ids = self.music.match(expr, 2)
            for i in artist_ids:
                m = self.music.get_artist_metadata(i)
                oids.append('music-artist/%s' % m['name'])
                
        return oids

class MediaLibraryHelper:

    def __init__(self, domserver):
        self.domserver = domserver
        self.domserver.info("Initializing media library helper")
        self.logger = domserver.get_logger('media.log_file', 'media.log_level')
        
        self.music = MusicLibrary(self.domserver, self.logger)
        
        self.lw_thread = LobbyWatcherThread(self.domserver, self.logger,
            self.music)
        ret = self.domserver.add_thread(self.lw_thread, True)
        
        self.objs = MLObjectProvider(domserver, self.music)
        #self.proc = AmuleObjectProcessor(domserver, 'amule', self.objs)
        
        domserver.register_object_interface(
            name='media',
            provider=self.objs
        #    processor=self.proc
        )
        
        
