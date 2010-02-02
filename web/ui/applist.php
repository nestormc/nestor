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

class AppIcon extends UIImageElement
{
    function __construct($domserver, $id, $appname)
    {
        $this->appname = $appname;
        parent::__construct($domserver, $id, $domserver->skin->app_icon($appname));
    }
    
    function set_active($active=TRUE)
    {
        $this->set_src($this->ds->skin->app_icon($this->appname, $active));
    }
}

class AppSummaryContainer extends UIElement
{
    function __construct($domserver, $id, $appname, $element)
    {
        $this->appname = $appname;
        $this->element = $element;
        parent::__construct($domserver, $id);
    }
    
    function init()
    {
        $this->icon = new AppIcon($this->ds, "{$this->id}_icon_{$this->appname}", $this->appname);
    }
    
    function render()
    {
        $this->add_child($this->icon);
        $this->icon->set_class("app_icon");
        
        $this->add_child($this->element);
        $this->element->set_class("app_summary");
        
        if (is_callable(array($this->element, "drop_callback")))
            $this->make_drag_target($this->element, "drop_callback");
    }
}

class DomserverApplist extends UIElement
{
    public $workspace = FALSE;
    
    public function init()
    {
        $this->apps = $this->ds->get_applist();
        $this->containers = array();
        foreach ($this->apps as $appid => $element)
        {
            $this->containers[$appid] = new AppSummaryContainer($this->ds, "{$this->id}_{$appid}_ctn", $appid, $element);
        }
    }
    
    public function render() 
    {
        $first = TRUE;
        $active_app = $this->workspace->load_data("app", FALSE);
        foreach ($this->containers as $id => $ctn)
        {
            $this->add_child($ctn);
            if ($first)
            {
                $ctn->set_class("first");
                $first = FALSE;
            }
            
            $ctn->set_class("app_summary_container");
            $ctn->set_handler("onclick", $this, "set_active_app", $id);
            
            if ($id === $active_app)
            {
                $ctn->icon->set_active(TRUE);
                $ctn->set_class("active");
            }
            else 
            {
                $ctn->icon->set_active(FALSE);
                $ctn->unset_class("active");
            }
        }
    }
    
    public function set_active_app($appid)
    {
        foreach ($this->containers as $id => $ctn)
        {
            if ($id === $appid)
            {
                $ctn->icon->set_active(TRUE);
                $ctn->set_class("active");
            }
            else 
            {
                $ctn->icon->set_active(FALSE);
                $ctn->unset_class("active");
            }
        }
        
        $this->workspace->set_active_app($appid);
    }
}
?>
