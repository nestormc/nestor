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

from ...thread import Thread
from .errors import MediaImportError
from .metadata import Metadata


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
    
    def __init__(self, domserver, logger, helper, path, delete=False):
        Thread.__init__(self, domserver, logger)
        self.helper = helper
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
        
    def guess_metadata(self, path):
        md = Metadata(path)
        if md['media'] == Metadata.MEDIA_MUSIC:
            if md['artist']:
                artist = self.helper.music.match_artist(md['artist'])
            else:
                artist = None
        
            try:
                year = int(md['year'])
            except (ValueError, TypeError):
                year = None
                
            tracknum = None
            if md['trackno']:
                try:
                    tracknum = int(md['trackno'])
                except (ValueError, TypeError):
                    try:
                        tracknum = int(md['trackno'].split('/')[0])
                    except (ValueError, TypeError):
                        pass
                        
            unknown_titles = ['unknown', 'unknown track', 'piste inconnue']
            if md['title'].lower() in unknown_titles:
                title = None
            else:
                title = md['title']
                    
            return Metadata.MEDIA_MUSIC, {
                'artist':   artist,
                'year':     year,
                'album':    md['album'] or None,
                'num':      tracknum,
                'title':    title,
                'genre':    md['genre'] or None,
                'len':      md['length'],
                'fmt':      md['ext']
            }
        else:
            self.verbose("Unsupported media '%s' in '%s'" % (md['media'], path))
            if md['media'] == Metadata.MEDIA_UNKNOWN:
                self.debug("Metadata err = %s in '%s'" % (md.err_msg, path))
            return None, None
    
        
    def coalesce_metadata(self, mtype, files):
        """Coalesce metadata for files in a single directory"""
        
        if mtype == Metadata.MEDIA_MUSIC:
            def_values = {
                'artist': '_unknown_',
                'album': os.path.basename(os.path.dirname(files.keys()[0])),
                'year': -1,
                'genre': ''
            }
        
            # Try to find missing tags in other files from the same directory,
            # or assign fallback values
            for k in ('artist', 'year', 'album', 'genre'):
                values = [files[f][k] for f in files if files[f][k] is not None]
                values = list(set(values))
            
                self.debug("Values found for %s: %r" % (k, values))
            
                if len(values) == 0:
                    values = [def_values[k]]
                if len(values) == 1:
                    for f in files:
                        files[f][k] = values[0]
                else:
                    for f in files:
                        if not files[f][k]:
                            files[f][k] = values[0]
                            
            # Try to compute track number and track title from filenames, and
            # assign the results to files that don't have those tags
            ftags = self.find_filename_tags(files.keys())
            for f in files:
                bname = os.path.basename(f).rsplit('.', 1)[0]
                for k in ('num', 'title'):
                    if not files[f][k]:
                        self.debug("set %s to %s for %s" % (k, ftags[bname][k], f))
                        files[f][k] = ftags[bname][k]
        
    def find_filename_tags(self, fnames):
        # Get basenames without extension
        basenames = [os.path.basename(f).rsplit('.', 1)[0] for f in fnames]
        
        # Find common filename start
        start = basenames[0] + ' '
        starting = False
        while not starting and len(start) > 0:
            start = start[0:len(start) - 1]
            starting = True
            for f in basenames:
                if not f.startswith(start):
                    starting = False
                    break
                    
        # Remove 0's from  start (useful for albums with <10 tracks)
        start = start.rstrip('0')
        
        # Try to find track number and track title
        results = {}
        for f in basenames:
            fdiff = f[len(start):len(f)]
            match = re.search("^(\d*)[ _-]*(.*)$", fdiff)
            try:
                trknum = int(match.group(1))
            except ValueError:
                trknum = -1
            results[f] = {'num': trknum, 'title': match.group(2)}
        return results
            
    def import_music_file(self, path, metadata):
        try:
            track_id, path = self.helper.music.import_track(path, metadata, self.delete)
        except MediaImportError, e:
            self.verbose("Error while importing '%s': %s" % (path, e))
            track_id = None
            
        if track_id:
            mdir = self.domserver.config["media.music_dir"]
            off = 0 if mdir.endswith('/') else 1
            rpath = path[len(mdir)+off:]
            
            self.debug("Updating MPD (%s)" % rpath)
            self.helper.mpd.update(rpath)
        
    def import_directory(self, path):
        self.debug("Importing directory %s" % path)
        dfiles = []
        for r, dirs, files in os.walk(path):
            for d in dirs:
                self.import_directory(os.path.join(r, d))
            dfiles.extend(files)
            dirs[0:len(dirs)] = []
        
        dfiles.sort()
        if len(dfiles):
            self.verbose("%s: %d files" % (path, len(dfiles)))
            metas = {}
            
            count = 0
            for f in dfiles:
                fpath = os.path.join(path, f)
                mtype, meta = self.guess_metadata(fpath)
                if meta:
                    if mtype not in metas:
                        metas[mtype] = {}
                    metas[mtype][fpath] = meta
                    count += 1
                    
            self.verbose("%s: %d files to import" % (path, count))
                    
            for mtype in metas:
                files = metas[mtype]
                self.coalesce_metadata(mtype, files)
                
                if mtype == Metadata.MEDIA_MUSIC:
                    for f in files:
                        self.import_music_file(f, files[f])
                        
        if self.delete:
            try:
                os.rmdir(path)
            except:
                pass
                
    def import_file(self, path):
        self.debug("Importing file %s" % path)
        mtype, meta = self.guess_metadata(path)
        
        if mtype == Metadata.MEDIA_MUSIC:
            if not meta[title]:
                meta[title] = os.path.basename(path).rsplit('.', 1)[0]
            self.import_music_file(path, meta)
            
                
    def process(self):
        self.verbose("Processing %s" % self.path)
        try:
            if os.path.isdir(self.path):
                self.import_directory(self.path)
            else:
                self.import_file(self.path)
        except Exception, e:
            self.log_exception(e)
        else:
            self.verbose("Finished processing %s" % self.path)
        
        
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
        self.helper = helper
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
        t = MediaImporterThread(self.domserver, self.logger, self.helper,
            os.path.join(self.lobby, path), True)
        self.domserver.add_thread(t)
        return t
        
