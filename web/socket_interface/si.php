<?

/*
This file is part of domserver.

domserver is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

domserver is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with domserver.  If not, see <http://www.gnu.org/licenses/>.
*/

require_once "socket_interface/si_codes.php";

class SITag
{
    function __construct($name, $type)
    {
        $this->name = $name;
        $this->type = $type;
        $this->subtags = array();
    }
        
    function get_subtag($name)
    {
        foreach ($this->subtags as $st)
        {
            if ($st->name == $name) return $st;
        }
        return FALSE;
    }

    function get_data()
    {
        $selfdata = $this->pack();

        if (count($this->subtags))
        {
            $name = ($this->name << 1) | 1;
            $data = pack("n", $name);
            $data .= pack("C", $this->type);

            $stdata = "";
            $stlen = 0;
            foreach ($this->subtags as $st)
            {
                list($thisdata, $thislen) = $st->get_data();
                $stdata .= $thisdata;
                $stlen += $thislen;
            }

            $taglen = $stlen + strlen($selfdata);
            $data .= pack("N", $taglen);
            $data .= pack("n", count($this->subtags));

            $data .= $stdata . $selfdata;
        }
        else
        {
            $name = $this->name << 1;
            $data = pack("n", $name);
            $data .= pack("C", $this->type);
            $taglen = strlen($selfdata);
            $data .= pack("N", $taglen);
            $data .= $selfdata;
        }

        return array($data, 7 + $taglen);
    }

    function dump()
    {
        $s = sprintf("Name: 0x%04x\n", $this->name);
        $s .= sprintf("Type: 0x%02x\n", $this->type);
        $s .= sprintf("Subtag count: %d\n", count($this->subtags));
        if (count($this->subtags))
        {
            $s .= "----- SUBTAGS : -----\n";
            foreach ($this->subtags as $st)
                $s .= $st->dump();
            $s .= $sts;
            $s .= "---------------------\n";
        }
        $s .= sprintf("Value: %s\n", $this->value);
        return $s;
    }
}


class SIUInt8Tag extends SITag
{
    function __construct($value, $name)
    {
        parent::__construct($name, SIC('TAGTYPE_UINT8'));
        $this->value = $value;
    }

    function pack()
    {
        return pack("C", $this->value);
    }
}


class SIUInt16Tag extends SITag
{
    function __construct($value, $name)
    {
        parent::__construct($name, SIC('TAGTYPE_UINT16'));
        $this->value = $value;
    }

    function pack()
    {
        return pack("n", $this->value);
    }
}


class SIUInt32Tag extends SITag
{
    function __construct($value, $name)
    {
        parent::__construct($name, SIC('TAGTYPE_UINT32'));
        $this->value = $value;
    }

    function pack()
    {
        return pack("N", $this->value);
    }
}


class SIStringTag extends SITag
{
    function __construct($value, $name)
    {
        parent::__construct($name, SIC('TAGTYPE_STRING'));
        $this->value = $value;
    }

    function pack()
    {
        return sprintf("%s\x00", $this->value);
    }
}


class SIPacket
{
    function __construct($opcode, $buffer = FALSE)
    {
        $this->tags = array();
        $this->flags = SIC('FLAGS_BLANK');
        $this->opcode = $opcode;

        if ($buffer !== FALSE)
            $this->_read_raw_packet($buffer);
    }

    function set_flag($flag)
    {
        $this->flags |= $flag;
    }

    function get_flag($flag)
    {
        return $this->flags & $flag;
    }
        
    function get_tag($name)
    {
        foreach ($this->tags as $t)
        {
            if ($t->name == $name) return $t;
        }
        return FALSE;
    }

    function get_raw_packet()
    {
        $headdata = pack("nn", SIC('VERSION'), $this->flags);
        $use_zlib = $this->get_flag(SIC('FLAGS_USE_ZLIB'));

        $tagdata = "";
        foreach ($this->tags as $t)
        {
            list($td, $ts) = $t->get_data();
            $tagdata .= $td;
        }

        $appdata = pack("Cn", $this->opcode, count($this->tags));
        $appdata .= $tagdata;

        if ($use_zlib) $appdata = gzcompress($appdata);

        $headdata .= pack("N", strlen($appdata));
        return $headdata . $appdata;
    }
    
    function _parse_tag($buf)
    {
        $unpack = unpack("ntagname/Ctagtype/Ntaglen", fread($buf, 7));
        $tagname = $unpack["tagname"];
        $tagtype = $unpack["tagtype"];
        $taglen = $unpack["taglen"];

        $has_subtags = $tagname & 0x1;
        $tagname = $tagname >> 1;
        $subtags = array();

        if ($has_subtags)
        {
            $unpack = unpack("nstcount", fread($buf, 2));
            $subtagcount = $unpack["stcount"];
            for ($j = 0; $j < $subtagcount; $j++)
                $subtags[] = $this->_parse_tag($buf);
        }

        if ($tagtype == SIC('TAGTYPE_UINT8'))
        {
            $val = unpack("Cval", fread($buf, 1));
            $tag = new SIUInt8Tag($val["val"], $tagname);
        }
        elseif ($tagtype == SIC('TAGTYPE_UINT16'))
        {
            $val = unpack("nval", fread($buf, 2));
            $tag = new SIUInt16Tag($val["val"], $tagname);
        }
        elseif ($tagtype == SIC('TAGTYPE_UINT32'))
        {
            $val = unpack("Nval", fread($buf, 4));
            $tag = new SIUInt32Tag($val["val"], $tagname);
        }
        elseif ($tagtype == SIC('TAGTYPE_STRING'))
        {
            $string = "";
            while (1)
            {
                $char = fread($buf, 1);
                if ($char == "\x00") break;
                else $string .= $char;
            }
            $tag = new SIStringTag($string, $tagname);
        }
        else
            die(sprintf("Unsupported TagType: 0x%x", $tagtype));

        $tag->subtags = $subtags;
        return $tag;
    }

    function _read_raw_packet($dbuf)
    {
        $in = fread($dbuf, 8);
        if (strlen($in) < 8)
            die("No packet to read");
        $unpack = unpack("nvers/nflags/Nlen", $in);
        $version = $unpack["vers"];
        $this->flags = $unpack["flags"];
        $msg_len = $unpack["len"];
        if ($version != SIC('VERSION'))
        	die(sprintf("Protocol version mismatch (%d != %d)", version, SIC('VERSION')));
        $use_zlib = $this->get_flag(SIC('FLAGS_USE_ZLIB'));

        if ($use_zlib)
        {     
            $gzdata = stream_get_contents($dbuf, $msg_len);
            $data = gzuncompress($gzdata);
            $dbuf = tmpfile();
            fwrite($dbuf, $data);
            fseek($dbuf, 0);
        }

        $unpack = unpack("Copcode/ntagcount", fread($dbuf, 3));
        $this->opcode = $unpack["opcode"];
        $tagcount = $unpack["tagcount"];

        for ($i = 0; $i < $tagcount; $i++)
            $this->tags[] = $this->_parse_tag($dbuf);
            
        if ($use_zlib)
        {
            fclose($dbuf);
        }
    }

    function dump($with_raw = FALSE)
    {
        $s = sprintf("Flags: 0x%02x\n", $this->flags);
        $s .= sprintf("Opcode: 0x%02x\n", $this->opcode);
        $s .= sprintf("Tag count: %d\n", count($this->tags));
        $s .= "\nTags:\n\n";

        foreach ($this->tags as $t)
            $s .= $t->dump() . "\n";

        if ($with_raw)
        {
            $s .= "\nRaw data:\n";
            $raw = $this->get_raw_packet();
            $cnt = 0;
            foreach (str_split($raw) as $c)
            {
                $s .= sprintf("%02x", ord($c));
                if ($cnt % 4 == 3)
                    $s .= " ";
                if ($cnt % 16 == 15)
                    $s .= "\n";
                $cnt++;
            }
        }

        return $s;
    }
}

class SocketInterface
{
    var $host;
    var $port;
    var $socket = NULL;
    var $errmsg;
    var $connected = FALSE;
    
    function __construct($host, $port)
    {
		$this->host = $host;
		$this->port = $port;
        $this->connected = $this->connect();
    }
    
    function __destruct()
    {
        if ($this->connected) $this->disconnect();
    }
    
    function connect()
    {
   		$this->socket = @fsockopen($this->host, $this->port, $errno, $errstr, 10);
		if (!$this->socket) {
			$this->errmsg = "Socket error: $errstr ($errno)";
			return FALSE;
		}
		return TRUE;
    }
    
    function disconnect()
    {
        if (!$this->connected)
        {
            $this->errmsg = "Already disconnected";
            return FALSE;
        }
        
        $packet = new SIPacket(SIC('OP_DISCONNECT'));
        $ack = $this->request($packet);
        
        fclose($this->socket);
        $this->connected = FALSE;
        return TRUE;
    }
    
    function request($packet)
    {
        if (!$this->connected)
        {
            $this->errmsg = "Not connected";
            return FALSE;
        }
        
        fwrite($this->socket, $packet->get_raw_packet());
        fflush($this->socket);
        return new SIPacket(0, $this->socket);
    }
}

?>
