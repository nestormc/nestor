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

class OutputManager
{
    private $ops = array();
    private $scripts = array();
    private $cssheets = array();
    private $elements = array();

    function __construct($domserver)
    {
        $this->ds = $domserver;
        $this->config = $this->domserver->config;
        
        $this->add_js("domserver.js");
        $this->add_css("domserver.css");
    }
    
    /* Indent all non-blank lines in $code with 4 spaces */
    private function indent($code)
    {
        $in = explode("\n", $code);
        $out = array();
        
        foreach ($in as $line)
        {
            if (preg_match("/^\s*$/", $line)) $out[] = "";
            else $out[] = "    $line";
        }
        
        return implode("\n", $out);
    }
    
    /* Get DOM element ID */
    private function dom_id($element)
    {
        return "{$element->appid}_{$element->id}";
    }
    
    /* Get array JSON string */
    private function json_iarray($arr)
    {
        $defs = array();
        foreach ($arr as $v) $defs[] = $this->json_value($v);
        return "[" . implode(",", $defs) . "]";
    }
    
    /* Get associative array JSON string */
    private function json_aarray($arr)
    {
        $defs = array();
        foreach ($arr as $k => $v) $defs[] = "$k:" . $this->json_value($v);        
        return "{" . implode(",", $defs) . "}";
    }
    
    /* Get value JSON string */
    private function json_value($val)
    {    
        if (is_bool($val)) return $val ? "true" : "false";
        if (is_int($val) || is_float($val)) return "$val";
        if (is_string($val)) return '"' . str_replace('"', '\"', $val) . '"';
        if (is_array($va)) return $this->json_aarray($val);
        
        return "undefined";
    }
    
    /* Get JS style property name */
    private function js_cssprop($prop)
    {
        $s = explode("-", $prop);
        return "style.$s[0]" . implode("", array_map("ucfirst", array_slice($s, 1)));
    }
    
    /* Register element */
    function register_element($element)
    {
        $this->elements[$this->dom_id($element)] = $element;
    }
    
    /* Add JS script file */
    function add_js($script)
    {
        $this->scripts[] = $script;
    }
    
    /* Add CSS file */
    function add_css($file)
    {
        $this->cssheets[] = $file;
    }
    
    /* Add child to element */
    function add_child($element, $child)
    {
        $this->ops[] = array(
            "child",
            array($element, $child)
        );
    }
    
    /* Set element HTML contents */
    function set_contents($element, $html)
    {
        $this->ops[] = array(
            "contents",
            array($element, $html)
        );
    }
    
    /* Set element DOM property */
    function set_dom($element, $property, $value)
    {
        $this->ops[] = array(
            "dom",
            array($element, $property, $value)
        );
    }
    
    /* Set element CSS property */
    function set_css($element, $property, $value)
    {
        $this->ops[] = array(
            "style",
            array($element, $property, $value)
        );
    }
    
    /* Set element CSS class */
    function set_class($element, $class)
    {
        $this->ops[] = array(
            "class",
            array($element, $class)
        );
    }
    
    /* Unset element CSS class */
    function unset_class($element, $class)
    {
        $this->ops[] = array(
            "unclass",
            array($element, $class)
        );
    }
    
    /* Schedule element update */
    function schedule_update($element, $interval)
    {
        $this->ops[] = array(
            "sched_update",
            array($element, $interval)
        );
    }
    
    /* Set event handler */
    function set_handler($element, $event, $target, $method, $arg)
    {
        if (method_exists($target, $method))
        {
            $this->ops[] = array(
                "event",
                array($element, $event, $target, $method, $arg)
            );
        }
    }
    
    /* Render all pending opcodes into a JSON-wrapped JS function */
    private function render_json_opcodes()
    {
        $ops = array();
        
        while ($op = array_shift($this->ops))
        {
            $opcode = $op[0];
            $params = $op[1];
            
            switch ($opcode)
            {
            case 'style':
                $id = $this->dom_id($params[0]);
                $prop = $this->js_cssprop($params[1]);
                $val = $this->json_value($params[2]);
                $ops[] = "\$(\"$id\").$prop=$val;";
                break;
                
            case 'contents':
                $params[2] = $params[1];
                $params[1] = "innerHTML";
            case 'dom':
                $id = $this->dom_id($params[0]);
                $prop = $params[1];
                $val = $this->json_value($params[2]);
                $ops[] = "\$(\"$id\").$prop=$val;";
                break;
                
            case 'child':
                $id = $this->dom_id($params[0]);
                $child = $params[1];
                $childid = $this->dom_id($child);
                $ops[] = "var c=document.createElement(\"div\");";
                $ops[] = "c.id=\"$childid\";";
                $ops[] = "\$(\"$id\").appendChild(c);";
                $child->render();
                break;
                
            case 'sched_update':
                $id = $this->dom_id($params[0]);
                $interval = $params[1];
                $ops[] = "window.setTimeout(function(){\$update(\"$id\");},$interval);";
                break;
                
            case 'class':
                $id = $this->dom_id($params[0]);
                $class = $params[1];
                $ops[] = "\$addC(\$(\"$id\"), \"$class\");";
                break;
                
            case 'unclass':
                $id = $this->dom_id($params[0]);
                $class = $params[1];
                $ops[] = "\$remC(\$(\"$id\"), \"$class\");";
                break;
                
            case 'event':
                $id = $this->dom_id($params[0]);
                $event = $params[1];
                $tid = $this->dom_id($params[2]);
                $method = $this->json_value($params[3]);
                $arg = $this->json_value($params[4]);
                $ops[] = "\$(\"$id\").$event=function(){\$method(\"$tid\",$method,$arg);};";
                break;
            }
        }
        
        return "{op:function(){" . implode("", $ops) . "}}";
    }
    
    function update_element($id)
    {
        $element = $this->elements[$id];
        $element->update();
        return $this->render_json_opcodes();
    }
    
    function handle_event($id, $method, $arg)
    {
        $element = $this->elements[$id];
        if (method_exists($element, $method))
        {
            call_user_func(array($element, $method), $arg);
            return $this->render_json_opcodes();
        }
    }
    
    private function render_htmltree($root, $elems)
    {
        if (strlen($elems[$root]["contents"])) $html = $elems[$root]["contents"] . "\n";
        foreach ($elems[$root]["children"] as $id)
            $html .= $this->render_htmltree($id, $elems);
        if (count($elems[$root]["classes"]))
            $classes = "class=\"" . implode(" ", $elems[$root]["classes"]) . "\"";
        else $classes = "";
        return "<div id=\"$root\"$classes>\n" . $this->indent($html) . "</div>\n";
    }
    
    function render_page($root)
    {
        $blank = array(
            "children" => array(),
            "contents" => "",
            "classes" => array()
        );
        
        $elems = array($this->dom_id($root) => $blank);
        $css = array();
        $js = array();
        
        $root->render();
        while ($op = array_shift($this->ops))
        {
            $opcode = $op[0];
            $params = $op[1];
            
            switch ($opcode)
            {
            case 'style':  
                $id = $this->dom_id($params[0]);
                $css[$id][] = "${params[1]}: ${params[2]};";
                break;
                
            case 'dom':
                $id = $this->dom_id($params[0]);
                $val = $this->json_value($params[2]);
                $js[] = "\$(\"$id\").${params[1]} = $val;";
                break;
                
            case 'contents':
                $id = $this->dom_id($params[0]);
                $elems[$id]["children"] = array();
                $elems[$id]["contents"] = $params[1];
                break;
                
            case 'child':
                $id = $this->dom_id($params[0]);
                $child = $params[1];
                $childid = $this->dom_id($params[1]);
                $elems[$childid] = $blank;
                $elems[$id]["children"][] = $childid;
                $child->render();
                break;
                
            case 'sched_update':
                $id = $this->dom_id($params[0]);
                $interval = $params[1];
                $js[] = "window.setTimeout(function(){\$update(\"$id\");}, $interval);";
                break;
                
            case 'class':
                $id = $this->dom_id($params[0]);
                $class = $params[1];
                if (!in_array($class, $elems[$id]["classes"])) $elems[$id]["classes"][] = $class;
                break;
                
            case 'unclass':
                $id = $this->dom_id($params[0]);
                $class = $params[1];
                if (($idx = array_search($class, $elems[$id]["classes"])) !== FALSE)
                    array_splice($elems[$id]["classes"], $idx, 1);
                break;
                
            case 'event':
                $id = $this->dom_id($params[0]);
                $event = $params[1];
                $tid = $this->dom_id($params[2]);
                $method = $this->json_value($params[3]);
                $arg = $this->json_value($params[4]);
                $js[] = "\$(\"$id\").$event = function() {\$method(\"$tid\", $method, $arg);};";
                break;
            }
        }
        
        /* JS block */
        $js_out = "";
        foreach ($this->scripts as $src)
        {
            $js_out .= "<script type=\"text/javascript\" src=\"$src\"></script>\n";
        }
        $js_out .= "<script type=\"text/javascript\">\n" .
            "window.onload = function() {\n" .
            $this->indent(implode("\n", $js)) . "\n}\n</script>\n";
        $js_block = $this->indent($js_out);
            
        /* CSS block */
        $css_out = "";
        foreach ($this->cssheets as $href)
        {
            $css_out .= "<link rel=\"stylesheet\" type=\"text/css\" href=\"$href\">\n";
        }
        $css_out .= "<style type=\"text/css\">\n";
        foreach ($css as $id => $stmts)
        {
            $css_out .= "#$id {\n" . $this->indent(implode("\n", $stmts)) . "\n}\n";
        }
        $css_out .= "</style>\n";
        $css_block = $this->indent($css_out);
        
        /* HTML block */
        $html_block = $this->indent($this->render_htmltree($this->dom_id($root), $elems));
        
        return <<<EOT
<html>
<head>
    <title>domserver</title>
    
$css_block
$js_block</head>
<body>
$html_block</body>
</html>
EOT;
    }
}

?>
