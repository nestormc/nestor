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
import time

MAX_LOG_SIZE = 1024**2 

LL_QUIET = 0
LL_INFO = 1
LL_VERBOSE = 2
LL_DEBUG = 3

LL_DESC = {
    LL_INFO:    'INFO',
    LL_VERBOSE: 'VERBOSE',
    LL_DEBUG:   'DEBUG'
}

class Logger:

    def __init__(self, logfile, level = LL_DEBUG,
                    maxsize = MAX_LOG_SIZE):
        if not os.path.exists(os.path.dirname(logfile)):
            os.makedirs(os.path.dirname(logfile))
        self.logfile = logfile
        self.maxsize = maxsize
        self.level = level
        
    def rotate(self):
        if self.maxsize > 0:
            if os.stat(self.logfile)[6] > self.maxsize:
                lfile0 = "%s.0" % self.logfile
                if os.path.exists(lfile0):
                    os.unlink(lfile0)
                os.rename(self.logfile, lfile0)

    def log(self, text, level = LL_DEBUG):
        if level > self.level:
            return
        
        t = time.time()
        msec = (t - int(t)) * 1000
        lt = time.localtime(t)
        tm = "%s.%03d" % (time.strftime('%Y-%m-%d %H:%M:%S', lt), msec)
        if level == LL_QUIET:
            text = "%s ****************************************" % tm
        else:
            text = "%s [%s] %s" % (tm, LL_DESC[level], text) 
        
        l = open(self.logfile, 'a')
        try:
            l.write("%s\n" % text)
        except UnicodeError:
            l.write("%s\n" % text.encode('utf-8'))
        l.close()
        self.rotate()
            
    def info(self, text):
        self.log(text, LL_INFO)
            
    def verbose(self, text):
        self.log(text, LL_VERBOSE)
        
    def debug(self, text):
        self.log(text, LL_DEBUG)

    def mark(self):
        self.log('', LL_QUIET)
                

