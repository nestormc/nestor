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

set_include_path(get_include_path() . PATH_SEPARATOR . dirname(__FILE__));
require_once "socket_interface/si.php";
require_once "socket_interface/objects.php";
require_once "framework/app.php";
require_once "framework/app_element.php";
require_once "framework/output_manager.php";
require_once "ui/ui.php";

class Domserver
{
    private $db = FALSE;
    private $si = FALSE;
    private $apps = array();
    
    public $config = array();
    public $obj = FALSE;
    public $output = FALSE;
    
    function __construct()
    {
        /* Connect to database */
        $this->db = new PDO("sqlite:/var/lib/domserver/domserver.db");
        
        /* Load configuration */
        $q = $this->db->query("select value, key from config");
        while($r = $q->fetch(PDO::FETCH_ASSOC))
        {
        	$this->config[$r["key"]] = $r["value"];
        }
        
        /* Connect to socket interface */
        $this->si = new SocketInterface(
            $this->config['domserver.ipc_host'],
            $this->config['domserver.ipc_port']
        );
        
        /* Create object accessor */
        $this->obj = new ObjectAccess($this->si);
        
        /* Create output manager */
        $this->output = new OutputManager($this);
        
        /* Load apps */
        $dir = opendir(dirname(__FILE__) . DIRECTORY_SEPARATOR . "apps");
        while (($f = readdir($dir)) !== FALSE)
        {
            if (preg_match("/^app_.*\.php$/", $f)) require_once "apps/$f";
        }
        closedir($dir);
    }
    
    private function _add_app($clsname)
    {
        $app = new $clsname($this);
        $this->apps[$app->id] = $app;
    }
    
    function get_applist()
    {
        $ret = array();
        foreach ($this->apps as $id => $app)
            $ret[$id] = $app->get_summary_element();
        return $ret;
    }
    
    function get_app_workspace($id)
    {
        return $this->apps[$id]->get_workspace_element();
    }
    
    function render()
    {
        $ui = new DomserverUI($this, "ui");
            
        switch ($_GET["a"])
        {
        case "update":
            echo $this->output->update_element($_GET["eid"]);
            break;
            
        case "event":
            echo $this->output->handle_event($_GET["eid"], $_GET["m"], $_GET["arg"]);
            break;
            
        default:
            echo $this->output->render_page($ui);
            break;
        }
    }
}

?>
