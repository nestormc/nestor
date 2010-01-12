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
from pyinotify import WatchManager, ThreadedNotifier, ProcessEvent, EventsCodes
import re
import threading
import time

from ...Thread import Thread
from .Errors import MediaImportError
from .Metadata import Metadata


class ItemEventCatcher(ProcessEvent):
    """Change event catcher for items in the lobby dir
    
    Every time a change is seen, update parent processor thread's last_activity
    timestamp.  When a new subdirectory is created, add a new pyinotify watch
    on it in the parent thread. 
    
    """

    def __init__(self, thread):
        ProcessEvent.__init__(self)
        self.thread = thread
        
    def process_IN_DELETE_SELF(self, event):
        self.thread.stop()
        
    def process_default(self, event):
        self.thread.last_activity = time.time()
        if event.is_dir and event.name is not None:
            self.thread.add_watch(os.path.join(event.path, event.name))
            
            
PROCESS_INTERVAL = 0.2
PROCESS_CLEANTIME = 4

class MediaImporterThread(Thread):
    """Media importer thread
    
    Creates a pyinotify instance to watch an object in the media lobby for
    changes.  When no changes have happened for PROCESS_CLEANTIME seconds,
    the object is imported.
    
    """
    
    def __init__(self, domserver, logger, music, path, delete=False):
        Thread.__init__(self, domserver, logger)
        self.music = music
        self.path = path
        self.running = False
        self.delete = delete
        self.cache = {}
        
    def domserver_run(self):
        self._wm = WatchManager()
        notifier = ThreadedNotifier(self._wm, ItemEventCatcher(self))
        notifier.start()
        
        try:
            self.add_watch(self.path)
        except UnicodeError:
            self.add_watch(self.path.encode('utf-8'))
        
        self.last_activity = time.time()
        self.running = True
        while self.running:
            if self.last_activity < time.time() - PROCESS_CLEANTIME:
                break
            time.sleep(PROCESS_INTERVAL)
        
        notifier.stop()
       
        if self.running:
            self.process()
        
    def stop(self):
        self.running = False
        
    def add_watch(self, path):
        self._wm.add_watch(
            path,
            EventsCodes.ALL_FLAGS['ALL_EVENTS'],
            rec = True
        )
        
    def guess_tracknum(self, path):
        if 'file_start' not in self.cache:
            self.cache['file_start'] = {}
    
        basename = os.path.basename(path)
        dirname = os.path.dirname(path)
        try:
            ext = '.' + basename.rsplit('.', 1)[1]
        except IndexError:
            ext = ''
    
        start = None        
        if dirname in self.cache['file_start']:
            if ext in self.cache['file_start'][dirname]:
                start = self.cache['file_start'][dirname][ext]
    
        if start is None:
            for r, dirs, files in os.walk(dirname):
                fnames = [f for f in files if f.endswith(ext)]
                dirs[0:len(dirs)] = []
            
            # Find common filename start
            start = basename + ' '
            starting = False
            while not starting and len(start) > 0:
                start = start[0:len(start) - 1]
                starting = True
                for f in fnames:
                    if not f.startswith(start):
                        starting = False
                        break
                        
            start = start.rstrip('0')
            self.cache['file_start'][dirname] = {ext: start}
                    
        basename = basename[len(start):len(basename)]
        match = re.search("^(\d+)", basename)
        if match:
            return int(match.group(1))
        else:
            return -1
        
    def guess_metadata(self, path):
        md = Metadata(path)
        if md['media'] == Metadata.MEDIA_MUSIC:
            if not md['artist']:
                artist = '_unknown_'
            else:
                artist = self.music.match_artist(md['artist'])
        
            try:
                year = int(md['year'])
            except (ValueError, TypeError):
                year = -1
                
            tracknum = None
            if md['trackno']:
                try:
                    tracknum = int(md['trackno'])
                except (ValueError, TypeError):
                    try:
                        tracknum = int(md['trackno'].split('/')[0])
                    except (ValueError, TypeError):
                        pass
                        
            if tracknum is None:
                tracknum = self.guess_tracknum(path)
                    
            unknown_titles = ['unknown', 'unknown track', 'piste inconnue']
            if not md['title'] or md['title'].lower() in unknown_titles:
                title = os.path.basename(path).rsplit('.', 1)[0]
                if title.lstrip('0123456789') != '':
                    title = title.lstrip('0123456789')
            else:
                title = md['title']
                    
            return Metadata.MEDIA_MUSIC, {
                'artist':   artist,
                'year':     year,
                'album':    md['album'] or '_unknown_',
                'num':      tracknum,
                'title':    title,
                'genre':    md['genre'] or '',
                'len':      md['length'],
                'fmt':      md['ext']
            }
        else:
            self.verbose("Unsupported media '%s' in '%s'" % (md['media'], path))
            if md['media'] == Metadata.MEDIA_UNKNOWN:
                self.debug("Metadata err = %s in '%s'" % (md.err_msg, path))
            
        return None, None
                
    def import_file(self, path):
        mtype, meta = self.guess_metadata(path)
        
        if mtype == Metadata.MEDIA_MUSIC:
            try:
                track_id = self.music.import_track(path, meta, self.delete)
            except MediaImportError, e:
                self.verbose("Import error: %s" % e)
                track_id = None
                
            if track_id:
                return True
                
        return False
    
    def import_media(self, path):
        if os.path.isdir(path):
            fpaths = []
            roots = []
            
            for r, dirs, files in os.walk(path, False):
                roots.append(r)
                for f in files:
                    fpaths.append(os.path.join(r, f))
                    
            # self.debug("filelist: \n%s" % "\n".join(sorted(fpaths)))
                    
            failed = 0
            for f in sorted(fpaths):
                try:
                    ret = self.import_file(f)
                except:
                    self.info("Exception importing %s" % f)
                    raise
                
                if not ret:
                    failed += 1
                    
            if self.delete:
                # Like os.removedirs, but stops at dirname(path)
                for r in roots:
                    while r != path:
                        try:
                            os.rmdir(r)
                        except:
                            break
                        r = os.path.dirname(r)
                    try:
                        os.rmdir(r)
                    except:
                        pass
                
            return len(fpaths), len(fpaths) - failed
        else:
            try:
                ret = self.import_file(path)
            except:
                self.info("Exception importing %s" % path)
                raise
                
            return 1, 1 if ret else 0
                
    def process(self):
        self.verbose("Processing %s" % self.path)
        try:
            count, success = self.import_media(self.path)
        except Exception, e:
            self.log_exception(e)
        else:
            self.verbose("Finished processing %s, %d/%d files imported" %
                (self.path, success, count))
        
        
class LobbyEventCatcher(ProcessEvent):
    """CREATE event catcher for items in the lobby dir
    
    Calls parent thread process() on the object of the event
    """

    def __init__(self, thread):
        ProcessEvent.__init__(self)
        self.thread = thread

    def process_default(self, event):
        self.thread.enqueue(os.path.join(event.path, event.name))
            
            
class LobbyWatcherThread(Thread):
    """Lobby watcher thread
    
    Creates a pyinotify instance to watch for object creation in the media 
    lobby directory.  A ProcessorThread is brought up for each new object.
    
    """

    def __init__(self, domserver, logger, helper):
        Thread.__init__(self, domserver, logger)
        self.running = False
        self.lobby = self.domserver.config["media.lobby_dir"]
        self.music = helper['music']
        self._jobs = []
        self._lock = threading.Condition(threading.Lock())
        self._threads = []
        self._max_threads = 10
                
    def domserver_run(self):
        for root, dirs, files in os.walk(self.lobby):
            for f in files + dirs:
                self.enqueue(f)
    		dirs[0:len(dirs)] = []
    
        wm = WatchManager()
        notifier = ThreadedNotifier(wm, LobbyEventCatcher(self))
        notifier.start()
        
        watch = wm.add_watch(
            self.lobby,
            EventsCodes.ALL_FLAGS['IN_CREATE'] |
                EventsCodes.ALL_FLAGS['IN_MOVED_TO'],
            rec = False
        )
        
        self.running = True
        while self.running:
            self._lock.acquire()
            try:
                self._process_queue()
            finally:
                self._lock.release()
            time.sleep(0.2)
            
        notifier.stop()
        
    def stop(self):
        self.running = False
        
    def _process_queue(self):
        while len(self._jobs) and len(self._threads) <= self._max_threads:
            self._threads.append(self._process(self._jobs.pop()))
        if len(self._jobs):
            for i in range(self._max_threads):
                if not self._threads[i].isAlive():
                    try:
                        self._threads[i] = self._process(self._jobs.pop())
                    except IndexError:
                        pass
        
    def enqueue(self, path):
        self._lock.acquire()
        try:
            self._jobs.insert(0, path)
        finally:
            self._lock.release()
        
    def _process(self, path):
        t = MediaImporterThread(self.domserver, self.logger, self.music,
            os.path.join(self.lobby, path), True)
        self.domserver.add_thread(t)
        return t
        
