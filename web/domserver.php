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

define("DOMSERVER_DEBUG", FALSE);
set_include_path(get_include_path() . PATH_SEPARATOR . dirname(__FILE__));

require_once "framework/misc.php";
require_once "socket_interface/si.php";
require_once "socket_interface/objects.php";
require_once "framework/app.php";
require_once "framework/app_element.php";
require_once "framework/app_objlist.php";
require_once "framework/skin.php";
require_once "framework/tool.php";
require_once "framework/output_manager.php";
require_once "ui/ui.php";

class Domserver
{
    const session_expires = 604800;

    private $db = FALSE;
    private $si = FALSE;
    private $apps = array();
    private $tools = array();
    private $client_data = array();
    private $client_data_changed = array();
    
    public $config = array();
    public $obj = FALSE;
    public $output = FALSE;
    public $skin = FALSE;
    
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
        
        /* Create skin helper */
        $this->skin = new Skin($this, "default");
        
        /* Preload DB cookie data */
        $this->load_dbcookies();
        
        /* Load apps */
        $dir = opendir(dirname(__FILE__) . DIRECTORY_SEPARATOR . "apps");
        while (($f = readdir($dir)) !== FALSE)
        {
            if (preg_match("/^app_.*\.php$/", $f)) require_once "apps/$f";
        }
        closedir($dir);
        
        /* Load tools */
        $dir = opendir(dirname(__FILE__) . DIRECTORY_SEPARATOR . "tools");
        while (($f = readdir($dir)) !== FALSE)
        {
            if (preg_match("/^tool_.*\.php$/", $f)) require_once "tools/$f";
        }
        closedir($dir);
    }
    
    function __destruct()
    {
        /* Save DB cookie data */
        $this->save_dbcookies();
    }
    
    private function _add_app($clsname)
    {
        try {
            $app = new $clsname($this);
            $this->apps[$app->id] = $app;
        } catch (ConnectionError $e) {
            /* Continue for now, we'll re-catch this later */
        }
    }
    
    private function _add_tool($clsname)
    {
        $tool = new $clsname($this);
        $this->tools[$clsname] = $tool;
    }
    
    function tool_url($toolname, $arg)
    {
        return "?a=tool&t=$toolname&arg=$arg";
    }
    
    private function delete_expired_sessions()
    {
        $q = $this->db->prepare("SELECT name FROM web_sessions WHERE expires < :time");
        $q->bindValue(':time', time(), PDO::PARAM_INT);
        $q->execute();
        
        $expired = array();
        while (($s = $q->fetch(PDO::FETCH_ASSOC)) && $expired[] = $s['name']);
        $q = NULL;
        
        foreach ($expired as $sid)
        {
            $q = $this->db->prepare("DELETE FROM web_values WHERE session_name = :sid");
            $q->bindValue(':sid', $sid, PDO::PARAM_STR);
            $q->execute();
            $q = NULL;
            
            $q = $this->db->prepare("DELETE FROM web_sessions WHERE name = :sid");
            $q->bindValue(':sid', $sid, PDO::PARAM_STR);
            $q->execute();
            $q = NULL;
        }
    }
    
    private function session_exists($sid)
    {
        $q = $this->db->prepare("SELECT COUNT(*) AS c FROM web_sessions WHERE name = :name");
        $q->bindValue(':name', $sid, PDO::PARAM_STR);
        $q->execute();
        $c = $q->fetch(PDO::FETCH_ASSOC);
        return (intval($c["c"]) != 0);
    }
    
    private function get_session_id($setcookie=TRUE)
    {
        $sid = FALSE;
        $this->delete_expired_sessions();
        
        if (isset($_COOKIE["domserver:session_id"]))
        {
            $sid = $_COOKIE["domserver:session_id"];
            if (!$this->session_exists($sid)) $sid = FALSE;
        }
        
        if (!$sid)
        {
            do
            {
                $sid = sha1("domserver:" . microtime() . $_SERVER["REMOTE_ADDR"] . $_SERVER["REMOTE_PORT"]);
            }
            while ($this->session_exists($sid));
            
            $q = $this->db->prepare("INSERT INTO web_sessions(name, expires) VALUES(:name, :expires)");
            $q->bindValue(":name", $sid, PDO::PARAM_STR);
            $q->bindValue(":expires", time() + self::session_expires, PDO::PARAM_INT);
            $q->execute();
        }
        else
        {
            $q = $this->db->prepare("UPDATE web_sessions SET expires = :expires WHERE name = :name");
            $q->bindValue(":name", $sid, PDO::PARAM_STR);
            $q->bindValue(":expires", time() + self::session_expires, PDO::PARAM_INT);
            $q->execute();
        }
        
        if ($setcookie)
        {
            $_COOKIE["domserver:session_id"] = $sid;
            setcookie("domserver:session_id", $sid, time() + self::session_expires);
        }
        return $sid;
    }
    
    function save_dbcookies()
    {
        $sid = $this->get_session_id(FALSE);
        
        foreach (array_keys($this->client_data_changed) as $key)
        {
            $value = $this->client_data[$key];
            
            $exp = var_export($value, TRUE);
            $q = $this->db->prepare("INSERT OR REPLACE INTO web_values(session_name, key, value) VALUES(:name, :key, :value)");
            $q->bindValue(':name', $sid, PDO::PARAM_STR);
            $q->bindValue(':key', $key, PDO::PARAM_STR);
            $q->bindValue(':value', $exp, PDO::PARAM_STR);
            $q->execute();
            $q = NULL;
        }
    }
    
    function load_dbcookies()
    {
        $sid = $this->get_session_id();
        
        $q = $this->db->prepare("SELECT key, value FROM web_values WHERE session_name = :name");
        $q->bindValue(':name', $sid, PDO::PARAM_STR);
        $q->execute();
        
        while ($v = $q->fetch(PDO::FETCH_ASSOC))
        {
            $this->client_data[$v["key"]] = eval("return $v[value];");
        }
    }
    
    function set_client_data($key, $value)
    {
        if ($this->client_data[$key] != $value)
        {
            $this->client_data_changed[$key] = TRUE;
            $this->client_data[$key] = $value;
        }
    }
    
    function get_client_data($key, $default)
    {
        return isset($this->client_data[$key]) ? $this->client_data[$key] : $default;
    }
    
    function get_applist()
    {
        $ret = array();
        foreach ($this->apps as $id => $app)
        {
            $ret[$id] = $app->get_summary_element();
        }
        return $ret;
    }
    
    function get_app_workspace($id)
    {
        if (isset($this->apps[$id]))
        {
            return $this->apps[$id]->get_workspace_element();
        } 
        else
            return FALSE;
    }
    
    function render()
    {    
        switch ($_GET["a"])
        {
        case "update":
            $ui = new DomserverUI($this, "ui");
            echo $this->output->update_elements($_GET["eid"]);
            break;
            
        case "method":
            $ui = new DomserverUI($this, "ui");            
            echo $this->output->call_element_method($_GET["eid"], $_GET["m"], stripslashes($_GET["arg"]));
            break;
            
        case "drop":
            $ui = new DomserverUI($this, "ui");
            echo $this->output->call_drop_handler($_GET["hid"], $_GET["m"], $_GET["tid"], stripslashes($_GET["o"]));
            break;
            
        case "tool":
            $this->tools[$_GET["t"]]->work($_GET["arg"]);
            break;
            
        default:
            $ui = new DomserverUI($this, "ui");
            echo $this->output->render_page($ui);
            break;
        }
    }
}

?>
