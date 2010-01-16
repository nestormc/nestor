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
require_once "ui/header.php";
require_once "ui/applist.php";
require_once "ui/workspace.php";

class DomserverUI extends Element
{
    function init()
    {
        $this->header = new DomserverHeader($this->ds, "header");
        $this->applist = new DomserverApplist($this->ds, "applist");
        $this->workspace = new DomserverWorkspace($this->ds, "workspace");
        $this->applist->workspace = $this->workspace;
    }

    public function render() 
    {
        $this->add_child($this->header);
        $this->add_child($this->applist);
        $this->add_child($this->workspace);
    }
}
?>
