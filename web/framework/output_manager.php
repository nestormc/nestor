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

$DEBUG_OPCODES = array();

class MissingElementException extends Exception {}

class OutputManager
{
    private $ops = array();
    private $debug = array();
    private $fatal = FALSE;
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
        if (is_array($val)) return $this->json_aarray($val);
        
        return "undefined";
    }
    
    /* Get JS style property name */
    private function js_cssprop($prop)
    {
        $s = explode("-", $prop);
        return $s[0] . implode("", array_map("ucfirst", array_slice($s, 1)));
    }
    
    /* Wrapper for child rendering (catching exceptions) */
    function render_child($child)
    {
        try {
            $child->render();
        } catch (ConnectionError $e) {
            $this->fatal = "Could not connect to domserver: " . $e->getMessage();
        }
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
    
    /* Add opcode */
    function add_op($opcode, $params)
    {
        global $DEBUG_OPCODES, $DEBUG_IDS;
        
        $this->ops[] = array($opcode, $params);
        if (DOMSERVER_DEBUG && (in_array($opcode, $DEBUG_OPCODES) || in_array("*", $DEBUG_OPCODES)))
        {
            $dparams = array();
            
            foreach ($params as $p)
            {
                if ($p instanceof UIElement)
                {
                    $dparams[] = "&lt;" . $this->dom_id($p) . "&gt;";
                }
                else $dparams[] = $this->json_value($p);
            }
            
            $this->debug[] = "$opcode : " . implode(", ", $dparams);
        }
    }
    
    /* Add debug message */
    function debug($element, $message)
    {
        if (DOMSERVER_DEBUG) $this->debug[] = "&lt;" . $this->dom_id($element) . "&gt; $message";
    }
    
    /* Render all pending opcodes into a JSON-wrapped JS function */
    private function render_json_opcodes()
    {
        $ops = array();
        $prev_id = "";
        
        while ($op = array_shift($this->ops))
        {
            $opcode = $op[0];
            $params = $op[1];
            
            $id = $this->dom_id($params[0]);
            if ($id != $prev_id)
            {
                if ($prev_id != "") $ops[] = "}";
                $ops[] = "if(\$(\"$id\")){";
                $prev_id = $id;
            }
            
            switch ($opcode)
            {
            case 'style':
                $prop = $this->js_cssprop($params[1]);
                $val = $this->json_value($params[2]);
                $pseudo = $params[3];
                if ($pseudo)
                    $ops[] = "\$cssrule(\"#$id:$pseudo\",\"$prop\",$val);";
                else
                {
                    $ops[] = "\$(\"$id\").style.$prop=$val;";
                }
                break;
                
            case 'content':
                $params[2] = $params[1];
                $params[1] = "innerHTML";
            case 'dom':
                $prop = $params[1];
                $val = $this->json_value($params[2]);
                $ops[] = "\$(\"$id\").$prop=$val;";
                break;
                
            case 'child':
                $child = $params[1];
                $childid = $this->dom_id($child);
                $ops[] = "var c=document.createElement(\"{$child->tagname}\");";
                $ops[] = "c.id=\"$childid\";";
                $ops[] = "\$(\"$id\").appendChild(c);";
                //$this->render_child($child);
                break;
                
            case 'unchild':
                $child = $params[1];
                $childid = $this->dom_id($child);
                $ops[] = "if(\$(\"$childid\"))\$(\"$id\").removeChild(\$(\"$childid\"));";
                break;
                
            case 'swap':
                $sibling = $params[1];
                $siblingid = $this->dom_id($sibling);
                $ops[] = "\$swap(\$(\"$id\"),\$(\"$siblingid\"));";
                break;
                
            case 'sched_update':
                $interval = $params[1];
                //$ops[] = "window.setTimeout(function(){\$update(\"$id\");},$interval);";
                $ops[] = "\$scheduler.schedule($interval, \"$id\");";
                break;
                
            case 'class':
                $class = $params[1];
                $ops[] = "\$addC(\$(\"$id\"),\"$class\");";
                break;
                
            case 'unclass':
                $class = $params[1];
                $ops[] = "\$remC(\$(\"$id\"),\"$class\");";
                break;
                
            case 'event':
                $event = $params[1];
                $tid = $this->dom_id($params[2]);
                $method = $this->json_value($params[3]);
                $arg = $this->json_value($params[4]);
                $ops[] = "\$(\"$id\").$event=function(e){\$method(\"$tid\",$method,$arg);e.stopPropagation();};";
                break;
                
            case 'jsevent':
                $event = $params[1];
                $handler = $params[2];
                $ops[] = "\$(\"$id\").$event=$handler;";
                break;
                
            case 'jscode':
                $code = $params[1];
                $code = str_replace("{id}", "\"$id\"", $code);
                $code = str_replace("{this}", "\$(\"$id\")", $code);
                $ops[] = "$code;";
                break;
                
            case 'drag_src':
                $info = $this->json_value(array("objref" => $params[1], "label" => $params[2]));
                $ops[] = "\$drag.init(\$(\"$id\"));";
                $ops[] = "\$drag_src[\"$id\"]=$info;";
                break;
                
            case 'drag_target':
                $handler = $this->dom_id($params[1]);
                $method = $this->json_value($params[2]);
                $ops[] = "\$drag_targets[\"$id\"]={handler:\"$handler\",method:$method};";
                break;
            }
        }
        
        if (count($ops)) $ops[] = "}";
        
        if ($this->fatal !== FALSE)
            $ops[] = "\$fatal(" . $this->json_value($this->fatal) . ");";
        
        if (DOMSERVER_DEBUG)
        {
            foreach ($this->debug as $d)
            {
                $ops[] = "\$debug(" . $this->json_value($d) . ");";
            }
        }
        
        return "{op:function(){" . implode("", $ops) . "}}";
    }
    
    function update_elements($ids)
    {
        foreach (explode(",", $ids) as $id)
        {
            if (DOMSERVER_DEBUG)
                $this->debug[] = "*** UPDATE &lt;$id&gt; ***";
        
            $element = $this->elements[$id];
            try {
                $element->update();
            } catch (ConnectionError $e) {
                $this->fatal = "Could not connect to domserver: " . $e->getMessage();
            }
        }
        
        return $this->render_json_opcodes();
    }
    
    function call_element_method($id, $method, $arg)
    {
        if (DOMSERVER_DEBUG)
            $this->debug[] = "*** METHOD &lt;$id&gt;.$method($arg) ***";
        
        $element = $this->elements[$id];
        if (method_exists($element, $method))
        {
            try {
                call_user_func(array($element, $method), $arg);
            } catch (ConnectionError $e) {
                $this->fatal = "Could not connect to domserver: " . $e->getMessage();
            }
            return $this->render_json_opcodes();
        }
    }
    
    function call_drop_handler($handler_id, $method, $target_id, $objref)
    {
        if (DOMSERVER_DEBUG)
            $this->debug[] = "*** DROPPED '$objref' on &lt;$target_id&gt;; calling $handler_id.$method ***";
            
        $handler = $this->elements[$handler_id];
        $target = $this->elements[$target_id];
        
        if (method_exists($handler, $method))
        {
            try {
                call_user_func(array($handler, $method), $target, $objref);
            } catch (ConnectionError $e) {
                $this->fatal = "Could not connect to domserver: " . $e->getMessage();
            }
        }
        elseif (DOMSERVER_DEBUG)
        {
            $this->debug[] = "*** DROP handler method not found ! ***";
        }
        
        return $this->render_json_opcodes();
    }
    
    private function render_htmltree($root, $elems)
    {
        if (strlen($elems[$root]["content"])) $html = $elems[$root]["content"];
        
        foreach ($elems[$root]["children"] as $id)
            $children .= $this->render_htmltree($id, $elems);
            
        if (count($elems[$root]["classes"]))
            $classes = "class=\"" . implode(" ", $elems[$root]["classes"]) . "\"";
        else $classes = "";
        
        if (preg_match("/^(\s|\n)*$/", $children))
            return $elems[$root]["obj"]->render_html($root, $elems[$root]["classes"], $html);
        else
            return $elems[$root]["obj"]->render_html($root, $elems[$root]["classes"], $this->indent("$html\n$children"));
    }
    
    function render_page($root)
    {
        if (DOMSERVER_DEBUG)
            $this->debug[] = "*** PAGE &lt;" . $this->dom_id($root) . "&gt; ***";
        
        $blank = array(
            "children" => array(),
            "content" => "",
            "classes" => array(),
            "obj" => FALSE
        );
        
        $elems = array($this->dom_id($root) => $blank);
        $elems[$this->dom_id($root)]["obj"] = $root;
        $css = array();
        $js = array();
        $drag_src = array();
        $drag_targets = array();
        
        if (DOMSERVER_DEBUG) $js[] = "\$debug_enable();";
        
        $root->render();
        while ($op = array_shift($this->ops))
        {
            $opcode = $op[0];
            $params = $op[1];
            $id = $this->dom_id($params[0]);
            
            switch ($opcode)
            {
            case 'style':  
                $pseudo = $params[3];
                if ($pseudo) $selector = "#$id:$pseudo";
                else $selector = "#$id";
                $css[$selector][] = "${params[1]}: ${params[2]};";
                break;
                
            case 'dom':
                $val = $this->json_value($params[2]);
                $js[] = "if (\$(\"$id\")) \$(\"$id\").${params[1]} = $val;";
                break;
                
            case 'content':
                $elems[$id]["children"] = array();
                $elems[$id]["content"] = $params[1];
                break;
                
            case 'child':
                $child = $params[1];
                $childid = $this->dom_id($params[1]);
                $elems[$childid] = $blank;
                $elems[$childid]["obj"] = $child;
                $elems[$id]["children"][] = $childid;
                //$this->render_child($child);
                break;
                
            case 'unchild':
                $child = $params[1];
                $childid = $this->dom_id($child);
                $js[] = "if (\$(\"$childid\")) \$(\"$id\").removeChild(\$(\"$childid\"));";
                break;
                
            case 'swap':
                $sibling = $params[1];
                $siblingid = $this->dom_id($sibling);
                $js[] = "\$swap(\$(\"$id\"), \$(\"$siblingid\"));";
                break;
                
            case 'sched_update':
                $interval = $params[1];
                // $js[] = "window.setTimeout(function(){\$update(\"$id\");}, $interval);";
                $js[] = "\$scheduler.schedule($interval, \"$id\");";
                break;
                
            case 'class':
                $class = $params[1];
                if (!in_array($class, $elems[$id]["classes"])) $elems[$id]["classes"][] = $class;
                break;
                
            case 'unclass':
                $class = $params[1];
                if (($idx = array_search($class, $elems[$id]["classes"])) !== FALSE)
                    array_splice($elems[$id]["classes"], $idx, 1);
                break;
                
            case 'event':
                $event = $params[1];
                $tid = $this->dom_id($params[2]);
                $method = $this->json_value($params[3]);
                $arg = $this->json_value($params[4]);
                $js[] = "if (\$(\"$id\")) \$(\"$id\").$event = function(e) {\$method(\"$tid\", $method, $arg); e.stopPropagation();};";
                break;
                
            case 'jsevent':
                $event = $params[1];
                $handler = $params[2];
                $js[] = "if (\$(\"$id\")) \$(\"$id\").$event = $handler;";
                break;
                
            case 'jscode':
                $code = $params[1];
                $code = str_replace("{id}", "\"$id\"", $code);
                $code = str_replace("{this}", "\$(\"$id\")", $code);
                $js[] = "$code;";
                break;
                
            case 'drag_src':
                $drag_src[$id] = array("objref" => $params[1], "label" => $params[2]);
                $js[] = "if (\$(\"$id\")) \$drag.init(\$(\"$id\"));";
                break;
                
            case 'drag_target':
                $handler = $this->dom_id($params[1]);
                $method = $params[2];
                $drag_targets[$id] = array(
                    "handler" => $handler,
                    "method" => $method
                );
                break;
            }
        }
        
        if ($this->fatal !== FALSE)
            $js[] = "\$fatal(" . $this->json_value($this->fatal) . ");";
        
        if (DOMSERVER_DEBUG)
        {
            foreach ($this->debug as $d)
            {
                $js[] = "\$debug(" . $this->json_value($d) . ");";
            }
        }
        
        /* JS block */
        $js[] = "\$drag_src = " . $this->json_value($drag_src) . ";";
        $js[] = "\$drag_targets = " . $this->json_value($drag_targets) . ";";
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
        foreach ($css as $selector => $stmts)
        {
            $css_out .= "$selector {\n" . $this->indent(implode("\n", $stmts)) . "\n}\n";
        }
        $css_out .= "</style>\n";
        $css_block = $this->indent($css_out);
        
        /* HTML block */
        $html_block = $this->indent($this->render_htmltree($this->dom_id($root), $elems));
        
        return <<<EOT
<html>
<head>
    <title>domserver</title>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    
$css_block
$js_block</head>
<body>
$html_block</body>
</html>
EOT;
    }
}

?>
