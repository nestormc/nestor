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


class MusicLibrary:
    """Music library utility class.
    
    Manipulate the music library metadata and directory tree.
    
    Unless otherwise specified, the 'meta' argument to methods of this class is
    a dict with the following contents:
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
    """

    def __init__(self, domserver, logger=None):
        self.domserver = domserver
        self.log = logger if logger else domserver
        
    def meta_to_filename(self, meta, typ=0):
        """typ: 0=track, 1=album, 2=artist"""
        if typ == 0:
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
        elif typ == 1:
            return os.path.join(
                self.domserver.config['media.music_dir'],
                meta['artist'],
                meta['album']
            )
        elif typ == 2:
            return os.path.join(
                self.domserver.config['media.music_dir'],
                meta['artist']
            )
            
    def get_metadata(self, track_id):
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
        
    def get_album_metadata(self, album_id):
        db = self.domserver.get_media_db()
        query = """SELECT al.title, al.year, al.genre, ar.name
            FROM media_albums al JOIN media_artists ar ON al.artist_id = ar.id
            WHERE al.id = ?"""
        rset = db.execute(query, (album_id,)).fetchone()
        db.close()
        return {
            'title': rset[0],
            'year': rset[1],
            'genre': rset[2],
            'artist': rset[3]
        }
        
    def write_metadata(self, meta, track_id=None):
        db = self.domserver.get_media_db()
        
        query = "SELECT id FROM music_artists WHERE name=?"
        res = db.execute(query, (meta['artist'],)).fetchone()
        if res:
            artist_id = res[0]
        else:
            query = """INSERT OR REPLACE INTO music_artists(name, sortname)
                VALUES(?,?)"""
            data = (meta['artist'], self.get_sorname(meta['artist']))
            artist_id = db.execute(query, data).lastrowid
        
        query = """SELECT id, year, genre FROM music_albums
            WHERE title=? AND artist_id=?"""
        res = db.execute(query, (meta['album'], artist_id)).fetchone()
        if res:
            album_id, year, genre = res
            setsql = []
            setdata = []
            if meta['year'] != 1 and meta['year'] != year:
                setsql.append('year=?')
                setdata.append(meta['year'])
            if meta['genre'] != '' and meta['genre'] != genre:
                setsql.append('genre=?')
                setdata.append(meta['genre'])
            if len(setsql):
                query = "UPDATE music_albums SET " + ', '.join(setsql)
                query += " WHERE id=?"
                setdata.append(album_id)
                db.execute(query, setdata)
        else:
            query = """INSERT OR REPLACE INTO music_albums
                (artist_id, title, year, genre) VALUES (?,?,?,?)"""
            data = (artist_id, meta['album'], meta['year'], meta['genre'])
            album_id = db.execute(query, data).lastrowid
        
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
        
        # TODO write metadata to file
        
        return track_id
        
    def cleanup_database(self):
        """Cleanup obsolete data in database"""
        
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

    def import_track(self, path, meta):
        """Import a music track into the media library
        
        Copy 'path' into the media library folder and insert metadata in
        database.
        """
        
        mlpath = self.meta_to_filename(meta)
        if os.path.exists(mlpath):
            raise MediaImportError("File exists (%s)" % mlpath)
            
        try:
            try:
                os.makedirs(os.path.dirname(mlpath))
            except os.error:
                pass
            shutil.copyfile(path, mlpath)
        except IOError, e:
            raise MediaImportError(e)
            
        return self.write_metadata(meta)
        
    def update_track(self, track_id, meta):
        oldmeta = self.get_metadata(track_id)
        oldpath = self.meta_to_filename(oldmeta)
        newpath = self.meta_to_filename(meta)
        if oldpath != newpath:
            if os.path.exists(newpath):
                raise MediaUpdateError("File exists (%s)" % newpath)
                
            try:
                try:
                    os.makedirs(os.path.dirname(newpath))
                except os.error:
                    pass
                shutil.move(oldpath, newpath)
            except IOError, e:
                raise MediaUpdateError(e)
                
            try:
                os.removedirs(os.path.dirname(oldpath))
            except OSError:
                pass
                
        self.write_metadata(meta, track_id)
        self.cleanup_database()
        
    def get_sortname(self, name):
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
        
    def get_artists(self):
        db = self.domserver.get_media_db()
        query = "SELECT name FROM music_artists ORDER BY sortname"
        rset = [r[0] for r in db.execute(query).fetchall()]
        db.close()
        return rset
        
    def get_artist_id(self, artist):
        db = self.domserver.get_media_db()
        query = "SELECT id FROM music_artists WHERE name = ?"
        rset = db.execute(query, (artist,)).fetchone()
        db.close()
        return rset[0] if rset else None
        
    def get_albums(self, artist):
        artist_id = self.get_artist_id(artist)
        if not artist_id:
            return []
        db = self.domserver.get_media_db()
        query = "SELECT title FROM music_albums WHERE artist_id = ? ORDER BY year"
        rset = [r[0] for r in db.execute(query, (artist_id,)).fetchall()]
        db.close()
        return rset
        
    def get_album_id(self, artist, album):
        db = self.domserver.get_media_db()
        query = """SELECT al.id FROM music_albums al
            JOIN music_artists ar ON al.artist_id = ar.id
            WHERE ar.name = ? AND al.title = ?"""
        rset = db.execute(query, (artist, album)).fetchone()
        db.close()
        return rset[0] if rset else None
        
    def get_tracks(self, artist, album):
        album_id = self.get_album_id(artist, album)
        if not album_id:
            return []
        db = self.domserver.get_media_db()
        query = "SELECT title FROM music_tracks WHERE album_id = ? ORDER BY tracknum"
        rset = [r[0] for r in db.execute(query, (album_id,)).fetchall()]
        db.close()
        return rset
        
    def get_track_id(self, artist, album, track):
        db = self.domserver.get_media_db()
        query = """SELECT tr.id FROM music_tracks tr
            JOIN music_albums al ON tr.album_id = al.id
            JOIN music_artists ar ON al.artist_id = ar.id
            WHERE ar.name = ? AND al.title = ? AND tr.title = ?"""
        rset = db.execute(query, (artist, album, track)).fetchone()
        db.close()
        return rset[0] if rset else None
        
    def match(self, expr, typ=0):
        """Match music library objects.
        
        Returns a list of music library object ids matching an OExpression.
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
                'len': 'tr.length'
            },
            1: {
                'artist': 'ar.name',
                'title': 'al.title',
                'year': 'al.year',
                'genre': 'al.genre'
            },
            2: {
                'name': 'ar.name'
            }
        }
        
        queries = {
            0: """SELECT tr.id FROM music_tracks tr
                 JOIN music_albums al ON tr.album_id = al.id
                 JOIN music_artists ar ON al.artist_id = ar.id
                 WHERE %s
                 ORDER BY ar.sortname, al.year, al.title, tr.num, tr.title""",
            1: """SELECT al.id FROM music_albums al
                JOIN music_artists ar NO al.artist_id = ar.id
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
        
