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

class ObjectListCell extends AppElement
{
    function __construct($app, $id, $label)
    {
        $this->label = $label;
        parent::__construct($app, $id);
    }
    
    function render()
    {
        $this->set_content(htmlspecialchars($this->label));
        $this->set_css("text-overflow", "ellipsis");
    }
}

class ObjectListHeader extends AppElement
{
    function __construct($app, $id, $settings)
    {
        $this->s = $settings;
        parent::__construct($app, $id);
    }
    
    function init()
    {
        $this->cells = array();
        
        foreach ($this->s["fields"] as $f => $fs)
        {
            $fid = str_replace("-", "_", $f);
            $this->cells[$f] = array(
                new ObjectListCell($this->app, "{$this->id}_$fid", $fs["title"]),
                $fs["weight"]
            );
        }
    }

    function render()
    {
        foreach ($this->cells as $f => $c)
        {
            $this->add_child($c[0]);
            $c[0]->set_class("list_header");
        }
            
        $this->set_css("position", "relative");
        $this->set_css("height", "1.2em");
        $this->column_layout($this->cells, "hidden");
    }
}

class ObjectListCloser extends AppElement
{
    function render()
    {
    }
}

class ObjectListItem extends AppElement
{
    function __construct($app, $id, $data, $objref, $settings)
    {
        $this->data = $data;
        $this->objref = $objref;
        $this->s = $settings;
        parent::__construct($app, $id);
    }
    
    function init()
    {
        $this->cells = array();
        
        foreach ($this->s["fields"] as $f => $fs)
        {
            $value = $this->data[$f];
            if (isset($fs["xform"]))
                $value = call_user_func($fs["xform"], $value);
        
            if ($this->s["main_field"] == $f)
                $this->label = $value;
                
            $fid = str_replace("-", "_", $f);
            
            switch ($fs["display"])
            {
            case "progress":
                $cell = new ProgressBarElement($this->app, "{$this->id}_$fid");
                break;
            default:
                $cell = new ObjectListCell($this->app, "{$this->id}_$fid", $value);
                break;
            }
            $this->cells[$f] = array($cell, $fs["weight"]);
        }
    }

    function render()
    {
        foreach ($this->cells as $f => $c)
        {
            $this->add_child($c[0]);
            
            $fs = $this->s["fields"][$f];
            if (isset($fs["style"]))
            {
                foreach ($fs["style"] as $prop => $val)
                    $c[0]->set_css($prop, $val);
            }
            
            switch ($fs["display"])
            {
            case "progress":
                $c[0]->set_percent(floatval($this->data[$f]));
                break;
            }
        }
            
        $this->set_css("position", "relative");
        $this->set_css("height", "1.2em");
        
        $this->column_layout($this->cells, "hidden");        
        
        if ($this->objref)
            $this->make_draggable($this->objref, $this->data[$this->s["main_field"]]);
            
        if (isset($this->s["item_drag_target"]))
        {
            $dt = $this->s["item_drag_target"];
            $this->make_drag_target($dt["handler"], $dt["method"]);
        }
    }
    
    private function set_cell_value($field, $value)
    {    
        $fs = $this->s["fields"][$field];
        if (isset($fs["xform"]))
            $value = call_user_func($fs["xform"], $value);
    
        if ($this->s["main_field"] == $field)
            $this->label = $value;
        
        switch ($fs["display"])
        {
        case "progress":
            $this->cells[$field][0]->set_percent(floatval($value));
            break;
        default:
            $this->cells[$field][0]->set_content($value);
            break;
        }
    }
    
    function update_data($updated)
    {
        foreach (array_keys($this->cells) as $f)
        {
            if (isset($updated[$f]))
            {
                $this->set_cell_value($f, $updated[$f]);
            }
        }
    }
}

class RefreshObjectListBody extends ObjectListBody
{
    protected function fetch($expr)
    {
        $objs = $this->obj->match_objects($this->s["app"], $expr, $this->s["lod"], $this->s["otype"]);
        
        $removed_ids = array_keys($this->children);
        $positions = array();
        foreach ($objs as $o)
        {
            $objref = $o->objref;
            $props = $o->props;
            $props["__ref__"] = $objref;
            $id = $props[$this->s["unique_field"]];
            $positions[] = $id;
            
            if (isset($this->children[$id]))
            {
                /* Existing item : update properties */
                $oldprops = $this->children_data[$id];
                $newprops = array();
                foreach ($props as $p => $v)
                    if ($p != "__ref__" && $v != $oldprops[$p]) $newprops[$p] = $v;
                $this->children[$id]->update_data($newprops);
                
                unset($removed_ids[array_search($id, $removed_ids)]);
            }
            else
            {
                /* New item : create new child */
                $child = new ObjectListItem($this->app, "{$this->id}_item_$id", $props, $objref, $this->s);
                $this->add_item($child, $id, $props);
            }
        }
        
        /* Removed items */
        foreach ($removed_ids as $id)
        {
            $this->remove_item($id);
        }
        
        /* Get current item positions */
        $cur_positions = array();
        foreach (array_keys($this->children) as $id) $cur_positions[$id] = count($cur_positions);
        
        /* Move to new positions */
        foreach ($positions as $pos => $id)
        {
            if ($cur_positions[$id] > $pos)
            {
                $oldpos = $cur_positions[$id];
                
                $swapid = array_search($pos, $cur_positions);
                $this->children[$id]->swap_with($this->children[$swapid]);
                
                $cur_positions[$id] = $pos;
                $cur_positions[$swapid] = $oldpos;
            }
        }
        
        $this->schedule_update($this->s["refresh"]);
    }
}

class FixedObjectListBody extends ObjectListBody
{
    protected function fetch($expr)
    {
        $offset = $this->count;
        $limit = isset($this->s["limit"]) ? $this->s["limit"] : -1;
        $objs = $this->obj->match_objects($this->s["app"], $expr, $this->s["lod"], $this->s["otype"], $offset, $limit);
        
        foreach ($objs as $o)
        {
            $objref = $o->objref;
            $props = $o->props;
            $props["__ref__"] = $objref;
            $id = $props[$this->s["unique_field"]];
            
            $child = new ObjectListItem($this->app, "{$this->id}_item_$id", $props, $objref, $this->s);
            $this->add_item($child, $id, $props);
        }
        
        /* Schedule new update until there are no more objects */
        if (isset($this->s["limit"]) && $this->s["limit"] > 0 && count($objs) == $this->s["limit"])
            $this->schedule_update(0);
    }
}

abstract class ObjectListBody extends AppElement
{
    public $count = 0;
    
    protected $children_data = array();
    protected $children = array();
    private $selected_id = -1;
    
    function __construct($app, $id, $settings)
    {
        $this->s = $settings;
        parent::__construct($app, $id);
    }
    
    function init()
    {
        /* Load previously created children */
        $this->children_data = $this->load_data("children", array());
        foreach ($this->children_data as $id => $data)
        {
            $this->children[$id] = new ObjectListItem($this->app, "{$this->id}_item_$id", $data, $data["__ref__"], $this->s);
        }
        
        $this->selected_id = intval($this->load_data("selected_id", -1));
        $this->count = count($this->children);
        
        $this->closer = new ObjectListCloser($this->app, "{$this->id}_closer");
    }
    
    function item_event($arg)
    {
        list($ev, $id) = explode(" ", $arg);
        if (isset($this->s["item_events"][$ev]))
        {
            call_user_func($this->s["item_events"][$ev], $this->children[$id]);
        }
    }
    
    function render()
    {
        $this->count = 0;
        $this->children = array();
        $this->children_data = array();
        
        $this->set_content("");
        $this->add_child($this->closer);
        $this->update();
        
        if (isset($this->s["drag_target"]))
        {
            $dt = $this->s["drag_target"];
            $this->make_drag_target($dt["handler"], $dt["method"]);
        }
    }
    
    function update()
    {
        $expr = $this->get_filter_expr();
        
        if ($expr) $this->fetch($expr);
        else $this->set_content("no filter...");
        
        $this->save_data("children", $this->children_data);
        
        /* Move closer to the bottom */
        $this->remove_child($this->closer);
        $this->add_child($this->closer);
    }
    
    /* Fetch objects, must call $this->add_item($child_element, $item_id) to add items */
    abstract protected function fetch($expr);
    
    function set_filter($filter)
    {
        if (isset($this->s["filter"]) && $filter != $this->load_data("filter", FALSE))
        {
            $this->save_data("filter", $filter);
            $this->render();
        }
    }
    
    function set_link($id)
    {
        if (isset($this->s["link"]))
        {
            $data = array();
            $this->debug("cdata[$id]: " . str_replace("\n", " ", var_export($this->children_data, TRUE)));
            foreach ($this->s["link_fields"] as $field)
                $data[$field] = $this->children_data[$id][$field];
            $this->debug("link: " . str_replace("\n", " ", var_export($data, TRUE)));
            $this->s["link"]->set_filter($data);
        }
        
        if ($this->children[$this->selected_id])
            $this->children[$this->selected_id]->unset_class("selected");
        $this->children[$id]->set_class("selected");
        $this->selected_id = $id;
        $this->save_data("selected_id", $id);
    }
    
    private function get_filter_expr()
    {
        if (isset($this->s["filter"]))
        {
            $filter = $this->load_data("filter", FALSE);
            if (!$filter) return FALSE;
            
            $this->debug("filter: " . str_replace("\n", " ", var_export($filter, TRUE)));
            
            $expr = FALSE;
            foreach ($this->s["filter"] as $field)
            {
                if ($expr) $expr = _and($expr, _c($field, '==', $filter[$field]));
                else $expr = _c($field, '==', $filter[$field]);
            }
            
            return $expr->is_expr() ? $expr : _e($expr);
        }
        
        return _e(FALSE);
    }
    
    protected function add_item($child, $id, $data)
    {
        $this->children[$id] = $child;
        $this->children_data[$id] = $data;
        $this->count++;
        
        $this->add_child($child);
        
        if ($id == $this->selected_id) $child->set_class("selected");
        
        if (isset($this->s["link"]))
        {
            $child->set_handler("onclick", $this, "set_link", $id);
        }
        
        if (isset($this->s["item_events"]))
        {
            foreach ($this->s["item_events"] as $ev => $callback)
            {
                $child->set_handler($ev, $this, "item_event", "$ev $id");
            }
        }
    }
    
    protected function remove_item($id)
    {
        if (isset($this->children[$id]))
        {
            $this->remove_child($this->children[$id]);
            
            unset($this->children[$id]);
            unset($this->children_data[$id]);
            $this->count--;
        }
    }
}

class ObjectListTitle extends AppElement
{
    function render()
    {
        $this->set_class("list_title");
    }
}

/* Auto-refreshed ObjectList element.
    Can be used for lists with objects that change often. When the list is created, all objects
    are fetched, but updates are then incremental. The "refresh" $settings key specifies the
    refresh rate in milliseconds.
*/
class RefreshObjectList extends ObjectList
{
    function get_list_body()
    {
        return new RefreshObjectListBody($this->app, "{$this->id}_list", $this->s);
    }
}

/* Fixed ObjectList element
    Can be used for lists of objects that don't change very often. Adds an optional "limit" key
    to $settings: when specified, objects will be fetched in several chunks of size "limit",
    which prevents huge loading times for lists with a lot of objects. A nice limit value is 50.
    
    Also implements an additional reload() method to reload the entire list.
*/
class FixedObjectList extends ObjectList
{
    function get_list_body()
    {
        return new FixedObjectListBody($this->app, "{$this->id}_list", $this->s);
    }
    
    function reload()
    {
        $this->lst->render();
    }
}

/* ObjectList element
    Generic object list element with many features :
    - multi-column display with optional column title and CSS
    - DOM events on objects
    - draggable objects
    - links between lists (i.e. what B displays depends on what is selected in A)
    - objects and the list itself can be made drop targets
    
    The constructor $settings parameter is an array with the following keys (keys marked with *
    are optional):
    
      "title" => displayed list title
      "app"   => source app for objects
      "otype" => type of objects to display
      "lod"   => LOD to fetch objects with
      
      "fields" => array(
          "fieldname" => array(
              "title"  => displayed field title (1)
              "weight" => field column weight
    *         "xform"  => callback to transform the field value before displaying
    *         "style" => array(
                  "style-property" => "style-value"
                  ...
              )
          ...
          )
      )
        
      "unique_field" => name of a field used to identify each object (should be a valid DOM id)
      "main_field" => name of a field used to describe objects when dragging
      
    * "item_events" => array(
          "oneventname" => callback (will be passed the AppElement on which the event happened)
          ...
      )
      
    * "filter" => array("fieldname", ...) fields used for filtering
      
    * "link" => linked ObjectList
    * "link-fields" => array("fieldname", ...) fields passed to linked ObjectList (2)
    
    * "item_drag_handler" => callback called when an object is dropped on an item; will be passed
                             the item AppElement and the dropped object objref
    * "drag_handler" => same as "item_drag_handler", except it is called when an object is dropped
                        on the list itself, and the ObjectList element is passed as first argument
    
    (1) field titles will only be displayed if the "main_field" has a "title" attribute
    (2) "link-fields" is mandatory when "link" is specified; the specified fields values are
        matched against the linked ObjectList "filter" fields, in the same order
*/
abstract class ObjectList extends AppElement
{
    function __construct($app, $id, $settings)
    {
        $this->s = $settings;
        parent::__construct($app, $id);
    }
    
    abstract function get_list_body();
    
    function init()
    {
        $this->lst = $this->get_list_body();
        $this->title = new ObjectListTitle($this->app, "{$this->id}_title");
        
        if (isset($this->s["fields"][$this->s["main_field"]]["title"]))
            $this->header = new ObjectListHeader($this->app, "{$this->id}_header", $this->s);
        else $this->header = FALSE;
    }
    
    function set_filter($filter)
    {
        $this->lst->set_filter($filter);
    }
    
    function render()
    {
        $hheight = "2em";
        $this->add_child($this->title);
        $this->title->set_css("height", "2em");
        $this->title->set_content($this->s["title"]);
        
        if ($this->header)
        {
            $hheight = "3.2em";
            $this->add_child($this->header);
        }
        
        $this->add_child($this->lst);
        $this->lst->set_css("position", "absolute");
        $this->lst->set_css("overflow", "auto");
        $this->lst->set_css("top", $hheight);
        $this->lst->set_css("bottom", 0);
        $this->lst->set_css("left", 0);
        $this->lst->set_css("right", 0);
    }
}

?>
