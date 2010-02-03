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

abstract class AppElement extends UIElement
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
        $this->skin = $this->app->skin;
        
        $this->output->register_element($this);
        $this->init();
    }
}

class DivElement extends AppElement
{
    function render() {}
}


class LabelElement extends UIElement
{
    function render() {}
}

class ImageElement extends AppElement
{
    public $tagname = "img";

    function __construct($app, $id, $src)
    {
        parent::__construct($app, $id);
        $this->src = $src;
    }
    
    function render_html($id, $classes, $contents)
    {
        if (count($classes))
            $classes = " class=\"" . implode(" ", $classes) . "\"";
        else $classes = "";
        
        return "<img id=\"$id\" src=\"{$this->src}\"$classes>\n";
    }
    
    function render() {
        $this->set_dom("src", $this->src);
    }
    
    function set_src($src)
    {
        $this->src = $src;
        $this->set_dom("src", $this->src);
    }
}

class IconElement extends ImageElement
{
    function __construct($app, $id, $icon, $invert=FALSE)
    {
        $this->icon = $icon;
        $this->invert = $invert;
        parent::__construct($app, $id, $app->skin->icon("empty"));
    }
    
    function render()
    {
        parent::render();
        $icon = $this->skin->icon($this->icon, $this->invert);
        $hicon = $this->skin->icon($this->icon, !$this->invert);
        $this->set_css("background-image", "url('$icon')");
        $this->set_css("background-image", "url('$hicon')", "hover");
        $this->set_class("icon");
    }
}


class ProgressBarContent extends AppElement
{    
    function init()
    {
        $this->rendered = FALSE;
    }

    function set_percent($percent)
    {
        $this->set_css("width", sprintf("%F%%", $percent));
    }
    
    function render()
    {
        $this->rendered = TRUE;
        $this->set_content("&nbsp;");
        $this->set_class("progress_bar_content");
    }
}

class ProgressBarElement extends AppElement
{
    function init()
    {
        $this->cnt = new ProgressBarContent($this->app, "{$this->id}_C");
    }
    
    function set_percent($percent)
    {
        $this->cnt->set_percent($percent);
    }
    
    function render()
    {
        $this->set_class("progress_bar");
        $this->add_child($this->cnt);
    }
}

class ScrollContainerElement extends AppElement
{
    function init()
    {
        $this->wrap = new DivElement($this->app, "{$this->id}_W");
        $this->cnt = new DivElement($this->app, "{$this->id}_C"); 
        $this->bar = new DivElement($this->app, "{$this->id}_B"); 
    }
    
    function add_child($child, $internal=FALSE)
    {
        if ($internal) parent::add_child($child);
        else
        {
            $this->cnt->add_child($child);
            $this->refresh_scrollbar();
        }
    }
    
    function refresh_scrollbar()
    {
        $this->add_jscode("\$scroll_move({id})");
    }
    
    function remove_child($child)
    {
        $this->cnt->remove_child($child);
    }
    
    function set_content($cnt)
    {
        $this->cnt->set_content($cnt);
    }

    function render()
    {
        $this->set_class("scroll_container");
        $this->add_child($this->wrap, TRUE);
        $this->wrap->set_class("scroll_container_wrap");
        $this->wrap->add_child($this->cnt, TRUE);
        $this->wrap->set_jshandler("onscroll", "\$scroll");
        $this->cnt->set_class("scroll_container_cnt");
        $this->add_child($this->bar, TRUE);
        $this->bar->set_class("scroll_container_bar");
        
        $this->add_jscode("\$scroll_declare({id})");
    }
}

?>
