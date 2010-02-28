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
import subprocess
import time

from .thread import Thread

NESTOR_RUNWATCHER_INTERVAL = 1
TERM_KILL_WAIT_CYCLES = 10

class RunWatcherThread(Thread):
    """Command watcher thread

    Watch the execution of a command, and relaunch it if it exits.
    Subclasses can override 3 methods to get callbacks:
    - on_start() is called after a command launch attempt
    - on_kill() is called before a command kill attempt
    - on_check() is called after each running check

    """

    def __init__(self, name, nestor, command, **kwargs):
        """Watcher initialization

        daemon: parent daemon object (for log and config facilities)
        command: command to launch

        Keyword arguments:
        kill: whether to kill the process when the thread is stopped (defaults
            to False).  The process is killed with SIGTERM first, then SIGKILL.
        pidof: process name to look for instead of searching for a pidfile
        user: launch the command with an other user
        wait_cycles: how many cycles to wait between TERM and KILL signals when
            killing the process (defaults to 2).

        """

        Thread.__init__(self, name, nestor)
        self.command = command
        self.sigterm_sent = 0
        self.running = False

        self.pidof = kwargs.get('pidof', None)
        self.kill = kwargs.get('kill', False)
        self.wait_cycles = kwargs.get('wait_cycles', TERM_KILL_WAIT_CYCLES)
        self.user = kwargs.get('user', None)

    def nestor_run(self):
        self.info("Starting RunWatcher thread for %s" % self.command)
        self.running = True
        while self.running:
            self.sigterm_sent = 0
            self.ensure_running()
            self.on_check()
            time.sleep(NESTOR_RUNWATCHER_INTERVAL)

        if self.kill:
            killed = False
            while not killed:
                killed = self.ensure_killed()
                time.sleep(NESTOR_RUNWATCHER_INTERVAL)
        self.info("Stopped RunWatcher thread for %s" % self.command)

    def stop(self):
        self.running = False

    def getpid(self):
        """Returns pid if running, 0 if not"""
        if self.pidof is None:
            pidfile = "/var/run/%s.pid" % os.path.basename(self.command)
            try:
                fp = open(pidfile)
            except IOError:
                return 0
            else:
                pid = int(fp.read())
                fp.close()
                if os.path.exists("/proc/%d" % pid):
                    return pid
                else:
                    os.unlink(pidfile)
                    return 0
        else:
            try:
                pid = int(subprocess.Popen(["pidof", self.pidof],
                          stdout=subprocess.PIPE).communicate()[0])
                if os.path.exists("/proc/%d" % pid):
                    return pid
                else:
                    return 0
            except ValueError:
                return 0

    def ensure_running(self):
        if self.getpid() == 0:
            if self.user is None:
                self.verbose("RunWatcher: Starting %s" % self.command)
                subprocess.Popen(self.command)
            else:
                self.verbose("RunWatcher: Starting %s as user %s" %
                             (self.command, self.user))
                subprocess.Popen(['su', self.user, '-c', self.command])
            self.on_start()

    def ensure_killed(self):
        pid = self.getpid()

        if self.pidof is None:
            target = self.command
        else:
            target = self.pidof

        if pid != 0:
            self.on_kill()
            if self.sigterm_sent == 0:
                self.verbose("RunWatcher: sending SIGTERM to %s" % target)
                subprocess.Popen(["kill", "-TERM", "%d" % pid])
                self.sigterm_sent += 1
            elif self.sigterm_sent < self.wait_cycles:
                self.sigterm_sent += 1
            else:
                self.verbose("RunWatcher: sending SIGKILL to %s" % target)
                subprocess.Popen(["kill", "-KILL", "%d" % pid])
                return True
            return False
        else:
            return True
                
    def on_start(self):
        pass
        
    def on_kill(self):
        pass
        
    def on_check(self):
        pass
        
        

