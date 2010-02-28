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

"""Just a simple wrapper to threading.Thread to allow outputting
exceptions and tracebacks using a Logger

The running part is implemented by overriding the nestor_run()
method (instead of run() for threading.Thread)

"""


import threading
import traceback

from .errors import ImplementationError

class Thread(threading.Thread):

    nestor_init_done = False

    def __init__(self, name, nestor, traceback=True):
        threading.Thread.__init__(self)
        self.nestor_init_done = True
        self.name = name
        self.nestor = nestor
        self.traceback = traceback
        
        # Logger aliases
        self.info = nestor.info
        self.verbose = nestor.verbose
        self.debug = nestor.debug
        self.perf = nestor.perf

    def nestor_run(self):
        raise ImplementationError("nestor_run() was not overriden")

    def run(self):
        if not self.nestor_init_done:
            raise ImplementationError("Thread.__init__() not called")
        try:
            self.nestor_run()
        except Exception, e:
            self.log_exception(e)
                
    def log_exception(self, e):
        if self.traceback:
            self.info(traceback.format_exc())
        else:
            self.info("Exception: %s (%s)" % (type(e), e.args))

