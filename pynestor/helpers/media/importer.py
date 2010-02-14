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

import os
import os.path
import re
import threading
import time

from ...thread import Thread
from .errors import MediaImportError
from .metadata import Metadata

            
class ImporterThread(Thread):
    """Importer thread
    
    Implements a file import queue.
    
    """

    def __init__(self, nestor, logger, helper):
        Thread.__init__(self, nestor, logger)
        self.running = False
        self.helper = helper
        self._import_queue = []
        self._lock = threading.Condition(threading.Lock())
                
    def nestor_run(self):
    
        self.running = True
        while self.running:
            self.process_queue()
            time.sleep(0.2)
        
    def stop(self):
        self.running = False
        
    def process_queue(self):
        path = None
        
        self._lock.acquire()
        try:
            if len(self._import_queue):
                path, delete = self._import_queue.pop()
        finally:
            self._lock.release()
            
        if path:
            self.process(path, delete)
        
    def enqueue(self, path, delete=False):
        self._lock.acquire()
        try:
            self._import_queue.insert(0, [path, delete])
        finally:
            self._lock.release()
        
    def process(self, path, delete=False):
        self.verbose("Processing %s" % path)
        try:
            if os.path.isdir(path):
                self.import_directory(path, delete)
            else:
                self.import_file(path, delete)
        except Exception, e:
            self.log_exception(e)
        else:
            self.verbose("Finished processing %s" % path)
        
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
            if not md['title'] or md['title'].lower() in unknown_titles:
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
            
    def import_music_file(self, path, metadata, delete=False):
        try:
            track_id, path = self.helper.music.import_track(path, metadata, delete)
        except MediaImportError, e:
            self.verbose("Error while importing '%s': %s" % (path, e))
            track_id = None
            
        if track_id:
            mdir = self.nestor.config["media.music_dir"]
            off = 0 if mdir.endswith('/') else 1
            rpath = path[len(mdir)+off:]
            
            self.debug("Updating MPD (%s)" % rpath)
            self.helper.mpd.update(rpath)
        
    def import_directory(self, path, delete=False):
        self.debug("Importing directory %s" % path)
        dfiles = []
        for r, dirs, files in os.walk(path):
            for d in dirs:
                self.import_directory(os.path.join(r, d), delete)
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
                        self.import_music_file(f, files[f], delete)
                        
        if delete:
            try:
                os.rmdir(path)
            except:
                pass
                
    def import_file(self, path, delete=False):
        self.debug("Importing file %s" % path)
        mtype, meta = self.guess_metadata(path)
        
        if mtype == Metadata.MEDIA_MUSIC:
            if not meta[title]:
                meta[title] = os.path.basename(path).rsplit('.', 1)[0]
            self.import_music_file(path, meta, delete)
    
        
