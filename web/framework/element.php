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

abstract class Element
{
    function __construct($domserver, $id)
    {
        $this->id = $id;
        $this->appid = "domserver";
        $this->ds = $domserver;
        $this->obj = $this->ds->obj;
        $this->config = $this->ds->config;
        $this->output = $this->ds->output;
        
        $this->output->register_element($this);
        $this->init();
    }
    
    /* Add child element */
    final function add_child($child)
    {
        $this->output->add_child($this, $child);
    }
    
    /* Set HTML contents
        Warning: removes all previously added children.  It should it be called
        _before_ any call to add_child if contents _and_ children are wanted.
     */
    final function set_contents($html)
    {
        $this->output->set_contents($this, $html);
    }
    
    /* Set DOM property */
    final function set_dom($property, $value)
    {
        $this->output->set_dom($this, $property, $value);
    }
    
    /* Set CSS property */
    final function set_css($property, $value)
    {
        $this->output->set_css($this, $property, $value);
    }
    
    /* Set CSS class */
    final function set_class($class)
    {
        $this->output->set_class($this, $class);
    }
    
    /* Unset CSS class */
    final function unset_class($class)
    {
        $this->output->unset_class($this, $class);
    }
    
    /* Schedule element update in $interval milliseconds.
        This should be called again in the update() method to reschedule the
        update, when autorefresh is wanted.
    */
    final function schedule_update($interval)
    {
        $this->output->schedule_update($this, $interval);
    }
    
    /* Set event handler
        $event is a DOM event (eg. "onclick")
        When the event happens, $target->$method($arg) will be called.
    */
    final function set_handler($event, $target, $method, $arg)
    {
        $this->output->set_handler($this, $event, $target, $method, $arg);
    }
    
    public function init() {}
    abstract public function render();
    public function update() {}
}

?>
