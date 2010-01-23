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

abstract class UIElement
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
    
    /* Render element HTML tags */
    function render_html($id, $classes, $content)
    {
        if (count($classes))
            $classes = " class=\"" . implode(" ", $classes) . "\"";
        else $classes = "";
        
        return "<div id=\"$id\"$classes>$content</div>\n";
    }
    
    /* Add child element */
    final function add_child($child)
    {
        $this->output->add_op("child", array($this, $child));
    }
    
    /* Set HTML content
        Warning: removes all previously added children.  It should it be called
        _before_ any call to add_child if content _and_ children are wanted.
     */
    final function set_content($html)
    {
        $this->output->add_op("content", array($this, $html));
    }
    
    /* Set DOM property */
    final function set_dom($property, $value)
    {
        $this->output->add_op("dom", array($this, $property, $value));
    }
    
    /* Set CSS property */
    final function set_css($property, $value)
    {
        $this->output->add_op("style", array($this, $property, $value));
    }
    
    /* Set CSS class */
    final function set_class($class)
    {
        $this->output->add_op("class", array($this, $class));
    }
    
    /* Unset CSS class */
    final function unset_class($class)
    {
        $this->output->add_op("unclass", array($this, $class));
    }
    
    /* Schedule element update in $interval milliseconds.
        This should be called again in the update() method to reschedule the
        update, when autorefresh is wanted.
    */
    final function schedule_update($interval)
    {
        $this->output->add_op("sched_update", array($this, $interval));
    }
    
    /* Set event handler
        $event is a DOM event (eg. "onclick")
        When the event happens, $target->$method($arg) will be called.
    */
    final function set_handler($event, $target, $method, $arg)
    {
        $this->output->add_op("event", array($this, $event, $target, $method, $arg));
    }
    
    /* Make element draggable */
    final function make_draggable($objref, $label)
    {
        $this->set_css("position", "relative");
        $this->output->add_op("drag_src", array($this, $objref, $label));
    }
    
    /* Make element drag target */
    final function make_drag_target($action_app)
    {
        $this->output->add_op("drag_target", array($this, $action_app));
    }
    
    private function block_layout($blocks, $columns = TRUE)
    {
        $total = 0.0;
        foreach ($blocks as $b) $total += $b[1];
        
        $remaining = 100.0;
        $cnt = count($blocks);
        foreach ($blocks as $b)
        {
            list($element, $weight) = $b;
            $cnt--;
            
            $element->set_css("position", "absolute");
            $element->set_css("overflow", "auto");
            $element->set_css($columns ? "top" : "left", 0);
            $element->set_css($columns ? "bottom" : "right", 0);
            
            $used = 100.0 - $remaining;
            $element->set_css($columns ? "left" : "top", "$used%");
            
            if ($cnt == 0)
            {
                $remaining = 0;
            }
            else
            {
                $size = 100.0 * $weight / $total;
                $remaining -= $size;
            }
            $element->set_css($columns ? "right" : "bottom", "$remaining%");
        }
    }
    
    /* Generate CSS for a flexible column layout
    
        $columns is an array of column-specs, each of the form:
            array($element, $weight)
            
        Columns will take full height/width of parent element, with relative
        widths computed using column weights (eg. if a column has twice the
        weight of an other, it will be twice as much wide).
    */
    final function column_layout($columns)
    {
        $this->block_layout($columns, TRUE);
    }
    
    /* Generate CSS for a flexible row layout
        Works exactly like column_layout(), but horizontally.
    */
    final function row_layout($rows)
    {
        $this->block_layout($rows, FALSE);
    }
    
    final function save_data($key, $value)
    {
        $this->ds->save_client_data("{$this->appid}/{$this->id}/$key", $value);
    }
    
    final function load_data($key, $default)
    {
        return $this->ds->load_client_data("{$this->appid}/{$this->id}/$key", $default);
    }
    
    function init() {}
    abstract function render();
    function update() {}
}

class UIImageElement extends UIElement
{
    function __construct($domserver, $id, $src)
    {
        parent::__construct($domserver, $id);
        $this->src = $src;
    }
    
    function render_html($id, $classes, $content)
    {
        if (count($classes))
            $classes = " class=\"" . implode(" ", $classes) . "\"";
        else $classes = "";
        
        return "<img id=\"$id\" src=\"{$this->src}\"$classes>\n";
    }
    
    function render() {}
}

?>
