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

abstract class AppElement extends Element
{
    function __construct($app, $id)
    {
        $this->id = $id;
        $this->app = $app;
        $this->appid = $this->app->id;
        $this->ds = $this->app->ds;
        $this->obj = $this->app->obj;
        $this->config = $this->app->config;
        $this->output = $this->app->output;
        
        $this->output->register_element($this);
    }
}

?>
