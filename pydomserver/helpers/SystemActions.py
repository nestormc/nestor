# This file is part of avhes.
#
# avhes is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# avhes is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with avhes.  If not, see <http://www.gnu.org/licenses/>.

import os
import shutil
import subprocess
import time
import urllib

from ..Errors import CancelOperation
from ..Thread import Thread
from ..SocketInterface import SIPacket, SIStringTag, SIUInt32Tag
from ..SocketInterfaceCodes import SIC

            
class FileOpThread(Thread):
    
    def __init__(self, avhes, tag):
        Thread.__init__(self, avhes)
        self.tag = tag
        self.apid = -1
        
    def create_action_progress(self):
        db = self.avhes.get_main_db()
        curs = db.cursor()
        curs.execute("""INSERT INTO action_progress
                        (status, progress, msg)
                        VALUES(0, 0, '')""")
        self.apid = curs.lastrowid
        db.commit()
        curs.close()
        db.close()
        return self.apid
        
    def set_action_progress(self, status, progress, msg = ''):
        if self.apid != -1:
            db = self.avhes.get_main_db()
            curs = db.cursor()
            curs.execute("""SELECT COUNT(*)
                            FROM action_progress
                            WHERE id = ?""", (self.apid,))
            count = int(curs.fetchone()[0])
            if count != 0:
                query = """UPDATE action_progress
                           SET status = ?, progress = ?, msg = ?
                           WHERE id = ?"""
                curs.execute(query, (status, progress, msg, self.apid))
                db.commit()
            curs.close()
            db.close()
            return count
        
    def avhes_run(self):
        try:
            action = self.tag.get_subtag(SIC.TAG_ACTION_FILE_OP).value
            source = self.tag.get_subtag(SIC.TAG_ACTION_FILE_FROM).value
        except AttributeError:
            self.set_action_progress(-1, 0, "incomplete action request")
            return
        try:
            dest = self.tag.get_subtag(SIC.TAG_ACTION_FILE_TO).value
        except AttributeError:
            dest = None
            
        if action == 'inflate':
            self.set_action_progress(1, 0)
            self.do_inflate(source)
        elif action == 'delete':
            self.set_action_progress(1, 0)
            self.do_delete(source)
        elif action == 'copy':
            if dest is None:
                self.set_action_progress(-1, 0, "incomplete action request")
                return
            self.set_action_progress(1, 0)
            self.do_copy(source, dest)
        elif action == 'download':
            if dest is None:
                self.set_action_progress(-1, 0, "incomplete action request")
                return
            self.set_action_progress(1, 0)
            self.do_download(source, dest)
        else:
            self.set_action_progress(-1, 0, "unknown action")

    def _dl_progress(self, nblocks, blocksize, totalsize):
        if totalsize < 1:
            progress = 0
        else:
            progress = int(100 * (nblocks * blocksize) / totalsize)
        if time.time() != self._lasttime:
            dl = nblocks * blocksize - self._lastsize
            tm = time.time() - self._lasttime
            speed = int(dl / tm)
            self._lasttime = time.time()
            self._lastsize = nblocks * blocksize
            self._lastspeed = speed
        else:
            speed = self._lastspeed
            
        ret = self.set_action_progress(1, progress, "size:%d;done:%d;speed:%d" %
                                       (totalsize, nblocks * blocksize, speed))
        if ret == 0:
            raise CancelOperation

    def do_download(self, url, dest):
        try:
            self._lastsize = 0
            self._lasttime = time.time()
            self._lastspeed = 0
            filename = urllib.urlretrieve(url, None, self._dl_progress)[0]
            if os.path.exists(filename):
                destfilename = os.path.join(dest, os.path.basename(filename))
                shutil.move(filename, destfilename)
            else:
                self.set_action_progress(-1, 0, "download failed")
        except IOError:
            self.set_action_progress(-1, 0, "cannot reach url")
        except urllib.ContentTooShortError:
            self.set_action_progress(-1, 0, "download interrupted")
        except CancelOperation:
            pass        
        else:
            self.set_action_progress(2, 100)

    def do_inflate(self, filename):
        lfile = filename()

        if lfile.endswith(".tar.gz") or lfile.endswith(".tgz"):
            command = ["tar", "xzf", filename]
        elif lfile.endswith(".tar.bz2") or lfile.endswith(".tbz"):
            command = ["tar", "xjf", filename]
        elif lfile.endswith(".zip"):
            command = ["unzip", filename]
        elif lfile.endswith(".rar"):
            command = ["unrar", "x", filename]
        else:
            msg = "cannot inflate %s: unknown type" % filename
            self.info(msg)
            self.set_action_progress(-1, 0, msg)
            return

        inflateprocess = subprocess.Popen(command)
        ret = os.waitpid(inflateprocess.pid, 0)[1]

        if ret:
            self.set_action_progress(-1, 0, "extraction failed")
        else:
            self.set_action_progress(2, 100)

    def do_copy(self, frompath, topath):
        if not os.path.exists(frompath):
            self.set_action_progress(-1, 0, "cannot find source")
            return

        if not os.path.isdir(topath):
            self.set_action_progress(-1, 0, "cannot find destination")
            return

        dest = os.path.join(topath, os.path.basename(frompath))

        if os.path.exists(dest):
            self.set_action_progress(-1, 0, "destination already exists")
            return

        try:
            if os.path.isdir(frompath):
                shutil.copytree(frompath, dest)
            else:
                shutil.copy(frompath, dest)
        except:
            self.set_action_progress(-1, 0, "copy failed")
        else:
            self.set_action_progress(2, 100)

    def do_delete(self, path):
        if not os.path.exists(path):
            self.set_action_progress(-1, 0, "cannot find source")

        try:
            if os.path.isdir(path):
                shutil.rmtree(path)
            else:
                os.unlink(path)
        except:
            self.set_action_progress(-1, 0, "delete failed")
        else:
            self.set_action_progress(2, 100)
    
    
class SystemActionsHelper:

    def __init__(self, avhes):
        self.avhes = avhes
        self.avhes.info("Initializing system actions helper")
        self.logger = avhes
        avhes.register_packet_handler(SIC.OP_ACTIONS, self.handle_sipacket)
        
    def handle_sipacket(self, client, packet):
        tag = packet.get_tag(SIC.TAG_ACTION_TYPE)
        
        if tag is None:
            return False
                    
        if tag.value == 'config':    
            try:
                self.handle_config(tag)
            except (KeyError, AttributeError):
                return False
            client.answer_success()
            return True
        elif tag.value == 'file':
            thread = FileOpThread(self.avhes, tag)
            apid = thread.create_action_progress()
            self.avhes.add_thread(thread)
            client.answer_processing(apid)
            return True
        elif tag.value == 'sysinfo':
            client.answer(self.get_sysinfo())
            return True
        elif tag.value == 'diskspace':
            client.answer(self.get_diskspace())
            return True
                
        return False
            
    def handle_config(self, tag):
        key = tag.get_subtag(SIC.TAG_ACTION_CONFIG_KEY).value
        val = tag.get_subtag(SIC.TAG_ACTION_CONFIG_VAL).value
        
        existing = True
        try:
            oldval = self.avhes.config[key]
        except KeyError:
            oldval = None
            existing = False
        
        if not existing or oldval != val:
            self.avhes.verbose("Setting %s to %s" % (key, val))
            self.avhes.config[key] = val
                
    def get_sysinfo(self):
        packet = SIPacket(opcode = SIC.OP_SUCCESS)
        
        def rread(f):
            fp = open(f, "r")
            val = fp.read()
            fp.close()
            return val
            
        val = rread("/proc/version_signature")
        tag = SIStringTag('version', SIC.TAG_ACTION_INFO_KEY)
        tag.subtags.append(SIStringTag(val, SIC.TAG_ACTION_INFO_VALUE))
        packet.tags.append(tag)
        
        val = int(rread("/proc/uptime").split()[0].split(".")[0])
        tag = SIStringTag('uptime', SIC.TAG_ACTION_INFO_KEY)
        tag.subtags.append(SIUInt32Tag(val, SIC.TAG_ACTION_INFO_VALUE))
        packet.tags.append(tag)
        
        val = rread("/proc/acpi/thermal_zone/THRM/temperature").split()[1]
        tag = SIStringTag('temperature', SIC.TAG_ACTION_INFO_KEY)
        tag.subtags.append(SIStringTag(val, SIC.TAG_ACTION_INFO_VALUE))
        packet.tags.append(tag)
            
        return packet
        
    def get_diskspace(self):
        packet = SIPacket(opcode = SIC.OP_SUCCESS)
        
        dfout = subprocess.Popen(['df', '-B', '1M'],
                                 stdout=subprocess.PIPE).communicate()[0]
        diskspace = dfout.split("\n")[1:]
        for dsline in diskspace:
            ds = dsline.split()
            if ds[0].startswith("/dev"):
                tag = SIStringTag(ds[0], SIC.TAG_ACTION_DISK_DEVICE)
                tag.subtags.extend([
                    SIStringTag(ds[5], SIC.TAG_ACTION_DISK_MOUNTPOINT),
                    SIUInt32Tag(int(ds[1]), SIC.TAG_ACTION_DISK_TOTAL),
                    SIUInt32Tag(int(ds[3]), SIC.TAG_ACTION_DISK_FREE),
                ])
                packet.tags.append(tag)
                
        return packet
        
        
