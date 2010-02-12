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

"""Just a simple wrapper to threading.Thread to allow outputting
exceptions and tracebacks using a Logger

The running part is implemented by overriding the domserver_run()
method (instead of run() for threading.Thread)

"""


import threading
import traceback

from .errors import ImplementationError

class Thread(threading.Thread):

    domserver_init_done = False

    def __init__(self, domserver, logger=None, traceback=True):
        threading.Thread.__init__(self)
        self.domserver_init_done = True
        self.domserver = domserver
        self.traceback = traceback
        
        # Logger aliases
        self.logger = logger
        if logger is None:
            self.logger = self.domserver
        self.info = logger.info
        self.verbose = logger.verbose
        self.debug = logger.debug
        self.perf = logger.perf

    def domserver_run(self):
        raise ImplementationError("domserver_run() was not overriden")

    def run(self):
        if not self.domserver_init_done:
            raise ImplementationError("Thread.__init__() not called")
        try:
            self.domserver_run()
        except Exception, e:
            self.log_exception(e)
                
    def log_exception(self, e):
        if self.traceback:
            self.info(traceback.format_exc())
        else:
            self.info("Exception: %s (%s)" % (type(e), e.args))

