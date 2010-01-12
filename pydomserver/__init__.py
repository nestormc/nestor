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

__all__ = [
    'helpers',
    'dbConfigdict',
    'errors',
    'logger',
    'objects',
    'runwatcherthread',
    'socketinterface',
    'socketinterfacecodes',
    'thread',
    'threadmanager',
    'utils'
]

import os
import os.path
import resource
import signal
import sqlite3
import sys
import traceback

from .dbconfigdict import DBConfigDict
from .dbupdater import DBUpdater
from .errors import DomserverError, DaemonizeError, UnexpectedStopError
from .logger import Logger
from .threadmanager import ThreadManager
from .objects import ObjectAccessor
from .socketinterface import SIServerThread

           
class Domserver:
    def __init__(self, **kwargs):
        """Daemonize and run initialization helpers"""
        
        # Run DB updater
        dbargs = {}
        if kwargs.has_key('main_db'):
            dbargs['domserver'] = kwargs['main_db']
        if kwargs.has_key('obj_db'):
            dbargs['objects'] = kwargs['obj_db']
        DBUpdater(**dbargs).update_db()
        
        # Run helpers once while we're able to print errors to stdout. If
        # everything succeeds up to logger creation, we're good to go:
        # we're daemonized but subsequent errors can be logged.
        self._init_db(**kwargs)
        self._init_config()
        self._init_logger()
        self._reset()
        
        if kwargs.get('daemonize', True):
            self._daemonize()
            
        self._init_db(**kwargs)
        self._init_config()
        self._init_logger()
        
        if not kwargs.get('dry_run', False):
            try:
                self._init_threads()
                self._init_socketiface()
                self._init_objects()
            except:
                self.info(traceback.format_exc())
                raise
            
            signal.signal(signal.SIGTERM, self._sighandler)
            self.helpers = []
        
    def _reset(self):
        self._logger = None
        self.info = None
        self.verbose = None
        self.debug = None
        self.config = None
        self._obj_db = None
        self._db = None
        
    def _sighandler(self, signum, frame):
        """Handle signals"""
        if signum == signal.SIGTERM:
            self.info("Received TERM signal, terminating")
            self._tm.stop()
        
    def _daemonize(self):
        """Daemonize"""
        
        # fork twice
        try:
            pid = os.fork()
        except OSError, e:
            raise DaemonizeError("%s [%d]" % (e.strerror, e.errno))

        if (pid == 0):
            os.setsid()
            try:
                pid = os.fork()
            except OSError, e:
                raise DaemonizeError("%s [%d]" % (e.strerror, e.errno))

            if (pid == 0):
                os.chdir('/')
                os.umask(0)
            else:
                os._exit(0)
        else:
            os._exit(0)

        # output PID
        p = open('/var/run/%s.pid' % os.path.basename(sys.argv[0]), 'w')
        p.write("%d\n" % os.getpid())
        p.close()

        # close FDs
        maxfd = resource.getrlimit(resource.RLIMIT_NOFILE)[1]
        if (maxfd == resource.RLIM_INFINITY):
            maxfd = 1024

        for fd in range(0, maxfd):
            try:
                os.close(fd)
            except OSError:
                pass

        # redirect outputs
        if (hasattr(os, "devnull")):
            os.open(os.devnull, os.O_RDWR)
        else:
            os.open('/dev/null', os.O_RDWR)
        os.dup2(0, 1)
        os.dup2(0, 2)
        
        return(0)
    
    def _init_db(self, **kwargs):
        """Initialize sqlite connexions"""
        
        main_db = kwargs.get('main_db', '/var/lib/domserver/domserver.db')
        obj_db = kwargs.get('obj_db', '/var/lib/domserver/objects.db')
        media_db = kwargs.get('media_db', '/var/lib/domserver/media.db')
        
        for dbfile in [main_db, obj_db, media_db]:
            try:
                db = sqlite3.connect(dbfile)
            except sqlite3.Error:
                raise DomserverError("Cannot connect to database (%s)" % dbfile)
            else:
                db.close()
                
        self._db = main_db
        self._obj_db = obj_db
        self._media_db = media_db
        
    def get_db(self, dbfile):
        return sqlite3.connect(dbfile)
        
    def get_main_db(self):
        return self.get_db(self._db)
        
    def get_obj_db(self):
        return self.get_db(self._obj_db)
        
    def get_media_db(self):
        return self.get_db(self._media_db)
        
    def _init_config(self):
        """Initialize config dict-like object"""
        
        self.config = DBConfigDict(self.get_main_db)
        
    def get_logger(self, file_key='', level_key=''):
        """Create a Logger object using config keys for filename and level"""
        
        try:
            logfile = self.config[file_key]
        except KeyError:
            raise DomserverError("No log file specified")
        if not os.access(logfile, os.F_OK):
            try:
                open(logfile, 'w').close()
            except IOError:
                raise DomserverError("Log file cannot be written (%s)" % logfile)
        
        try:
            loglevel = int(self.config[level_key])
        except (KeyError, ValueError):
            return Logger(logfile)
        else:
            return Logger(logfile, loglevel)
        
    def _init_logger(self):
        """Create the main Logger"""
        
        self._logger = self.get_logger('domserver.log_file', 'domserver.log_level')
        self.info = self._logger.info
        self.verbose = self._logger.verbose
        self.debug = self._logger.debug
        
    def _init_threads(self):
        """Initialize the thread manager"""
        
        self._tm = ThreadManager()
            
    def add_thread(self, thread, stop_fatal = False):
        """Add a thread to the thread manager"""
        
        return self._tm.add(thread, stop_fatal)
        
    def remove_thread(self, tid):
        """Remove a thread from the thread manager"""
        
        self._tm.remove(tid)
        
    def _init_objects(self):
        """Initialize the objects accessor"""
        
        self._obj = ObjectAccessor(self)
        
    def register_object_interface(self, **kwargs):
        self._obj.register_interface(**kwargs)
        
    def get_object(self, objref):
        return self._obj.get_obj(objref)
        
    def match_objects(self, owner, expr):
        return self.match(owner, expr)
        
    def _init_socketiface(self):
        """Initialize the socket IPC interface"""
        
        self._si = SIServerThread(
            self,
            self,
            self.config['domserver.ipc_host'],
            int(self.config['domserver.ipc_port'])
        )
        self._si_tid = self.add_thread(self._si, True)
        
    def register_packet_handler(self, opcode, handler, args=None):
        """Register a packet handler for packets with given opcode.  'handler'
        must be callable; it will be called with the following arguments:
        - the SI client thread (giving access to its answer_* methods)
        - the received packet
        - 'args', except if None
        It must return a bool, telling if it has called an answer_* method or
        not.  If not, the client thread will send a 'failure' response packet.
        """
        
        self._si.register_packet_handler(opcode, handler, args)
        
    def unregister_packet_handler(self, opcode):
        """Unregister previously registered handler for packets with opcode."""
        
        self._si.unregister_packet_handler(opcode)
        
    def add_helper(self, helperclass):
        try:
            self.helpers.append(helperclass(self))
        except Exception, e:
            self.info(traceback.format_exc())
            raise
        
    def run(self):
        try:
            self._tm.run()
        except Exception, e:
            self.info(traceback.format_exc())
            raise

    
    
