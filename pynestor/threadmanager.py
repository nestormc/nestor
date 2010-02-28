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

import threading
import time

from .errors import UnexpectedStopError


THREAD_MANAGER_INTERVAL = 0.5


class ThreadManager:

    def __init__(self):
        """Initialize the thread manager"""
        
        self._threads = {}
        self._threads_nostop = []
        self._thread_names = {}
        self._last_tid = -1
        self._started = False
        self._stopping = False
        self._stop_requested = False
        self._lock = threading.Condition(threading.Lock())
        
    def _add_safe(self, thread, stop_fatal):
        """Add a thread to the threadlist and start it if other threads are
        already started. Internal use only, assumes the lock is acquired."""
        
        self._last_tid += 1
        if stop_fatal:
            self._threads_nostop.append(self._last_tid)
        self._threads[self._last_tid] = thread
        self._thread_names[self._last_tid] = thread.name
            
        if self._started:
            thread.start()
            
        return self._last_tid
        
    def add(self, thread, stop_fatal = False):
        """External method to add a thread.  Acquire the threadlist lock and
        call _add_safe to do the real work."""
        
        if self._stopping:
            raise RuntimeError("Cannot add thread while stopping")
           
        ret = -1
        with self._lock:
            ret = self._add_safe(thread, stop_fatal)
        return ret
        
    def _remove_safe(self, tid):
        """Stop and remove a thread from the threadlist.  Internal use only,
        assumes the lock is acquired."""
        
        thread = self._threads[tid]
        del self._threads[tid]
        if thread.isAlive():
            thread.stop()
            thread.join()
        
    def remove(self, tid):
        """External method to remove a thread.  Acquire the threadlist lock and
        call _remove_safe to do the real work."""
        
        if self._stopping:
            raise RuntimeError("Cannot remove thread while stopping")
        
        with self._lock:
            self._remove_safe(tid)
            
    def _remove_all_safe(self):
        """Stop and remove all threads"""
        
        for tid in self._threads:
            if self._threads[tid].isAlive():
                self._threads[tid].stop()
        for tid in self._threads:
            self._threads[tid].join()
        self._threads = []
        
    def run(self):
        """Start all threads and wait until stop() is called or one of the
        stop_fatal threads dies, at which point all remaining threads are
        killed."""
            
        # Start all threads
        with self._lock:
            self._started = True
            for t in self._threads.values():
                t.start()
            
        stopid = -1
            
        while not self._stopping:
            try:
                time.sleep(THREAD_MANAGER_INTERVAL)
            except KeyboardInterrupt:
                self._stop_requested = True
            else:
                with self._lock:
                    for tid in self._threads.keys():
                        t = self._threads[tid]
                        if tid in self._threads_nostop and not t.isAlive():
                            stopid = tid
                            self._stop_requested = True
                    
            if self._stop_requested:
                self._stopping = True
                with self._lock:
                    self._remove_all_safe()
                    
        if stopid != -1:
            msg = "Thread '%s' stopped unexpectedly" % self._thread_names[stopid]
            raise UnexpectedStopError(msg)
                    
    def stop(self):
        """External method to stop all threads."""
        self._stop_requested = True
    
    
