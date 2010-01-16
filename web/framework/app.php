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

abstract class App
{
    function __construct($domserver, $id, $title)
    {
        $this->id = $id;
        $this->title = $title;
        
        $this->ds = $domserver;
        $this->obj = $this->ds->obj;
        $this->config = $this->ds->config;
        $this->output = $this->ds->output;
    }
    
    abstract function get_summary_element();
    abstract function get_workspace_element();
}

?>
