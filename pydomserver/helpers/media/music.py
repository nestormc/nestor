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

import os
import os.path
import re
import shutil
import urllib
import urllib2

from .errors import MediaImportError, MediaUpdateError
from .metadata import Metadata


class MusicTypes:
    TRACK = 0
    ALBUM = 1
    ARTIST = 2

class MusicLibrary:
    """Music library utility class.
    
    Manipulate the music library metadata and directory tree.
    
    The 'meta' argument to methods of this class is a dict with the following
    contents:
        artist      album artist name (1)
        year        album release year (2)
        album       album title (incl. disc number if appropriate) (1)
        num         album track number (2)
        title       track title (1)
        genre       album genre
        len         track length in seconds
        fmt         lowercase track format (eg. 'ogg', 'flac'...)
        
    Fields marked with (1) must not be empty.
    Fields marked with (2) must be -1 if unknown
    
    For some specific methods, only partial metadata is needed.  See those
    methods' docstrings.
    """
    
    fnchars_replace = {'/': '_'}

    def __init__(self, domserver, logger=None):
        self.domserver = domserver
        self.log = logger if logger else domserver
            
    def __del__(self):
        self.close_mdb()
        
    def cleanup_database(self):
        """Cleanup obsolete data in database (eg. albums w/o tracks or artists
        w/o albums)"""
        
        db = self.domserver.get_media_db()
        
        script = """
            DELETE FROM music_albums al WHERE NOT EXISTS
                (SELECT * FROM music_tracks tr WHERE tr.album_id = al.id);
            DELETE FROM music_artists ar WHERE NOT EXISTS
                (SELECT * FROM music_albums al WHERE al.artist_id = ar.id);
        """
            
        db.executescript(script)
        db.commit()
        db.close()
        
    def get_sortname(self, name):
        """Compute the sortname for a given artist name.
        
        Use the 'media.deter' config key to delete starting determiners. Also
        delete any non-alphanumeric char.
        """
        
        det = self.domserver.config['media.deter'].split(',')
        reg_det = re.compile("^(" + '|'.join(det) + ')\s+', re.I)
        reg_alnum = re.compile("[^a-z0-9]", re.I)
        return reg_alnum.sub('', reg_det.sub('', name)).lower()
        
    def match_artist(self, artist):
        """Find a matching artist name in database.
        
        Try to find an artist name in database that matches 'artist' in several
        ways, eg. by ignoring "The", hyphens, commas and character case.  If
        nothing is found, return 'artist'.
        """
        
        def xform(s, deter):
            xs = re.sub('[][,)(.-]', ' ', s.lower())
            xs = re.sub('\s+', ' ', xs)
            reg = re.compile("^(" + '|'.join(deter) + ')\s+', re.I)
            return reg.sub('', xs)
        
        
        query = "SELECT name FROM music_artists ORDER BY name"
        db = self.domserver.get_media_db()
        names = [r[0] for r in db.execute(query).fetchall()]
        db.close()
        
        det = self.domserver.config['media.deter'].split(',')
        for n in names:
            if xform(n, det) == xform(artist, det):
                return n
                
        return artist
        
    def fnchars(self, string):
        for k in self.fnchars_replace:
            string = string.replace(k, self.fnchars_replace[k])
        return string
        
    def meta_to_coverfile(self, meta):
        return os.path.join(
            self.meta_to_filename(meta, MusicTypes.ALBUM),
            'cover.jpg'
        )
        
    def meta_to_filename(self, meta, typ=MusicTypes.TRACK):
        if typ == MusicTypes.ARTIST:
            return os.path.join(
                self.domserver.config['media.music_dir'],
                self.fnchars(meta['artist'])
            )
        elif typ == MusicTypes.ALBUM:
            return os.path.join(
                self.domserver.config['media.music_dir'],
                self.fnchars(meta['artist']),
                self.fnchars(meta['album'])
            )
        elif typ == MusicTypes.TRACK:
            if meta['num'] != -1:
                fname = "%02d - %s" % (meta['num'],self.fnchars(meta['title']))
            else:
                fname = self.fnchars(meta['title'])
        
            return os.path.join(
                self.domserver.config['media.music_dir'],
                self.fnchars(meta['artist']),
                self.fnchars(meta['album']),
                "%s.%s" % (fname, meta['fmt'])
            )
            
    def filename_to_meta(self, path):
        spath = path.split('/')
        
        if len(spath) == 1:
            artist_id = self.get_artist_id(spath[0])            
            if artist_id:
                return (self.get_artist_metadata(artist_id), MusicTypes.ARTIST)
                
        if len(spath) == 2:
            album_id = self.get_album_id(spath[0], spath[1])
            if album_id:
                return (self.get_album_metadata(album_id), MusicTypes.ALBUM)
                
        if len(spath) == 3:
            title = re.sub("^(\d+ - )?", "", spath[2].rsplit('.', 1)[0])
            track_id = self.get_track_id(spath[0], spath[1], title)
            if track_id:
                return (self.get_track_metadata(track_id), MusicTypes.TRACK)
        
        return (None, None)
        
    def get_artist_id(self, artist):
        query = "SELECT id, name FROM music_artists WHERE name LIKE ?"
        db = self.domserver.get_media_db()
        rset = db.execute(query, (self.fnchars(artist),)).fetchall()
        db.close()
        ret = None
        for artist_id, name in rset:
            if self.fnchars(name) == self.fnchars(artist):
                ret = artist_id
                break
                
        return ret
        
    def get_artist_metadata(self, artist_id):            
        query = "SELECT name FROM music_artists WHERE id = ?"
        db = self.domserver.get_media_db()
        rset = db.execute(query, (artist_id,)).fetchone()
        db.close
        
        meta = {
            'artist': rset[0]
        }
        
        return meta
        
    def get_artist_albumids(self, artist_id):
        query = "SELECT id FROM music_albums WHERE artist_id = ?"
        db = self.domserver.get_media_db()
        rset = db.execute(query, (artist_id,)).fetchall()
        db.close()
        return [r[0] for r in rset]
        
    def write_artist_metadata(self, meta, artist_id=None):
        """Write artist metadata in database.
        
        Only the 'artist' key of metadata is needed here.
        Should not be called directly; use update_artist instead (which also
        moves files)
        """
        
        db = self.domserver.get_media_db()
        
        if artist_id is None:
            query = """INSERT OR REPLACE INTO music_artists(name, sortname)
                VALUES(?,?)"""
            data = (meta['artist'], self.get_sortname(meta['artist']))
            artist_id = db.execute(query, data).lastrowid
        else:
            query = """UPDATE music_artists SET name = ?, sortname = ?
                WHERE id = ?"""
            data = (meta['artist'], self.get_sortname(meta['artist']),
                artist_id)
            db.execute(query, data)
        
        db.commit()
        db.close()
        return artist_id
        
    def update_artist(self, meta, artist_id):
        """Update an artist.
        
        Only the 'artist' key of metadata is needed here.
        Update metadata in database and move associated files.
        """
            
        oldmeta = self.get_artist_metadata(artist_id)
        oldpath = self.meta_to_filename(oldmeta, MusicTypes.ARTIST)
        newpath = self.meta_to_filename(meta, MusicTypes.ARTIST)
        
        if oldpath != newpath:
            if os.path.exists(newpath):
                raise MediaUpdateError("Artist '%s' already exists" % meta['artist'])
            shutil.move(oldpath, newpath)
        self.write_artist_metadata(meta)
        
        for album_id in self.get_artist_albumids(artist_id):
            for track_id in self.get_album_trackids(album_id):
                tmeta = self.get_track_metadata(track_id)
                self.write_file_tags(tmeta)
        
    def get_album_id(self, artist, album):
        artist_id = self.get_artist_id(artist)
        ret = None
        if artist_id:
            query = """SELECT id, title FROM music_albums
                WHERE artist_id = ? AND title LIKE ?"""
            db = self.domserver.get_media_db()
            rset = db.execute(query, (artist_id, self.fnchars(album))).fetchall()
            db.close()
            for album_id, title in rset:
                if self.fnchars(title) == self.fnchars(album):
                    ret = album_id
                    break
        return ret
        
    def get_album_metadata(self, album_id):
        query = """SELECT al.title, al.year, al.genre, ar.name
            FROM music_albums al JOIN music_artists ar ON al.artist_id = ar.id
            WHERE al.id = ?"""
        db = self.domserver.get_media_db()
        rset = db.execute(query, (album_id,)).fetchone()
        db.close()
        
        meta = {
            'album': rset[0],
            'year': rset[1],
            'genre': rset[2],
            'artist': rset[3]
        }
        return meta
        
    def get_album_trackids(self, album_id):
        query = "SELECT id FROM music_tracks WHERE album_id=?"
        db = self.domserver.get_media_db()
        rset = db.execute(query, (album_id,)).fetchall()
        db.close()
        return [r[0] for r in rset]
        
    def write_album_metadata(self, meta, album_id=None):
        """Write album metadata.
        
        Write metadata in database and associated files.  The metadata keys
        needed here are artist, album, year and genre.  Should not be called
        directly, use update_album instead (which also moves files).
        """
        
        artist_id = self.get_artist_id(meta['artist'])
        db = self.domserver.get_media_db()
        
        if album_id is None:
            query = """INSERT OR REPLACE INTO music_albums (artist_id, title,
                year, genre) VALUES(?, ?, ?, ?)"""
            data = (artist_id, meta['album'], meta['year'], meta['genre'])
            album_id = db.execute(query, data).lastrowid
        else:
            query = """UPDATE music_albums SET artist_id = ?, title = ?,
                year = ?, genre = ? WHERE id = ?"""
            data = (artist_id, meta['album'], meta['year'], meta['genre'],
                album_id)
            db.execute(query, data)
        
        db.commit()
        db.close() 
        return album_id
        
    def update_album(self, meta, album_id):
        """Update album metadata.
        
        The metadata keys needed here are artist, album, year and genre.
        Update metadata in database and move associated files.
        """
        
        oldmeta = self.get_album_metadata(album_id)
        
        if meta['artist'] != oldmeta['artist']:
            artist_id = self.get_artist_id(meta['artist'])
            if not artist_id:
                os.makedirs(self.meta_to_filename(meta, MusicTypes.ARTIST))
                artist_id = self.write_artist_metadata(meta)
                
        oldpath = self.meta_to_filename(oldmeta, MusicTypes.ALBUM)
        newpath = self.meta_to_filename(meta, MusicTypes.ALBUM)
        
        if oldpath != newpath:
            if os.path.exists(newpath):
                raise MediaUpdateError("Album '%s/%s' already exists" % (
                    meta['artist'], meta['album']))
            shutil.move(oldpath, newpath)
        self.write_album_metadata(meta)
        
        for track_id in self.get_album_trackids(album_id):
            tmeta = self.get_track_metadata(track_id)
            self.write_file_tags(tmeta)
        
    def search_album_cover(self, album_id):
        meta = self.get_album_metadata(album_id)
        finders = [AlbumartOrgCoverFinder()]
        urls = []
        for f in finders:
            urls.extend(f.search_cover(meta['artist'], meta['album']))
            if len(urls):
                self.fetch_album_cover(album_id, urls[0])
                break
                    
    def fetch_album_cover(self, album_id, url):
        meta = self.get_album_metadata(album_id)
        op = urllib2.build_opener()
        if url:
            try:
                img = op.open(url)
            except urllib2.HTTPError, e:
                self.log.debug("HTTPError while fetching '%s' (%s)" % (url,e))
            else:
                fimg = open(self.meta_to_coverfile(meta), 'w')
                fimg.write(img.read())
                fimg.close()
                img.close()
            
    def has_album_cover(self, album_id):
        meta = self.get_album_metadata(album_id)
        return os.path.exists(self.meta_to_coverfile(meta))
        
    def get_track_id(self, artist, album, track):
        album_id = self.get_album_id(artist, album)
        ret = None
        if album_id:
            query = """SELECT id, title FROM music_tracks
                WHERE album_id = ? AND title LIKE ?"""
            db = self.domserver.get_media_db()
            rset = db.execute(query, (album_id, self.fnchars(track))).fetchall()
            db.close()
            for track_id, title in rset:
                if self.fnchars(title) == self.fnchars(track):
                    ret = track_id
                    break
        return ret
            
    def get_track_metadata(self, track_id):
        query = """
            SELECT ar.name, al.title, al.year, al.genre, tr.title,
                   tr.tracknum, tr.length, tr.format
            FROM music_tracks tr
                 JOIN music_albums al ON tr.album_id = al.id
                 JOIN music_artists ar ON al.artist_id = ar.id
            WHERE tr.id = ?
        """
        mapping = ['artist','album','year','genre','title','num','len','fmt']
        
        db = self.domserver.get_media_db()
        data = db.execute(query, (track_id,)).fetchone()
        db.close()
        
        meta = {}
        if data:
            for i in range(len(mapping)):
                meta[mapping[i]] = data[i]
        return meta
        
    def write_file_tags(self, meta):
        """Write metadata to file tags"""
        
        path = self.meta_to_filename(meta, MusicTypes.TRACK)
        self.log.debug("Writing tags in '%s'" % path)
        
        filemeta = Metadata(path)
        filemeta['artist'] = meta['artist']
        filemeta['album'] = meta['album']
        filemeta['title'] = meta['title']
        filemeta['trackno'] = str(meta['num']) if meta['num'] != -1 else ''
        filemeta['genre'] = meta['genre']
        filemeta['year'] = str(meta['year']) if meta['year'] != -1 else '' 
        filemeta.save()
        
    def write_track_metadata(self, meta, track_id=None):
        """Write track metadata.
        
        Update (or insert if track_id is None) track metadata in database; write
        metadata to file tags.
        Should not be called directly, use update_track instead (which also
        moves files when necessary)
        """
        
        album_id = self.get_album_id(meta['artist'], meta['album'])
        db = self.domserver.get_media_db()
        
        if track_id is None:
            query = """INSERT OR REPLACE INTO music_tracks (album_id, title,
                tracknum, length, format) VALUES (?,?,?,?,?)"""
            data = (album_id, meta['title'], meta['num'], meta['len'],
                meta['fmt'])
            track_id = db.execute(query, data).lastrowid
        else:
            query = """UPDATE music_tracks SET album_id=?, title=?, tracknum=?,
                length=?, format=? WHERE id=?"""
            data = (album_id, meta['title'], meta['num'], meta['len'],
                meta['fmt'], track_id)
            db.execute(query, data)
        
        db.commit()
        db.close()
        return track_id
        
    def update_track(self, meta, track_id):
        """Update track metadata.
        
        Update metadata in database and move the associated file.
        """
        
        oldmeta = self.get_track_metadata(track_id)
         
        if meta['artist'] != oldmeta['artist']:
            artist_id = self.get_artist_id(meta['artist'])
            if not artist_id:
                os.makedirs(self.meta_to_filename(meta, MusicTypes.ARTIST))
                artist_id = self.write_artist_metadata(meta)
        
        if meta['album'] != oldmeta['album']:
            album_id = self.get_album_id(meta['artist'], meta['album'])
            if not album_id:
                os.makedirs(self.meta_to_filename(meta, MusicTypes.ALBUM))
                album_id = self.write_album_metadata(meta)
        
        oldpath = self.meta_to_filename(oldmeta, MusicTypes.TRACK)
        newpath = self.meta_to_filename(meta, MusicTypes.TRACK)
        
        if oldpath != newpath:
            if os.path.exists(newpath):
                raise MediaUpdateError("Track '%s/%s/%s' already exists" % (
                    meta['artist'], meta['album'], meta['title']))
            shutil.move(oldpath, newpath)
        self.write_track_metadata(meta, track_id)
        self.write_file_tags(meta)

    def import_track(self, path, meta, move=False):
        """Import a music track into the media library
        
        Copy 'path' into the media library folder and insert metadata in
        database.
        """
        
        mlpath = self.meta_to_filename(meta)
        if os.path.exists(mlpath):
            raise MediaImportError("File exists (%s)" % mlpath)
        
        artist_id = self.get_artist_id(meta['artist'])
        album_id = self.get_album_id(meta['artist'], meta['album'])
        if album_id:
            old = self.get_album_metadata(album_id)
            for k in (['year', -1], ['genre', '']):
                meta[k[0]] = meta[k[0]] if meta[k[0]] != k[1] else old[k[0]]
            
        try:
            os.makedirs(os.path.dirname(mlpath))
        except os.error:
            pass
            
        if move:
            shutil.move(path, mlpath)
        else:
            shutil.copy(path, mlpath)
            
        artist_id = self.write_artist_metadata(meta, artist_id)
        album_id = self.write_album_metadata(meta, album_id)
        if not self.has_album_cover(album_id):
            self.search_album_cover(album_id)
            
        track_id = self.write_track_metadata(meta)
        self.write_file_tags(meta)
        return [track_id, mlpath]
        
    def match(self, expr, typ=0, offset=0, limit=-1):
        """Match music library objects.
        
        Return a list of music library object ids matching an OExpression.
        'typ' tells what is searched: 0=track, 1=album, 2=artist
        """
        
        prop_map = {
            0: {
                'artist': 'ar.name',
                'album': 'al.title',
                'genre': 'al.genre',
                'year': 'al.year',
                'title': 'tr.title',
                'num': 'tr.tracknum',
                'fmt': 'tr.format',
                'len': 'tr.length',
                'keywords': "ar.name || ' ' || al.title || ' ' || tr.title"
            },
            1: {
                'artist': 'ar.name',
                'album': 'al.title',
                'year': 'al.year',
                'genre': 'al.genre',
                'keywords': "ar.name || ' ' || al.title"
            },
            2: {
                'artist': 'ar.name',
                'keywords': 'ar.name'
            }
        }
        
        queries = {
            0: """SELECT tr.id FROM music_tracks tr
                JOIN music_albums al ON tr.album_id = al.id
                JOIN music_artists ar ON al.artist_id = ar.id
                WHERE %s
                ORDER BY ar.sortname, al.year, al.title, tr.tracknum,
                         tr.title
                LIMIT %d OFFSET %d""",
            1: """SELECT al.id FROM music_albums al
                JOIN music_artists ar ON al.artist_id = ar.id
                WHERE %s
                ORDER BY ar.sortname, al.year, al.title
                LIMIT %d OFFSET %d""",
            2: """SELECT ar.id FROM music_artists ar
                WHERE %s
                ORDER BY ar.sortname
                LIMIT %d OFFSET %d"""
        }
        
        where, data = expr.to_sqlwhere(prop_map[typ])
        
        db = self.domserver.get_media_db()
        rset = db.execute(queries[typ] % (where,limit,offset), data).fetchall()
        db.close()
        return [r[0] for r in rset]
        

class CoverFinder():
    
    def search_cover(self, artist, album):
        """Return a list of cover art urls"""
        raise ImplementationError("search_cover not overriden")
        
        
class AlbumartOrgCoverFinder(CoverFinder):
        
    _SEARCH_URL=("http://www.albumart.org/index.php"
        "?srchkey=%s&itempage=1&newsearch=1&searchindex=Music")
    _RESULT_FILTER_RE="http://www\.albumart\.org/images/zoom-icon\.jpg"
    _IMAGE_MATCH_RE='<img src="([^"]+)" border="0" class="image_border"'
        
    def search_cover(self, artist, album):
        op = urllib2.build_opener()
        
        query = ("%s %s" % (artist, album)).encode('utf-8')
        try:
            search = op.open(self._SEARCH_URL % urllib.quote_plus(query))
        except urllib2.HTTPError:
            return []
            
        results = search.read()
        search.close()
        
        imgurls = []
        for line in results.splitlines():
            if re.search(self._RESULT_FILTER_RE, line):
                match = re.search(self._IMAGE_MATCH_RE, line)
                if match:
                    imgurls.append(match.group(1))
                    
        return imgurls
            
