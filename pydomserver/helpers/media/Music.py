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

import kaa.metadata as kmd
import os
import os.path
import re
import shutil

from .Errors import MediaImportError, MediaUpdateError


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

    def __init__(self, domserver, logger=None):
        self.domserver = domserver
        self.log = logger if logger else domserver            
        
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
        
        Use the 'media.deter' config key to delete starting determiners.
        """
        
        det = self.domserver.config['media.deter'].split(',')
        reg = re.compile("^(" + '|'.join(det) + ')\s+', re.I)
        return reg.sub('', name)
        
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
        
        db = self.domserver.get_media_db()
        query = "SELECT name FROM music_artists ORDER BY name"
        names = [r[0] for r in db.execute(query).fetchall()]
        db.close()
        
        det = self.domserver.config['media.deter'].split(',')
        for n in names:
            if xform(n, det) == xform(artist, det):
                return n
                
        return artist
        
    def meta_to_filename(self, meta, typ=MusicTypes.TRACK):
        if typ == MusicTypes.ARTIST:
            return os.path.join(
                self.domserver.config['media.music_dir'],
                meta['artist']
            )
        elif typ == MusicTypes.ALBUM:
            return os.path.join(
                self.domserver.config['media.music_dir'],
                meta['artist'],
                meta['album']
            )
        elif typ == MusicTypes.TRACK:
            if meta['num'] != -1:
                fname = "%02d - %s" % (meta['num'], meta['title'])
            else:
                fname = meta['title']
        
            return os.path.join(
                self.domserver.config['media.music_dir'],
                meta['artist'],
                meta['album'],
                "%s.%s" % (fname, meta['fmt'])
            )
            
    def filename_to_meta(self, path):
        self.log.debug('fn to meta: path=%s' % path)
        spath = path.split('/')
        self.log.debug('spath = %s' % repr(spath))
        
        if len(spath) == 1:
            artist_id = self.get_artist_id(spath[0])            
            if artist_id:
                return (self.get_artist_metadata(artist_id), MediaTypes.ARTIST)
                
        if len(spath) == 2:
            album_id = self.get_album_id(spath[0], spath[1])
            if album_id:
                return (self.get_album_metadata(album_id), MediaTypes.ALBUM)
                
        if len(spath) == 3:
            title = re.sub("^(\d+ - )?", "", spath[2])
            track_id = self.get_track_id(spath[0], spath[1], title)
            if track_id:
                return (self.get_track_metadata(track_id), MediaTypes.TRACK)
        
        return (None, None)
        
    def get_artist_id(self, artist):
        db = self.domserver.get_media_db()
        query = "SELECT id FROM music_artists WHERE name = ?"
        rset = db.execute(query, (artist,)).fetchone()
        db.close()
        return rset[0] if rset else None
        
    def get_artist_metadata(self, artist_id):
        db = self.domserver.get_media_db()
        query = "SELECT name FROM music_artists WHERE id = ?"
        rset = db.execute(query, (artist_id,)).fetchone()
        db.close
        return {
            'name': rset[0]
        }
        
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
        
    def get_album_id(self, artist, album):
        db = self.domserver.get_media_db()
        query = """SELECT al.id FROM music_albums al
            JOIN music_artists ar ON al.artist_id = ar.id
            WHERE ar.name = ? AND al.title = ?"""
        rset = db.execute(query, (artist, album)).fetchone()
        db.close()
        return rset[0] if rset else None
        
    def get_album_metadata(self, album_id):
        db = self.domserver.get_media_db()
        query = """SELECT al.title, al.year, al.genre, ar.name
            FROM music_albums al JOIN music_artists ar ON al.artist_id = ar.id
            WHERE al.id = ?"""
        rset = db.execute(query, (album_id,)).fetchone()
        db.close()
        return {
            'title': rset[0],
            'year': rset[1],
            'genre': rset[2],
            'artist': rset[3]
        }
        
    def write_album_metadata(self, meta, album_id=None):
        """Write album metadata in database.
        
        The metadata keys needed here are artist, album, year and genre.
        Should not be called directly, use update_album instead (which also
        moves files).
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
        
    def get_track_id(self, artist, album, track):
        db = self.domserver.get_media_db()
        query = """SELECT tr.id FROM music_tracks tr
            JOIN music_albums al ON tr.album_id = al.id
            JOIN music_artists ar ON al.artist_id = ar.id
            WHERE ar.name = ? AND al.title = ? AND tr.title = ?"""
        rset = db.execute(query, (artist, album, track)).fetchone()
        db.close()
        return rset[0] if rset else None
            
    def get_track_metadata(self, track_id):
        db = self.domserver.get_media_db()
        query = """
            SELECT ar.name, al.title, al.year, al.genre, tr.title,
                   tr.tracknum, tr.length, tr.format
            FROM music_tracks tr
                 JOIN music_albums al ON tr.album_id = al.id
                 JOIN music_artists ar ON al.artist_id = ar.id
            WHERE tr.id = ?
        """
        mapping = ['artist','album','year','genre','title','num','len','fmt']
        data = db.execute(query, (track_id,)).fetchone()
        db.close()
        
        meta = {}
        if data:
            for i in range(len(mapping)):
                meta[mapping[i]] = data[i]
        return meta   
        
    def write_track_metadata(self, meta, track_id=None):
        """Write track metadata in database.
        
        Should not be called directly, use update_track instead (which also
        moves files)
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
        self.write_track_metadata(meta)

    def import_track(self, path, meta):
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
            
        # self.log.debug("import_track path='%s' meta=%s" % (path, repr(meta)))
        shutil.copy(path, mlpath)
        artist_id = self.write_artist_metadata(meta, artist_id)
        album_id = self.write_album_metadata(meta, album_id)
        return self.write_track_metadata(meta)
        
    def match(self, expr, typ=0):
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
                'title': 'al.title',
                'year': 'al.year',
                'genre': 'al.genre',
                'keywords': "ar.name || ' ' || al.title"
            },
            2: {
                'name': 'ar.name',
                'keywords': 'ar.name'
            }
        }
        
        queries = {
            0: """SELECT tr.id FROM music_tracks tr
                 JOIN music_albums al ON tr.album_id = al.id
                 JOIN music_artists ar ON al.artist_id = ar.id
                 WHERE %s
                 ORDER BY ar.sortname, al.year, al.title, tr.tracknum,
                          tr.title""",
            1: """SELECT al.id FROM music_albums al
                JOIN music_artists ar ON al.artist_id = ar.id
                WHERE %s
                ORDER BY ar.sortname, al.year, al.title""",
            2: """SELECT ar.id FROM music_artists ar
                WHERE %s
                ORDER BY ar.sortname"""
        }
        
        where, data = expr.to_sqlwhere(prop_map[typ])
        
        db = self.domserver.get_media_db()
        rset = db.execute(queries[typ] % where, data).fetchall()
        db.close()
        return [r[0] for r in rset]
        
        
