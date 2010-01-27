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
        
        $this->output->register_element($this);
        $this->init();
    }
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
    
    function render() {}
    
    function set_src($src)
    {
        $this->src = $src;
        $this->set_dom("src", $this->src);
    }
}

class ProgressBarContentElement extends AppElement
{    
    function init()
    {
        $this->percent = FALSE;
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
        $this->cnt = new ProgressBarContentElement($this->app, "{$this->id}_content");
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

?>
