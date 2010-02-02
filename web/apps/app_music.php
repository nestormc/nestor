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

require_once "apps/music/main.php";
require_once "apps/music/summary.php";

class MusicApp extends App
{
    function __construct($domserver)
    {
        parent::__construct($domserver, "music", "Music");
        $this->ui = array(
            "workspace" => new MusicUI($this, "workspace"),
            "summary" => new MusicSummary($this, "summary")
        );
        $this->output->add_js("apps/music/music.js");
    }
    
    function get_workspace_element()
    {
        return $this->ui['workspace'];
    }
    
    function get_summary_element()
    {
        return $this->ui['summary'];
    }
}

$this->_add_app('MusicApp');

?>
