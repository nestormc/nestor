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
from pyinotify import WatchManager, ThreadedNotifier, ProcessEvent, EventsCodes
import re
import time

from ...Thread import Thread
from .Errors import MediaImportError


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
    
    def __init__(self, domserver, logger, music, path):
        Thread.__init__(self, domserver, logger)
        self.music = music
        self.path = path
        self.running = False
        self.cache = {}
        
    def domserver_run(self):
        self.debug("mediaimporter: waiting %s" % self.path)
    
        self._wm = WatchManager()
        notifier = ThreadedNotifier(self._wm, ItemEventCatcher(self))
        notifier.start()
        self.add_watch(self.path)
        
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
                self.debug("guess_tracknum: cached start '%s'" % start)
    
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
            self.debug("guess_tracknum: found common start '%s' for %s (%s)" % (start, dirname, ext))
                    
        basename = basename[len(start):len(basename)]
        match = re.search("^(\d+)", basename)
        if match:
            self.debug("guess_tracknum: found num '%s'" % match.group(1))
            return int(match.group(1))
        else:
            self.debug("guess_tracknum: found nothing :(")
            return -1
        
    def guess_metadata(self, path):
        k = kmd.parse(path)
        if k:
            if k['media'] == kmd.MEDIA_AUDIO:
                if not k['artist']:
                    artist = '_unknown_'
                else:
                    artist = self.music.match_artist(k['artist'])
            
                try:
                    year = int(k['userdate'])
                except (ValueError, TypeError):
                    year = -1
                    
                tracknum = None
                if k['trackno']:
                    try:
                        tracknum = int(k['trackno'])
                    except (ValueError, TypeError):
                        try:
                            tracknum = int(k['trackno'].split('/')[0])
                        except (ValueError, TypeError):
                            pass
                            
                if tracknum is None:
                    tracknum = self.guess_tracknum(path)
                        
                if not k['title']:
                    title = os.path.basename(path).rsplit('.', 1)[0]
                    if title.lstrip('0123456789') != '':
                        title = title.lstrip('0123456789')
                        
                ext = path.split('.')[-1].lower()
                
                return kmd.MEDIA_AUDIO, {
                    'artist':   artist,
                    'year':     year,
                    'album':    k['album'] or '_unknown_',
                    'num':      tracknum,
                    'title':    k['title'] or title,
                    'genre':    k['genre'] or '',
                    'len':      k['length'],
                    'fmt':      ext
                }
            else:
                self.debug("Unsupported media '%s'" % k['media'])
        else:
            self.debug("Could not find media streams")
            
        return None, None
                
    def import_file(self, path):
        mtype, meta = self.guess_metadata(path)
        
        if mtype == kmd.MEDIA_AUDIO:
            try:
                track_id = self.music.import_track(path, meta)
            except MediaImportError, e:
                self.verbose("Import error: %s" % e)
                track_id = None
                
            if track_id:
                return True
                
        return False
    
    def import_media(self, path):
        self.debug("Importing '%s'" % path)
        if os.path.isdir(path):
            fpaths = []
            roots = []
            
            for r, dirs, files in os.walk(path, False):
                roots.append(r)
                for f in files:
                    fpaths.append(os.path.join(r, f))
                    
            self.debug("filelist: \n%s" % "\n".join(sorted(fpaths)))
                    
            failed = 0
            for f in sorted(fpaths):
                try:
                    ret = self.import_file(f)
                except:
                    self.info("Exception importing %s" % f)
                    raise
                
                if ret:
                    os.remove(f)
                else:
                    failed += 1
                    
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
                
            if ret:
                os.remove(path)
            return 1, 1 if ret else 0
                
    def process(self):
        self.debug("Start processing for %s" % self.path)
        try:
            count, success = self.import_media(self.path)
        except Exception, e:
            self.log_exception(e)
        else:
            self.debug("Finished processing %s, %d/%d files imported" % (self.path,
                success, count))
        
        
class LobbyEventCatcher(ProcessEvent):
    """CREATE event catcher for items in the lobby dir
    
    Calls parent thread process() on the object of the event
    """

    def __init__(self, thread):
        ProcessEvent.__init__(self)
        self.thread = thread

    def process_default(self, event):
        self.thread.process(os.path.join(event.path, event.name))
            
            
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
        self.threads = []
        
    def domserver_run(self):
        for root, dirs, files in os.walk(self.lobby):
            for f in files + dirs:
                self.process(f)
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
            time.sleep(1)
            
        notifier.stop()
        
    def stop(self):
        self.running = False
        
    def process(self, path):
        self.debug("lobbywatcher: process %s" % path)
        t = MediaImporterThread(self.domserver, self.logger, self.music,
            os.path.join(self.lobby, path))
        self.domserver.add_thread(t)
