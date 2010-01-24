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
            $this->cells[$f] = array(
                new ObjectListCell($this->app, "{$this->id}_$fid", $value),
                $fs["weight"]
            );
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
}

class ObjectListBody extends AppElement
{
    public $count = 0;
    
    private $children_data = array();
    private $children = array();
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

    private function fetch($filter)
    {
        if (isset($this->s["filter"]))
        {
            $this->save_data("filter", $filter);
            $expr = FALSE;
            
            foreach ($this->s["filter"] as $field)
            {
                if ($expr)
                    $expr = _and($expr, _c($field, '==', $filter[$field]));
                else
                    $expr = _c($field, '==', $filter[$field]);
            }
            
            if (!$expr->is_expr()) $expr = _e($expr);
        }
        else
        {
            $expr = _e(FALSE);        
        }
        
        $offset = count($this->children);
        $limit = isset($this->s["limit"]) ? $this->s["limit"] : -1;
        $objs = $this->obj->match_objects($this->s["app"], $expr, $this->s["lod"], $this->s["otype"], $offset, $limit);
        
        foreach ($objs as $o)
        {
            $objref = $o->objref;
            $props = $o->props;
            $id = $props[$this->s["unique_field"]];
            
            $child = new ObjectListItem($this->app, "{$this->id}_item_$id", $props, $objref, $this->s);
            $this->add_child($child);
            if ($id == $this->selected_id) $child->set_class("selected");
            
            $this->children[$id] = $child;
            $this->children_data[$id] = $props;
            $this->children_data[$id]["__ref__"] = $objref;
            
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
        
        $this->save_data("children", $this->children_data);
        $this->count = count($this->children);
        
        /* Schedule new update until there are no more objects */
        if (isset($this->s["limit"]) && $this->s["limit"] > 0 && count($objs) == $this->s["limit"])
            $this->schedule_update(0);
        else
            $this->add_child($this->closer);
    }
    
    private function display_filtered($filter)
    {
        $this->count = 0;
        $this->children = array();
        $this->children_data = array();
        $this->set_content("");
        $this->fetch($filter);
    } 
    
    function set_filter($filter)
    {
        if (isset($this->s["filter"]))
            if ($filter != $this->load_data("filter", ""))
                $this->display_filtered($filter);
    }
    
    function item_event($arg)
    {
        list($ev, $id) = explode(" ", $arg);
        if (isset($this->s["item_events"][$ev]))
        {
            call_user_func($this->s["item_events"][$ev], $this->children[$id]);
        }
    }
    
    function set_link($id)
    {
        if (isset($this->s["link"]))
        {
            $data = array();
            foreach ($this->s["link_fields"] as $field)
                $data[$field] = $this->children_data[$id][$field];
            $this->s["link"]->set_filter($data);
        }
        
        if ($this->children[$this->selected_id])
            $this->children[$this->selected_id]->unset_class("selected");
        $this->children[$id]->set_class("selected");
        $this->selected_id = $id;
        $this->save_data("selected_id", $id);
    }

    function render() 
    {
        if (isset($this->s["drag_target"]))
        {
            $dt = $this->s["drag_target"];
            $this->make_drag_target($dt["handler"], $dt["method"]);
        }
    
        if (isset($this->s["filter"]))
        {
            $filter = $this->load_data("filter", "");
            if ($filter) $this->display_filtered($filter);
            else $this->set_content("no filter...");
        }
        else $this->display_filtered("");
        
        if (isset($this->s["refresh"]))
            $this->schedule_update($this->s["refresh"]);
    }
    
    function update()
    {
        if (isset($this->s["refresh"]))
            $this->render();
        else
            $this->fetch($this->load_data("filter", ""));
    }
}

class ObjectListTitle extends AppElement
{
    function render()
    {
        $this->set_class("list_title");
    }
}

class ObjectList extends AppElement
{
    function __construct($app, $id, $settings)
    {
        $this->s = $settings;
        parent::__construct($app, $id);
    }
    
    function init()
    {
        $this->lst = new ObjectListBody($this->app, "{$this->id}_list", $this->s);
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
    
    function reload()
    {
        $this->lst->render();
    }
}

?>
