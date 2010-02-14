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
import socket

from .socketinterface import SIPacket, SIStringTag
from .socketinterfacecodes import SIC
    

def nestorRunning(name):
    pidfile = "/var/run/%s.pid" % name
    if os.access(pidfile, os.F_OK):
        pidfp = open(pidfile, 'r')
        pid = int(pidfp.read())
        pidfp.close()
        if os.path.exists("/proc/%d" % pid):
            return True
    return False
    
def remoteSetConfig(nestor, key, value):
    host = nestor.config['nestor.ipc_host']
    port = int(nestor.config['nestor.ipc_port'])
    
    try:
        flags = socket.AI_ADDRCONFIG
    except AttributeError:
        flags = 0

    msg = "getaddrinfo returned nothing"
    _socket = None
    for res in socket.getaddrinfo(host, port, socket.AF_UNSPEC,
               socket.SOCK_STREAM, socket.IPPROTO_TCP, flags):
        af, stype, proto, cname, sa = res
        try:
            _socket = socket.socket(af, stype, proto)
            _socket.connect(sa)
        except socket.error, msg:
            if _socket:
                _socket.close()
                _socket = None
            continue
        break

    if not _socket:
        raise socket.error(msg)

    wfile = _socket.makefile("wb")
    rfile = _socket.makefile("rb")
    
    req = SIPacket(opcode=SIC.OP_ACTIONS)
    tag = SIStringTag('config', SIC.TAG_ACTION_TYPE)
    tag.subtags.extend([
        SIStringTag(key, SIC.TAG_ACTION_CONFIG_KEY),
        SIStringTag(value, SIC.TAG_ACTION_CONFIG_VAL)
    ])
    req.tags.append(tag)
    
    wfile.write(req.get_raw_packet())
    wfile.flush()
    resp = SIPacket(buffer=rfile)
    
    disc = SIPacket(opcode=SIC.OP_DISCONNECT)
    wfile.write(disc.get_raw_packet())
    wfile.flush()    
    ack = SIPacket(buffer=rfile)
    
    wfile.close()
    rfile.close()
    _socket.close()
    
    return resp.opcode == SIC.OP_SUCCESS

def fileIsOpen(file):
	spid = os.getpid()
	for pid in getSubDirs('/proc'):
		try:
			int(pid)
		except ValueError:
			continue

		if pid != spid:
			d = os.path.join('/proc', pid, 'fd')
			try:
				for f in os.listdir(d):
					try:
						lnk = os.readlink(os.path.join(d, f))
					except OSError:
						continue
					if lnk == file:
						return True
			except OSError:
				continue
	return False


def getSubDirs(path):
	subdirs = []
	for r, d, f in os.walk(path):
		subdirs.extend(d)
		d[0:len(d)] = []
	return subdirs


def getFiles(path):
	files = []
	for r, d, f in os.walk(path):
		files.extend(f)
		d[0:len(d)] = []
	return files


def getObjects(path):
	files = []
	subdirs = []
	for r, d, f in os.walk(path):
		subdirs.extend(d)
		files.extend(f)
		d[0:len(d)] = []
	return (files, subdirs)


def human_bytes(v, start=0, unit="", suffix=""):
    suffixes = {0: "", 1: "k", 2: "M", 3: "G", 4: "T"}
    val = float(v)
    mult = start
    while val > 1000:
        val /= 1024
        mult += 1
        
    if val < 10:
        prec = 2
    elif val < 100:
        prec = 1
    else:
        prec = 0
        
    fmt = "%%.%dF %%s%%s%%s" % prec
    return fmt % (val, suffixes[mult], unit, suffix)
    
def human_speed(v):
    return human_bytes(v, 0, "B", "/s")
    
def human_size(v):
    return human_bytes(v, 0, "B")
    
def human_ksize(v):
    return human_bytes(v, 1, "B")
    
def human_Msize(v):
    return human_bytes(v, 2, "B")
    
def human_seconds(secs):
    minutes = int(secs / 60)
    seconds = secs - 60 * minutes
    return "%d:%02d" % (minutes, seconds)
    
    

