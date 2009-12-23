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

from .Errors import DBError

DATABASES = ['domserver', 'objects']
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
        'domserver': """
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

