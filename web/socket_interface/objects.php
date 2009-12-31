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

require_once "socket_interface/si_codes.php";
require_once "socket_interface/si.php";

class __Criterion
{
    function __construct($prop, $oper, $val)
    {
        $this->prop = $prop;
        $this->oper = $oper;
        $this->val = $val;
    }
        
    function to_sitag()
    {
        $tag = new SIStringTag($this->oper, SIC('TAG_OBJ_CRITERION'));
        
        if (is_numeric($this->val))
            $vtag = new SIUInt32Tag($this->val, SIC('TAG_OBJ_CRIT_VALUE'));
        else
            $vtag= new SIStringTag($this->val, SIC('TAG_OBJ_CRIT_VALUE'));
            
        $tag->subtags = array(
            new SIStringTag($this->prop, SIC('TAG_OBJ_CRIT_PROPERTY')),
            $vtag
        );
        return $tag;
    }
}
        
        
class __Expression
{
    function __construct($oper, $crit_a, $crit_b = FALSE)
    {
        $this->oper = $oper;
        $this->crit_a = $crit_a;
        $this->crit_b = $crit_b;
    }
            
    function to_sitag()
    {
        $tag = new SIStringTag($this->oper, SIC('TAG_OBJ_EXPRESSION'));
        if ($this->crit_a !== FALSE)
        {
            $tag->subtags[] = $this->crit_a->to_sitag();
            if ($this->crit_b !== FALSE)
                $tag->subtags[] = $this->crit_b->to_sitag();
        }
        return $tag;
    }
}

/* The following 4 functions are shortcuts to buid expressions:
    _c builds a single criterion
    _and builds a 'and' expression from two criteria/expressions
    _or builds a 'or' expression from two criteria/expressions
    _e builds an expression from a single criterion (it is also possible to use
        an expression, but this is completely useless...)

Some examples :
    _and(_c("artist", "=", "Incubus"), _or(_c("year", "<", "1998"), _c("year", ">", "2002")))
    _e(_c("progress", ">=", "50"))
*/

function _c($prop, $oper, $val)
{
    return new __Criterion($prop, $oper, $val);
}

function _e($a, $b = FALSE)
{
    return new __Expression('', $a, $b);
}

function _and($a, $b)
{
    return new __Expression('and', $a, $b);
}

function _or($a, $b)
{
    return new __Expression('or', $a, $b);
}

class ObjectAccess
{
    private $si = FALSE;
    
    function __construct($si)
    {
        $this->si = $si;
    }

    private function parse_obj_properties($subtags)
    {
        $props = array();
        if (is_array($subtags))
        {
            foreach ($subtags as $st)
            {
                if ($st->name == SIC('TAG_OBJ_PROPERTY'))
                {
                    if ($sst = $st->get_subtag(SIC('TAG_OBJ_VALUE')))
                    {
                        $props[$st->value] = $sst->value;
                    }
                    elseif ($sst = $st->get_subtag(SIC('TAG_OBJ_ARRAY')))
                    {
                        $props[$st->value] = $this->parse_obj_properties($sst->subtags);
                    }
                }
                
                if ($st->name == SIC('TAG_OBJ_TYPE'))
                {
                    $props['__types__'] = str_replace(',', ', ', $st->value);
                }
            }
        }
        return $props;
    }

    private function get_failure($packet)
    {
        if ($packet && $packet->opcode = SIC('OP_FAILURE'))
        {
            if ($rt = $packet->get_tag(SIC('TAG_FAILURE_REASON')))
            {
                return $rt->value;
            }
        }
        
        return FALSE;
    }

    function get_object($objref, $detail_level = 0)
    {
        $ret = FALSE;
        $req = new SIPacket(SIC('OP_OBJECTS'));
        $tag = new SIStringTag($objref, SIC('TAG_OBJ_REFERENCE'));
        $tag->subtags[] = new SIUInt8Tag($detail_level, SIC('TAG_OBJ_DETAIL_LEVEL'));
        $req->tags[] = $tag;
        $resp = $this->si->request($req);
        if ($resp && $resp->opcode == SIC('OP_OBJECTS'))
        {
            $tag = $resp->get_tag(SIC('TAG_OBJ_REFERENCE'));
            $ret = $this->parse_obj_properties($tag->subtags);
        }
        if ($r = $this->get_failure($resp)) die("QUERY FAILED: &lt;$r&gt;");
        return $ret;
    }

    function match_objects($app, $expr, $detail_level = 0, $types = FALSE)
    {
        $ret = array();
        $req = new SIPacket(SIC('OP_OBJECTS'));
        $tag = new SIStringTag($app, SIC('TAG_OBJ_MATCHQUERY'));
        if ($types) $tag->subtags[] = new SIStringTag($types, SIC('TAG_OBJ_TYPE'));
        $tag->subtags[] = new SIUInt8Tag($detail_level, SIC('TAG_OBJ_DETAIL_LEVEL'));
        $tag->subtags[] = $expr->to_sitag();
        $req->tags[] = $tag;
        $resp = $this->si->request($req);
        if ($resp && $resp->opcode == SIC('OP_OBJECTS'))
        {
            foreach ($resp->tags as $t)
            {
                if ($t->name == SIC('TAG_OBJ_REFERENCE'))
                {
                    $ret[$t->value] = $this->parse_obj_properties($t->subtags);
                }
            }
        }
        if ($r = $this->get_failure($resp)) die("QUERY FAILED: &lt;$r&gt;");
        return $ret;
    }

    function get_actions($app, $objref = FALSE)
    {
        $ret = array();
        $req = new SIPacket(SIC('OP_OBJECTS'));
        $tag = new SIStringTag($app, SIC('TAG_ACTION_QUERY'));
        if ($objref) $tag->subtags[] = new SIStringTag($objref, SIC('TAG_OBJ_REFERENCE'));
        $req->tags[] = $tag;
        $resp = $this->si->request($req);
        if ($resp && $resp->opcode == SIC('OP_OBJECTS'))
        {
            foreach ($resp->tags as $t)
            {
                if ($t->name == SIC('TAG_ACTION_ID'))
                {
                    $params = array();
                    foreach ($t->subtags as $st)
                    {
                        if ($st->name == SIC('TAG_ACTION_PARAM'))
                        {
                            $stf = $st->get_subtag(SIC('TAG_ACTION_PARAM_FLAGS'));
                            $stv = $st->get_subtag(SIC('TAG_ACTION_PARAM_VALUE'));
                            
                            $params[$st->value] = array(
                                "flags" => $stf ? $stf->value : 0,
                                "value" => $stv ? $stv->value : '' 
                            );
                        }
                    }
                    $ret[$t->value] = $params;
                }
            }
        }
        if ($r = $this->get_failure($resp)) die("QUERY FAILED: &lt;$r&gt;");
        return $ret;
    }

    function do_action($app, $action, $objref = FALSE, $params = FALSE)
    {
        $ret = FALSE;
        $req = new SIPacket(SIC('OP_OBJECTS'));
        $tag = new SIStringTag($app, SIC('TAG_ACTION_EXECUTE'));
        if ($objref) $tag->subtags[] = new SIStringTag($objref, SIC('TAG_OBJ_REFERENCE'));
        $actiontag = new SIStringTag($action, SIC('TAG_ACTION_ID'));
        if ($params)
        {
            foreach ($params as $p => $v)
            {
                switch($v["type"])
                {
                    case "str":
                    case "obj":
                        $vtag = new SIStringTag($v["value"], SIC('TAG_ACTION_PARAM_VALUE'));
                        break;
                    case "num":
                        $vtag = new SIUInt32Tag($v["value"], SIC('TAG_ACTION_PARAM_VALUE'));
                        break;
                    case "bool":
                        $vtag = new SIUInt8Tag($v["value"], SIC('TAG_ACTION_PARAM_VALUE'));
                        break;
                }
                $ptag = new SIStringTag($p, SIC('TAG_ACTION_PARAM'));
                $ptag->subtags[] = $vtag;
                $actiontag->subtags[] = $ptag;
            }
        }
        $tag->subtags[] = $actiontag;
        
        $req->tags[] = $tag;
        $resp = $this->si->request($req);        
        
        if ($resp && $resp->opcode == SIC('OP_SUCCESS')) $ret = TRUE;
        elseif ($resp && $resp->opcode == SIC('OP_PROCESSING'))
        {        
            foreach ($resp->tags as $t)
            {
                if ($t->name == SIC('TAG_ACTION_PROGRESS')) $ret = "progressid: " . $t->value;
            }
        }
        if ($r = $this->get_failure($resp)) die("QUERY FAILED: &lt;$r&gt;");
        
        return $ret;
    }
}

?>
