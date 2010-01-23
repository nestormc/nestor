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

from cStringIO import StringIO
import socket
import struct
import time
import zlib

from .errors import SIVersionMismatch
from .thread import Thread
from .socketinterfacecodes import SIC


SIC.MAX_CONNECTIONS          = 5

	
class SITag:
    def __init__(self, name, type):
        self.name = name
        self.type = type
        self.subtags = []
        
    def get_subtag(self, name):
        for st in self.subtags:
            if st.name == name:
                return st
        return None

    def get_data(self):
        selfdata = self.pack()

        if len(self.subtags):
            name = (self.name << 1) | 1
            data = struct.pack("!H", name)
            data = data + struct.pack("!B", self.type)

            stdata = ""
            stlen = 0
            for st in self.subtags:
                thisdata, thislen = st.get_data()
                stdata = stdata + thisdata
                stlen = stlen + thislen

            taglen = stlen + len(selfdata)
            data = data + struct.pack("!I", taglen)
            data = data + struct.pack("!H", len(self.subtags))

            data = data + stdata + selfdata
        else:
            name = self.name << 1
            data = struct.pack("!H", name)
            data = data + struct.pack("!B", self.type)
            taglen = len(selfdata)
            data = data + struct.pack("!I", taglen)
            data = data + selfdata

        return (data, 7 + taglen)

    def dump(self):
        s = "Name: 0x%04x\n" % self.name
        s = s + "Type: 0x%02x\n" % self.type
        s = s + "Subtag count: %d\n" % len(self.subtags)
        if len(self.subtags):
            s = s + "----- SUBTAGS : -----\n"
            sts = ""
            for st in self.subtags:
                sts = sts + st.dump()
            s = s + "\n".join(["  " + a for a in sts.split("\n")]).rstrip(" ")
            s = s + "---------------------\n"
        s = s + "Value: %s\n" % repr(self.value)
        s = s + "Packed value: %s\n" % repr(self.pack())
        return s


class SIUInt8Tag(SITag):
    def __init__(self, value, name):
        SITag.__init__(self, name, SIC.TAGTYPE_UINT8)
        self.value = value

    def pack(self):
        return struct.pack("!B", self.value)


class SIUInt16Tag(SITag):
    def __init__(self, value, name):
        SITag.__init__(self, name, SIC.TAGTYPE_UINT16)
        self.value = value

    def pack(self):
        return struct.pack("!H", self.value)


class SIUInt32Tag(SITag):
    def __init__(self, value, name):
        SITag.__init__(self, name, SIC.TAGTYPE_UINT32)
        self.value = value

    def pack(self):
        return struct.pack("!I", self.value)


class SIStringTag(SITag):
    def __init__(self, value, name):
        SITag.__init__(self, name, SIC.TAGTYPE_STRING)
        self.value = value

    def pack(self):
        if isinstance(self.value, unicode):
            return "%s\x00" % self.value.encode('utf-8')
        else:
            return "%s\x00" % str(self.value)

class SIPacket:
    def __init__(self, **kwargs):
        self.tags = []
        self.flags = SIC.FLAGS_BLANK
        self.opcode = kwargs.get('opcode', SIC.OP_NOOP)

        if kwargs.has_key('rawdata'):
            self._parse_raw_packet(kwargs['rawdata'])
        elif kwargs.has_key('buffer'):
            self._read_raw_packet(kwargs['buffer'])

    def set_flag(self, flag):
        self.flags = self.flags | flag

    def get_flag(self, flag):
        return self.flags & flag
        
    def get_tag(self, name):
        for t in self.tags:
            if t.name == name:
                return t
        return None

    def get_raw_packet(self):
        headdata = struct.pack("!HH", SIC.VERSION, self.flags)
        use_zlib = self.get_flag(SIC.FLAGS_USE_ZLIB)

        tagdata = ""
        for t in self.tags:
            tagdata = tagdata + t.get_data()[0]

        appdata = struct.pack("!BH", self.opcode, len(self.tags))
        appdata = appdata + tagdata

        if use_zlib:
            appdata = zlib.compress(appdata)

        headdata = headdata + struct.pack("!I", len(appdata))
        return headdata + appdata

    def _parse_raw_packet(self, data):
        self._read_raw_packet(StringIO(data))

    def _read_raw_packet(self, dbuf):
        version, self.flags, msg_len = struct.unpack("!HHI", dbuf.read(8))
        if version != SIC.VERSION:
        	raise SIVersionMismatch("Protocol version mismatch (%d != %d)" % (version, SIC.VERSION))
        use_zlib = self.get_flag(SIC.FLAGS_USE_ZLIB)

        if use_zlib:
            data = zlib.decompress(dbuf.read(msg_len))
            dbuf = StringIO(data)

        self.opcode = struct.unpack("!B", dbuf.read(1))[0]
        tagcount = struct.unpack("!H", dbuf.read(2))[0]

        def parse_tag(buf):
            tagname, tagtype, taglen = struct.unpack("!HBI", buf.read(7))

            has_subtags = tagname & 0x1
            tagname = tagname >> 1
            subtags = []

            if has_subtags:
                subtagcount = struct.unpack("!H", buf.read(2))[0]
                for j in range(subtagcount):
                    subtags.append(parse_tag(buf))

            if tagtype == SIC.TAGTYPE_UINT8:
                tag = SIUInt8Tag(struct.unpack("!B", buf.read(1))[0], tagname)
            elif tagtype == SIC.TAGTYPE_UINT16:
                tag = SIUInt16Tag(struct.unpack("!H", buf.read(2))[0], tagname)
            elif tagtype == SIC.TAGTYPE_UINT32:
                tag = SIUInt32Tag(struct.unpack("!I", buf.read(4))[0], tagname)
            elif tagtype == SIC.TAGTYPE_STRING:
                string = ""
                while 1:
                    char = buf.read(1)
                    if char == "\x00":
                        break
                    else:
                        string = string + char
                tag = SIStringTag(string.decode('utf-8'), tagname)
            else:
                raise ValueError("Unsupported TagType: 0x%x" % tagtype)

            tag.subtags = subtags
            return tag

        for i in range(tagcount):
            self.tags.append(parse_tag(dbuf))
            
        if use_zlib:
            dbuf.close()
            del dbuf

    def dump(self, with_raw = False):
        s = "Flags: 0x%02x\n" % self.flags
        s = s + "Opcode: 0x%02x\n" % self.opcode
        s = s + "Tag count: %d\n" % len(self.tags)
        s = s + "\nTags:\n\n"

        for t in self.tags:
            s = s + t.dump() + "\n"

        if with_raw:
            s = s + "\nRaw data:\n"
            raw = self.get_raw_packet()
            cnt = 0
            for c in raw:
                s = s + "%02x" % ord(c)
                if cnt % 4 == 3:
                    s = s + " "
                if cnt % 16 == 15:
                    s = s + "\n"
                cnt = cnt + 1

        return s
        
        
class SIServerThread(Thread):

    def __init__(self, domserver, logger, host, port,
                    max_conn = SIC.MAX_CONNECTIONS):
        Thread.__init__(self, domserver, logger)
        self.host = host
        self.port = port
        self.max_conn = max_conn
        self._reset()
        self._handlers = {}
        
    def _reset(self):
        self._sock = None
        
    def _listen(self, host, port, max_conn):
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.bind((host, port))
        self._sock.listen(max_conn)
        self.listening = True
        
        while self.listening:
            self._sock.settimeout(1)
            try:
                (clisock, address) = self._sock.accept()
            except socket.timeout:
                pass
            else:
                self._sock.settimeout(None)
                clithread = SIClientThread(
                    self.domserver,
                    self.logger,
                    clisock,
                    address,
                    self._handlers
                )
                self.domserver.add_thread(clithread)
        self._sock.close()
        self._reset()
            
    def domserver_run(self):
        err = True
        while err:
            try:
                self._listen(self.host, self.port, self.max_conn)
                err = False
            except socket.error:
                self.info("Could not listen on %s:%d, waiting 5s..." %
                    (self.host, self.port))
                time.sleep(5)

    def stop(self):
        self.listening = False  
        
    def register_packet_handler(self, opcode, handler, args=None):
        """Register a packet handler for packets with given opcode.  'handler'
        must be callable; it will be called with the following arguments:
        - the SI client thread (giving access to answer_* methods)
        - the received packet
        - 'args', except if None
        It must return a bool, telling if it has called an answer_* method or
        not.  If not, the client thread will send a 'failure' response packet.
        """
        
        if self._handlers.has_key(opcode):
            self.info("WARNING: overwriting opcode 0x%02x SI handler" % opcode)
        self._handlers[opcode] = {'func': handler, 'args': args}
        
    def unregister_packet_handler(self, opcode):
        """Unregister previously registered handler for packets with opcode."""
        
        del self._handlers[opcode]


class SIClientThread(Thread):

    def __init__(self, domserver, logger, sock, address, handlers):
        Thread.__init__(self, domserver, logger)
        self._sock = sock
        self.address = address
        self._rfile = sock.makefile("rb")
        self._wfile = sock.makefile("wb")
        self._handlers = handlers
        self.disconnected = False
        
    def read_packet(self):
        return SIPacket(buffer = self._rfile)
        
    def answer(self, packet):
        self._wfile.write(packet.get_raw_packet())
        self._wfile.flush()
        self.answered = True
        
    def answer_success(self):
        packet = SIPacket(opcode = SIC.OP_SUCCESS)
        self.answer(packet)
        
    def answer_failure(self, reason=None):
        packet = SIPacket(opcode = SIC.OP_FAILURE)
        if reason is not None:
            packet.tags.append(SIStringTag(reason, SIC.TAG_FAILURE_REASON))
        self.answer(packet)
        
    def answer_processing(self, apid):
        packet = SIPacket(opcode = SIC.OP_PROCESSING)
        packet.tags.append(SIUInt32Tag(apid, SIC.TAG_ACTION_PROGRESS_ID))
        self.answer(packet)
        
    def handle_packet(self, packet):
        if packet.opcode == SIC.OP_DISCONNECT:
            ack = SIPacket(opcode=SIC.OP_DISCONNECT_ACK)
            self.answer(ack)
            self.disconnected = True
            return
    
        try:
            handler = self._handlers[packet.opcode]
        except KeyError:
            self.debug("No handler found for opcode %02x" % packet.opcode)
            self.answer_failure("invalid-opcode:%02x" % packet.opcode)
            return
            
        self.answered = False
        if handler['args'] is None:
            handler['func'](self, packet)
        else:
            handler['func'](self, packet, handler['args'])
            
        if not self.answered:
            self.answer_failure("unknown")
        
    def domserver_run(self):
        raise_exc = True
        try:
            while not self.disconnected:
                try:
                    packet = self.read_packet()
                except SIVersionMismatch:
                	self.verbose("Client %s has wrong protocol version" %
                        repr(self.address))
                	raise_exc = False
                	raise
                except struct.error:
                    raise_exc = False
                    raise
                else:
                    self.handle_packet(packet)
            self._rfile.close()
            self._wfile.close()
            self._sock.close()
        except:
            self._rfile.close()
            self._wfile.close()
            self._sock.close()
            if raise_exc:
                raise
            else:
        	    self.verbose("Warning: client %s closed connection unexpectedly"
        	        % repr(self.address))

