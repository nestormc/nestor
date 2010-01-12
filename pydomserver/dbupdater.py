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
import sqlite3

from .errors import DBError

DATABASES = ['domserver', 'objects', 'media']
UPDATE_SCRIPTS = { 
    1: {
        'domserver': """
            DROP TABLE IF EXISTS config;
            CREATE TABLE config (
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                
                CONSTRAINT uk_config_key UNIQUE(key)
            );

            DROP TABLE IF EXISTS action_progress;
            CREATE TABLE action_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                status INTEGER,
                progress INTEGER,
                msg TEXT
            );""",
            
        'objects': """
            DROP TABLE IF EXISTS objects;
            CREATE TABLE objects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                objref TEXT NOT NULL,
                
                CONSTRAINT uk_op_objref UNIQUE (objref)
            );

            DROP TABLE IF EXISTS object_properties;
            CREATE TABLE object_properties (
                object_id INTEGER NOT NULL,
                property TEXT NOT NULL,
                value TEXT NOT NULL,
                
                CONSTRAINT fk_op_object_id FOREIGN KEY (object_id) REFERENCES objects(id)
                CONSTRAINT uk_op_oid_prop UNIQUE (object_id, property)
            );
            """
    },
    2: {
        'objects': """
            DROP TABLE IF EXISTS notifications;
            CREATE TABLE notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TIMESTAMP NOT NULL,
                app TEXT NOT NULL,
                type TEXT NOT NULL,
                level INTEGER NOT NULL,
                objref TEXT NOT NULL
            );
        """
    },
    3: {
        'media': """
            PRAGMA foreign_keys = TRUE;
        
            DROP TABLE IF EXISTS music_artists;
            DROP INDEX IF EXISTS idx_mar_sortname;
            CREATE TABLE music_artists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                sortname TEXT NOT NULL,
                
                CONSTRAINT uk_mar_name UNIQUE (name)
            );
            CREATE INDEX idx_mar_sortname ON music_artists(sortname);
            
            DROP TABLE IF EXISTS music_albums;
            DROP INDEX IF EXISTS idx_mal_artist_id;
            DROP INDEX IF EXISTS idx_mal_year;
            DROP INDEX IF EXISTS idx_mal_genre;
            CREATE TABLE music_albums (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                artist_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                year INTEGER,
                genre TEXT,
                
                CONSTRAINT fk_mal_artist_id FOREIGN KEY (artist_id) REFERENCES music_artists(id),
                CONSTRAINT uk_mal_artist_id_title UNIQUE (artist_id, title)
            );
            CREATE INDEX idx_mal_artist_id ON music_albums(artist_id);
            CREATE INDEX idx_mal_year ON music_albums(year);
            CREATE INDEX idx_mal_genre ON music_albums(genre);
            
            DROP TABLE IF EXISTS music_tracks;
            DROP INDEX IF EXISTS idx_mtk_album_id;
            CREATE TABLE music_tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                album_id INTEGER NOT NULL,
                tracknum INTEGER,
                title TEXT NOT NULL,
                format TEXT NOT NULL,
                length REAL,
                
                CONSTRAINT fk_mtk_album_id FOREIGN KEY (album_id) REFERENCES music_albums(id)
            );
            CREATE INDEX idx_mtk_album_id ON music_tracks(album_id);
        """
    }
}

class DBUpdater:

    conns = {}
    
    def __init__(self, **kwargs):
        for db in DATABASES:
            dbfile = kwargs.get(db, '/var/lib/domserver/%s.db' % db)
            if not os.access(dbfile, os.F_OK):
                try:
                    fp = open(dbfile, 'w')
                    fp.close()
                except IOError:
                    raise DBError("Cannot create database %s" % dbfile)
            
            try:
                self.conns[db] = sqlite3.connect(dbfile)
            except sqlite3.Error:
                raise DBError("Cannot connect to database %s" % dbfile)
        
    def update_db(self):
        version = self.get_db_version()
        max_version = max(UPDATE_SCRIPTS.keys())
        for v in range(version + 1, max_version + 1):
            self.run_update_script(v)
            
        self.set_db_version(max_version)
            
        for db in DATABASES:
            self.conns[db].close()
    
    def get_db_version(self):
        try:
            query = "SELECT value FROM config WHERE key = 'version'"
            return int(self.conns['domserver'].execute(query).fetchall()[0][0])
        except (sqlite3.Error, IndexError):
            return 0
            
    def set_db_version(self, version):
        query = "INSERT OR REPLACE INTO config(key,value) VALUES('version',?)"
        self.conns['domserver'].execute(query, (version,))
        self.conns['domserver'].commit()

    def run_update_script(self, target_version):
        scripts = UPDATE_SCRIPTS[target_version]
        for db in scripts.keys():
            self.conns[db].executescript(scripts[db])
            self.conns[db].commit()

