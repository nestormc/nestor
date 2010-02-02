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

require_once "framework/element.php";

class DomserverWorkspace extends UIElement
{
    function get_app_workspace()
    {
        $app_id = $this->load_data("app", FALSE);
        if ($app_id) $this->ws = $this->ds->get_app_workspace($app_id);
        else $this->ws = FALSE;
    }
    
    function init()
    {
        $this->get_app_workspace();
    }

    function render() 
    {
        $this->display_app();
    }
    
    function display_app()
    {
        if ($this->ws)
        {
            $this->set_content("");
            $this->add_child($this->ws);
            $this->ws->set_class("app_workspace");
        }
        else
        {
            $this->set_content("no app selected");
        }
    }

    function set_active_app($app_id)
    {
        if ($app_id != $this->load_data("app", FALSE))
        {
            $this->save_data("app", $app_id);
            $this->get_app_workspace();
            $this->display_app();
        }
    }
}

?>
