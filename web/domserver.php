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

require_once "socket_interface/si.php";
require_once "socket_interface/objects.php";

class Domserver
{
    private $db = FALSE;
    private $si = FALSE;
    
    public $config = array();
    public $obj = FALSE;
    
    function __construct()
    {
        $this->_db_connect();
        $this->_load_config();
        $this->_si_connect();
        $this->_mk_obj();
    }
    
    function __destruct()
    {
        $this->si->disconnect();
    }
    
    private function _db_connect()
    {
        $this->db = new PDO("sqlite:/var/lib/domserver/domserver.db");
    }

    private function _load_config()
    {
        $q = $this->db->query("select value, key from config");
        while($r = $q->fetch(PDO::FETCH_ASSOC))
        {
        	$this->config[$r["key"]] = $r["value"];
        }
    }
    
    private function _si_connect()
    {
        $this->si = new SocketInterface(
            $this->config['domserver.ipc_host'],
            $this->config['domserver.ipc_port']
        );
    }
    
    private function _mk_obj()
    {
        $this->obj = new ObjectAccess($this->si);
    }
}

?>
