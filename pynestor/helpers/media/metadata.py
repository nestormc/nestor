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

from mutagen.easyid3 import EasyID3
from mutagen.flac import FLAC, FLACNoHeaderError
from mutagen.id3 import ID3NoHeaderError, ID3BadCompressedData
from mutagen.monkeysaudio import MonkeysAudio
from mutagen.mp3 import MP3, HeaderNotFoundError
from mutagen.mp4 import MP4
from mutagen.musepack import Musepack
from mutagen.oggvorbis import OggVorbis, OggVorbisHeaderError
import os.path

from ...errors import ImplementationError


class InvalidTagError(Exception): pass

class TagWrapper():
    tag = None
    filename = None
    keys = None
    emptytag = False
    found_tags = {}

    def __init__(self, *args):
        raise ImplementationError
        
    def tryReadTag(self, keys, type = 'str'):
        tag = None
        key = None
        for k in keys:
            if self.tag.has_key(k):
                ntag = self.tag[k]
                if isinstance(ntag, list):
                    ntag = ntag[0]
                if type == 'str':
                    ntag = unicode(ntag)
                elif type in ('lst', '2numbers'):
                    ntag = unicode(ntag[0])
                    
                if tag == None or (tag == '' and ntag != ''):
                    tag = ntag
                    key = k
                if tag == '':
                    tag = None
        return [tag, key]
        
    def tryWriteTag(self, key, value, type = 'str'):
        if type == 'str':
            self.tag[key] = [value]
        elif type == 'lst':
            self.tag[key] = [(value)]    
        elif type == '2numbers':
            try:
                val = int(value)
            except ValueError, TypeError:
                val = 0
            self.tag[key] = [(val, val)]

    def save(self):
        if self.emptytag:
            self.tag.save(self.filename)
        else:
            self.tag.save()

    def readTag(self, key):
        rtype, rkeys = self.keys[key]
        t, k = self.tryReadTag(rkeys, rtype)
        if k:
            self.found_tags[key] = k
        return t
        
    def writeTag(self, key, value):
        rtype, rkeys = self.keys[key]
        if key in self.found_tags:
            rkeys = [self.found_tags[key]]
        self.tryWriteTag(rkeys[0], value, rtype)
        

class FLACTag(TagWrapper):

    def __init__(self, filename):
        self.filename = filename
        try:
            self.tag = FLAC(filename)
        except FLACNoHeaderError, e:
            raise InvalidTagError(e)
        self.keys = {
            'artist': ['str', ['album artist', 'artist']],
            'album': ['str', ['album']],
            'title': ['str', ['title']],
            'trackno': ['str', ['tracknumber']],
            'year': ['str', ['date']],
            'genre': ['str', ['genre']]
        }
        
    def get_length(self):
        return self.tag.info.length
                
        
class MP3Tag(TagWrapper):

    def __init__(self, filename):
        self.filename = filename
        try:
            self.tag = EasyID3(filename)
        except ID3NoHeaderError:
            self.tag = EasyID3()
            self.emptytag = True
        except ID3BadCompressedData, e:
            raise InvalidTagError(e)
        self.keys = {
            'artist': ['str', ['artist']],
            'album': ['str', ['album']],
            'title': ['str', ['title']],
            'trackno': ['str', ['tracknumber']],
            'year': ['str', ['date']],
            'genre': ['str', ['genre']]
        }
        
    def get_length(self):
        try:
            mp3tag = MP3(self.filename)
        except HeaderNotFoundError:
            return -1
        else:
            return mp3tag.info.length
        
        
class OGGTag(TagWrapper):

    def __init__(self, filename):
        self.filename = filename
        try:
            self.tag = OggVorbis(filename)
        except OggVorbisHeaderError, e:
            raise InvalidTagError(e)
        self.keys = {
            'artist': ['str', ['artist']],
            'album': ['str', ['album']],
            'title': ['str', ['title']],
            'trackno': ['str', ['tracknumber']],
            'year': ['str', ['date']],
            'genre': ['str', ['genre']]
        }
        
    def get_length(self):
        return self.tag.info.length
        
        
class MP4Tag(TagWrapper):

    def __init__(self, filename):
        self.filename = filename
        self.tag = MP4(filename)
        self.keys = {
            'artist': ['str', ['aART', '\xa9ART', '\xa9art']],
            'album': ['str', ['\xa9alb']],
            'title': ['str', ['\xa9nam']],
            'trackno': ['2numbers', ['trkn']],
            'year': ['str', ['\xa9day']],
            'genre': ['str', ['\xa9gen', 'gnre']]
        }
        
    def get_length(self):
        return self.tag.info.length
        
        
class APETag(TagWrapper):

    def __init__(self, filename):
        self.filename = filename
        self.tag = MonkeysAudio(filename)
        self.keys = {
            'artist': ['str', ['artist', 'Artist']],
            'album': ['str', ['album', 'Album']],
            'title': ['str', ['title', 'Title']],
            'trackno': ['lst', ['track', 'Track']],
            'year': ['str', ['year', 'Year']],
            'genre': ['str', ['genre', 'Genre']]
        }
        
    def get_length(self):
        return self.tag.info.length
        
        
class MPCTag(TagWrapper):

    def __init__(self, filename):
        self.filename = filename
        self.tag = Musepack(filename)
        self.keys = {
            'artist': ['str', ['artist', 'Artist']],
            'album': ['str', ['album', 'Album']],
            'title': ['str', ['title', 'Title']],
            'trackno': ['lst', ['track', 'Track']],
            'year': ['str', ['year', 'Year']],
            'genre': ['str', ['genre', 'Genre']]
        }
        
    def get_length(self):
        return self.tag.info.length


class Metadata:
    MEDIA_UNKNOWN = 'MEDIA_UNKNOWN'
    MEDIA_MUSIC   = 'MEDIA_MUSIC'
    
    _RO_KEYS = ['path', 'media', 'ext', 'length']
    _MUSIC_KEYS = ['artist', 'album', 'title', 'trackno', 'genre', 'year']
    _MUSIC_TAGS = {
        'fla': FLACTag, 'flac': FLACTag,
        'm4a': MP4Tag, 'mp4': MP4Tag,
        'mpc': MPCTag,
        'ape': APETag,
        'mp3': MP3Tag,
        'ogg': OGGTag
    }

    def __init__(self, path):
        self.data = {'path': path, 'media': self.MEDIA_UNKNOWN, 'ext': ''}
        self.tag = None
        self.err_msg = ''
        self.parse()
        
    def __getitem__(self, key):
        return self.data[key]
        
    def __setitem__(self, key, value):
        if key in self._RO_KEYS:
            raise KeyError("Key '%s' is read-only" % key)
            
        if self.tag:
            self.tag.writeTag(key, value)
            self.data[key] = value
        else:
            raise KeyError("Cannot write tags")
            
    def __repr__(self):
        return '{%s}' % [
            "%s: %r" % (k, self.data[k]) for k in self.data.keys()
        ].join(', ')
        
    def keys(self):
        return self.data.keys()
        
    def has_key(self, key):
        return self.data.has_key(key)
        
    def save(self):
        if self.tag:
            self.tag.save()
    
    def parse(self):
        try:
            ext = os.path.basename(self['path']).rsplit('.', 1)[1].lower()
        except IndexError:
            self.err_msg = "Could not find file extension"
            return
        self.data['ext'] = ext
            
        if ext in self._MUSIC_TAGS:
            try:
                self.tag = self._MUSIC_TAGS[ext](self['path'])
            except InvalidTagError, e:
                self.err_msg = e
                return
                
            self.data['media'] = self.MEDIA_MUSIC
            for k in self._MUSIC_KEYS:
                self.data[k] = self.tag.readTag(k)
            self.data['length'] = self.tag.get_length()
        else:
            self.err_msg = "Unsupported extension '%s'" % ext
            
