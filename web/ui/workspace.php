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
    function render() 
    {
        $app_id = $this->load_data("app", FALSE);
        if ($app_id) $this->display_app($app_id);
        else $this->set_content("No app selected");
    }
    
    function display_app($app_id)
    {
        $this->save_data("app", $app_id);
        $this->set_content("");
        
        $ws = $this->ds->get_app_workspace($app_id);
        $this->add_child($ws);
        $ws->set_class("app_workspace");
    }

    function set_active_app($app_id)
    {
        if ($app_id != $this->load_data("app", FALSE)) $this->display_app($app_id);
    }
}

?>
