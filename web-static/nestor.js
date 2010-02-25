/*
This file is part of nestor.

nestor is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

nestor is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with nestor.  If not, see <http://www.gnu.org/licenses/>.
*/



/********************************************************************
 *                          DOM UTILITIES                           *
 ********************************************************************/

/* getElementById on an other document */
function $$(doc, id) {
	if (!doc) return undefined;
	if (doc.getElementById) return doc.getElementById(id);
	else if (doc.all) return doc.all[id];
	else if (doc.layers) return doc.layers[id];
	else return undefined;
}

/* getElementById */
function $(id) {
	return $$(document, id);
}

/* Returns true if DOM object obj has CSS class c */
function $hasC(obj, c)
{
	var classes = obj.className.split(" ");
	return classes.indexOf(c) != -1 ? true : false;
}

/* Adds CSS class c to DOM object obj */
function $addC(obj, c)
{
	if (!obj) return;

	if ($hasC(obj, c)) return;
	var classes = obj.className.split(" ");
	classes.push(c);
	obj.className = classes.join(" ");
}

/* Removes CSS class c from DOM object obj */
function $remC(obj, c)
{
	if (!obj) return;
	if (!$hasC(obj, c)) return;

	var classes = obj.className.split(" ");
	classes.splice(classes.indexOf(c), 1);
	obj.className = classes.join(" ");
}

/* Swap elements a and b in their parent node */
function $swap(a, b)
{
    if (!a || !b) return;
    
    var parent = a.parentNode;
    if (parent != b.parentNode) return;
    
    var next = b.nextSibling;
    
    if (next == a)
    {
        parent.removeChild(a);
        parent.insertBefore(a, b);
    }
    else
    {
        parent.removeChild(b);
        parent.insertBefore(b, a)
        parent.removeChild(a);
        
        if (next) parent.insertBefore(a, next);
        else parent.appendChild(a);
    }
}

/* Get element absolute position */
function $abspos(o)
{
    var top = 0;
    var left = 0;
    
    while (o && o.offsetParent)
    {
        top += o.offsetTop - o.scrollTop;
        left += o.offsetLeft - o.scrollLeft;
        o = o.offsetParent;
    }
    
    return [left, top]
}

/* Set a stylesheet rule
    Updates rule if existing, creates a new rule otherwise.
 */
function $cssrule(selector, prop, value)
{
    var rule = undefined;
    var numss = document.styleSheets.length;
    for (var i=0; i<numss; i++)
    {
        var sheet = document.styleSheets[i];
        for (var j=0; j<sheet.cssRules.length; j++)
        {
            var r = sheet.cssRules[j];
            if (r.selectorText == selector)
            {
                rule = r;
                break;
            }
        }
        if (rule) break;
    }
    
    if (rule) rule.style[prop] = value;
    else document.styleSheets[numss-1].addRule(selector, prop + ":" + value + ";");
}

/********************************************************************
 *                           AJAX QUEUES                            *
 ********************************************************************/

/* XMLHttpRequest creation */
function $ajax_xhr() {
	if (window.XMLHttpRequest)
		return new XMLHttpRequest();
	else if (window.ActiveXObject)
		try {
			return new ActiveXObject("Msxml2.XMLHTTP");
		}
		catch (e) {
			try {
				return new ActiveXObject("Microsoft.XMLHTTP");
			}
			catch (e) {
				return false;
			}
		}
	else
		return false;
}

/* Queue processing */
function $ajax_mk_process(queue)
{
	return function() {
		if (queue._queue.length < 1) return;

		var item = queue._queue.shift();
		queue._working = true;

		if (item['post'] == null) {
			queue._xhr.open("GET", item['url'], true);
		}
		else {
			queue._xhr.open("POST", item['url'], true);
			queue._xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
		}

		queue._xhr.onreadystatechange = function(){queue._statechange()};
		queue._callback = item['callback'];
		queue._xhr.send(item['post']);
	}
}

/* XHR state change callback */
function $ajax_mk_statechange(queue)
{
	return function() {
		if (queue._xhr.readyState != 4) return;
		if (queue._callback) {
		    queue._callback(queue._xhr.responseText);
		}
		queue._working = false;
		queue._process();
	}
}

/* Enqueue GET request*/
function $ajax_mk_get(queue)
{
	return function(url, callback) {
		queue._queue.push({
			'url': url,
			'callback': callback,
			'post': null
		});

		if (!queue._working) queue._process();
		return true;
	}
}

/* Enqueue POST request */
function $ajax_mk_post(queue)
{
	return function(url, postdata, callback) {
		queue._queue.push({
			'url': url,
			'callback': callback,
			'post': postdata
		});

		if (!queue._working) queue._process();
		return true;
	}
}


/* $ajaxqueue class
	q.get(url, callback)
	q.post(url, postdata, callback)
*/
function $ajaxqueue(qname) {
	/* Create XHR */
	this._xhr = $ajax_xhr();

	/* Setup queue */
	this._queue = new Array();
	this._working = false;
	this._callback = null;
	this._name = qname;

	/* Private */
	this._process = $ajax_mk_process(this);
	this._statechange = $ajax_mk_statechange(this);

	/* Public */
	this.get = $ajax_mk_get(this);
	this.post = $ajax_mk_post(this);
}

/* Update scheduler (enables updating all elements with the same update inteval at the same time) */
var $scheduler = {
    resolution: 50,
    queue: new $ajaxqueue('scheduler'),
    updates: {},
    timeouts: {},
    
    schedule: function(timeout, elem_id)
    {
        if (timeout == 0) timeout = $scheduler.resolution;
        
        /* Do nothing if element is already scheduled */
        for (var to in $scheduler.updates)
            if ($scheduler.updates[to].indexOf(elem_id) != -1) return;
    
        if (typeof $scheduler.updates[timeout] == 'undefined')
            $scheduler.updates[timeout] = [elem_id];
        else
            $scheduler.updates[timeout].push(elem_id);
            
        if (typeof $scheduler.timeouts[timeout] == 'undefined')
            $scheduler.timeouts[timeout] = window.setTimeout($scheduler.mk_update(timeout), timeout);
    },
    
    mk_update: function(timeout)
    {
        return function() {
            $scheduler.timeouts[timeout] = undefined;
            var eids = $scheduler.updates[timeout].join(',');
            $scheduler.updates[timeout] = [];
            var url = "/ui/update/" + encodeURIComponent(eids);
            $scheduler.queue.get(url, $op);
        };
    }
};



/********************************************************************
 *                           GUI UPDATES                            *
 ********************************************************************/

var $queue = new $ajaxqueue("main");

/* Eval JSON object and execute the code in its 'op' member */
function $op(json)
{
    var obj;
    
    /* Do not use JSON.parse as it doesn't support functions */
    if (json.length)
    {
        eval("obj=" + json);
        if (obj && obj.op) obj.op();
    }
}

/* Update element */
function $update(id)
{
    var url = "/ui/update/" + encodeURIComponent(id);
    $queue.get(url, $op);
}

/* Framework handler call */
function $method(handlerid, arg)
{
    var url = "/ui/handler/" + handlerid + "/" + encodeURIComponent(arg);
    $queue.get(url, $op);   
}

/* Element drop handler */
function $drop(handlerid, where, target, objref)
{
    var url = "/ui/drop/" + handlerid +
        "/" + where +
        "/" + encodeURIComponent(target) + 
        "/" + encodeURIComponent(objref);
    $queue.get(url, $op);
}

/* Preload image */
var preloaded = [];
function $preload(src)
{
    if (preloaded.indexOf(src) == -1)
    {
        var im = document.createElement("img");
        im.style.display = "none";
        im.src = src;
        document.documentElement.appendChild(im);
    }
}

/********************************************************************
 *                             DEV TOOLS                            *
 ********************************************************************/

/* Fatal error */
function $fatal(msg)
{
    var err = document.createElement("div");
    err.className = "nestor_fatal_error";
    err.innerHTML = "<b>Fatal error !</b><br><br>" + msg + "<br>";
    var lnk = document.createElement("a");
    lnk.href = "?";
    lnk.innerHTML = "reload";
    err.appendChild(lnk);
    document.documentElement.appendChild(err);
}

/* Debug window management */

var $debug_window = null;
var $init_time = null;
var $debug_pending = [];

function $debug_disable()
{
	if ($debug_window) $debug_window.close();
	$debug_window = null;
}

function $debug_enable()
{
	if ($debug_window) return;
	$debug_window = window.open("web/debug_window.html","debug_window","toolbar=no,scrollbars,width=800,height=600");

	var currentTime = new Date();
	$init_time = currentTime.getTime();
}

function $debug_datetime()
{
	var currentTime = new Date();
	var offset = (currentTime.getTime() - $init_time) / 1000;
	var tdata = offset.toString().split(".");

	while (tdata[0].length < 5) tdata[0] = "0" + tdata[0];

	if (tdata.length == 1) return tdata[0] + ".000";
	else
	{
		while (tdata[1].length < 3) tdata[1] += "0";
		return tdata.join(".");
	}
}

function $debug(msg)
{
	if (!$debug_window) return;
	var ddoc = $debug_window.document;
	var dpause = parseInt($$(ddoc, "debug_pause").value);
	
	if (dpause)
	{
	    $debug_pending.push(msg);
	}
	else
	{
	    while ($debug_pending.length > 0)
	        $debug_msg($debug_pending.shift())
	        
	    $debug_msg(msg);
	}
}

function $debug_msg(msg)
{
	if (!$debug_window) return;
	var ddoc = $debug_window.document;
	var ddiv = $$(ddoc, "debug_data");

	var span = ddoc.createElement("span");
	var b = ddoc.createElement("b");
	var pre = ddoc.createElement("pre");
	var br = ddoc.createElement("br");

	b.innerHTML = $debug_datetime() + "&nbsp;";
	pre.innerHTML = msg;

	span.appendChild(b);
	span.appendChild(pre);
	span.appendChild(br);

	ddiv.appendChild(span);
	span.scrollIntoView();
}


/********************************************************************
 *                         FRAMEWORK TOOLS                          *
 ********************************************************************/
 
var $scroll_containers = [];
var $scroll_got_os_size = false;

/* Compute OS scrollbar size and change CSS rules accordingly */
function $scroll_get_os_size()
{
    if ($scroll_got_os_size) return;
    
    var _out = document.createElement("div");
    var _in = document.createElement("div");
    
    _out.style.overflow = "auto";
    _out.style.height = "100px";
    _in.style.height = "200px";
    
    _out.appendChild(_in);
    document.documentElement.appendChild(_out);
    var os_size =  _out.offsetWidth - _in.offsetWidth;
    document.documentElement.removeChild(_out);
    
    $cssrule(".scroll_container_wrap", "right", "-100px");
    $cssrule(".scroll_container_cnt", "right", "100px");
    $cssrule(".scroll_container_cnt.overflowed", "right", (102 - os_size) + "px");
    $scroll_got_os_size = true;
}

/* Declare a scroll container */
function $scroll_declare(sce_id)
{
    $scroll_get_os_size();
    if ($scroll_containers.indexOf(sce_id) == -1)
        $scroll_containers.push(sce_id);
        
    $scroll_move(sce_id);
    var bar = $(sce_id + "_B");
    $drag.init_scrollbar(bar);
}

/* Horizontal scroll inhibiter */
function $scroll_cancel(e)
{
    this.scrollLeft = 0;
    this.scrollTop = 0;
}
 
/* ScrollContainerElement scroll handler */
function $scroll()
{
    $scroll_move(this.id.replace(/_W$/, ""));
}

/* Move and resize a ScrollContainerElement scrollbar */
$scroll_inhibit_move = false;
function $scroll_move(sce_id)
{
    if ($scroll_inhibit_move) return;

    var sce = $(sce_id);
    var bar = $(sce_id + "_B");
    var wrap = $(sce_id + "_W");
    var cnt = $(sce_id + "_C");
    
    if (sce && bar && wrap && cnt)
    {
        if (cnt.offsetHeight <= sce.offsetHeight)
        {
            $remC(cnt, "overflowed");
            bar.style.height = 0;
        }
        else
        {
            $addC(cnt, "overflowed");
            var sz = Math.max(5, Math.floor(sce.offsetHeight * sce.offsetHeight / cnt.offsetHeight));
            bar.style.height = sz + "px";    
            var top = Math.floor((sce.offsetHeight - sz) * wrap.scrollTop / (cnt.offsetHeight - sce.offsetHeight));
            bar.style.top = top + "px";
        }
    }
}

/* Scroll a ScrollContainerElement according to its bar position
    (this is quite the reverse of $scroll_move) */
function $scroll_scroll(bar)
{
    var sce_id = bar.id.replace(/_B$/, "");
    
    var sce = $(sce_id);
    var wrap = $(sce_id + "_W");
    var cnt = $(sce_id + "_C");
    
    if (sce && bar && wrap && cnt)
    {
        var sz = parseInt(bar.style.height);
        var top = parseInt(bar.style.top);
        $scroll_inhibit_move = true;
        wrap.scrollTop = top * (cnt.offsetHeight - sce.offsetHeight) / (sce.offsetHeight - sz);
        $scroll_inhibit_move = false;
    }
}

/* Refresh all scrollbar dimensions */
function $scroll_refresh_all()
{
    for (var i = 0; i < $scroll_containers.length; i++)
    {
        $scroll_move($scroll_containers[i]);
    }
}

/* Get maximum scrollbar top attribute */
function $scroll_get_maxY(bar)
{
    var sce_id = bar.id.replace(/_B$/, "");
    var sce = $(sce_id);
    var wrap = $(sce_id + "_W");
    var cnt = $(sce_id + "_C");
    
    if (sce && bar && wrap && cnt)
    {
        var sz = parseInt(bar.style.height);
        return sce.offsetHeight - sz;
    }
}

window.onresize = $scroll_refresh_all;

var $popup_menus = {};
var $popup_menuitems = {};
var $popup_shown = [];
var $popup_cur_objref = undefined;

function $popup_menu(obj)
{
    var menuid = $popup_menus[obj.id];
    var visible_items = $popup_menuitems[obj.id];
    $popup_cur_objref = $element_objrefs[obj.id];
    
    if (menuid && visible_items && visible_items.length)
    {
        var items = $(menuid).childNodes;
        for (var i=0; i<items.length; i++)
        {
            var aid = items[i].id.replace(menuid + "_", "");
            items[i].style.display = visible_items.indexOf(aid) == -1 ? 'none' : 'block';
        }
        
        $(menuid).style.display = "block";
        $(menuid).style.left = obj.lastMouseX + "px";
        $(menuid).style.top = obj.lastMouseY + "px";
        
        if ($popup_shown.indexOf(menuid) == -1) $popup_shown.push(menuid);
    }
}

function $popup_click(action, handlerid)
{
    $method(handlerid, action + " " + $popup_cur_objref);
    $popup_cur_objref = undefined;
}

function $popup_hide()
{
    for (var i=0; i<$popup_shown.length; i++)
    {
        var popupid = $popup_shown[i];
        if ($(popupid)) $(popupid).style.display = "none";
    }
    
    $popup_shown = [];
}

window.addEventListener("click", $popup_hide, true);

var $element_labels = {};
var $element_objrefs = {};


/********************************************************************
 *                          DRAG AND DROP                           *
 *     Code adapted from Aaron Boodman's public domain library      *
 ********************************************************************/
var $drop_targets = {};

var $drag = {

    mode : null,        // Drag mode : 'object' for element dragging, 'bar' for progress bars
    obj : null,         // Drag origin element
    label : null,       // Drag label element
    labelX : null,      // Drag label X position
    labelY : null,      // Drag label Y position
    offX : 16,          // Drag label X offset from mouse position
    offY : 0,           // Drag label Y offset from mouse position
    minDist : 10,       // Minimum distance to initiate drag
    hoverObj : null,    // Currently hovered drop target
    popdelay : 200,     // Milliseconds before showing popup
    poptimeout : null,  // Popup show timeout handler

    /* Fix event parameter and its properties */
    fixE : function(e)
    {
        if (typeof e == 'undefined') e = window.event;
        if (typeof e.layerX == 'undefined') e.layerX = e.offsetX;
        if (typeof e.layerY == 'undefined') e.layerY = e.offsetY;
        return e;
    },
    
    /* Schedule popup menu display */
    schedulepopup : function()
    {
        $drag.poptimeout = window.setTimeout($drag.popup, $drag.popdelay);
    },
    
    /* Cancel popup menu display schedule */
    cancelpopup : function()
    {
        if ($drag.poptimeout)
        {
            window.clearTimeout($drag.poptimeout);
            $drag.poptimeout = null;
        }
    },
    
    /* Display popup menu and cancel drag */
    popup : function()
    {
        $popup_menu($drag.obj);
        $drag.end();
    },
    
    /* Find drop target at point (x, y) */
    find_target : function(x, y)
    {
        var candidate = document.elementFromPoint(x, y);
        if (!candidate) return null;
        
        do
        {
            if ($drop_targets[candidate.id]) return candidate;
            candidate = candidate.parentNode;
        }
        while (candidate && candidate.id);
        
        return null;
    },

    /* Initialize object dragging for element o */
    init_object : function(o)
    {
        o.onmousedown = $drag.start_object;
    },
    
    /* Initialize scrollbar dragging */
    init_scrollbar : function(o)
	{
		o.onmousedown = $drag.start_scrollbar;
	},

    start_object : function(e)
    {
        e = $drag.fixE(e);
        $drag.mode = 'object';
        $drag.obj = this;
        return $drag.start(e);
    },

    start_scrollbar : function(e)
    {
        e = $drag.fixE(e);
        $drag.mode = 'bar';
        $drag.obj = this;
        return $drag.start(e);
    },
    
    start : function(e)
    {
        var o = $drag.obj;
        e = $drag.fixE(e);
        o.lastMouseX = e.clientX;
        o.lastMouseY = e.clientY;
        document.onmousemove = $drag.drag;
        document.onmouseup = $drag.end;
        
        if ($drag.mode == 'object') $drag.schedulepopup();
        if ($drag.mode == 'bar')
        {
            o.maxMouseX = o.minMouseX = e.clientX;
            o.minMouseY = e.clientY - parseInt(o.style.top);
            o.maxMouseY = o.minMouseY + $scroll_get_maxY(o);
        }
        
        return false;
    },

    drag : function(e)
    {
        e = $drag.fixE(e);
        var o = $drag.obj;
        var ey = e.clientY;
        var ex = e.clientX;
        var dobj = null;
        
        if ($drag.mode == 'object')
        {
            dobj = $drag.label;
            $drag.cancelpopup();
        
            if (dobj == null)
            {
                /* Create drag label */
                dobj = document.createElement("span");
                dobj.className = "drag_label";
                dobj.innerHTML = $element_labels[o.id];
                dobj.style.position = "absolute";
                document.documentElement.appendChild(dobj);
                $drag.label = dobj;
                
                /* Position it under the cursor */
                dobj.style.left = o.lastMouseX + $drag.offX;
                dobj.style.top = o.lastMouseY + $drag.offY;
            }
        }
        
        if ($drag.mode == 'bar')
        {
            dobj = o;
            ex = Math.max(ex, o.minMouseX);
		    ex = Math.min(ex, o.maxMouseX);
            ey = Math.max(ey, o.minMouseY);
		    ey = Math.min(ey, o.maxMouseY);
        }
        
        var y = parseInt(dobj.style.top);
        var x = parseInt(dobj.style.left);
        var nx, ny;

        nx = x + (ex - o.lastMouseX);
        ny = y + (ey - o.lastMouseY);

        if ($drag.mode != 'bar') dobj.style.left = nx + "px";
        dobj.style.top = ny + "px";
        $drag.obj.lastMouseX = ex;
        $drag.obj.lastMouseY = ey;
        
        if ($drag.mode == 'object')
        {    
            var dx = nx - $drag.offX;
            var dy = ny - $drag.offY;
        
            var target = $drag.find_target(dx, dy);
            if ($drag.hoverObj && target != $drag.hoverObj)
            {
                $remC($drag.hoverObj, "drag_hover");
                $remC($drag.hoverObj, "drag_above");
                $remC($drag.hoverObj, "drag_below");
            }
            if (target) 
            {
                var pos = $abspos(target);
                var oh = target.offsetHeight;
                
                $addC(target, "drag_hover");
                
                if (dy > (pos[1] + 0.5*oh))
                {
                    $remC(target, "drag_above");
                    $addC(target, "drag_below");
                }
                else
                {
                    $addC(target, "drag_above");
                    $remC(target, "drag_below");
                }
            }
            $drag.hoverObj = target;
        }
        
        if ($drag.mode == 'bar')
        {
            $scroll_scroll(o);
        }
        
        return false;
    },

    end : function()
    {
        
        document.onmousemove = null;
        document.onmouseup = null;
        
        if ($drag.mode == 'object')
        {
            $drag.cancelpopup();
            if ($drag.label != null)
            {
                var x = parseInt($drag.label.style.left) - $drag.offX;
                var y = parseInt($drag.label.style.top) - $drag.offY;
                
                if ($drag.hoverObj)
                {
                    var target = $drag.hoverObj;
                    var targetinfo = $drop_targets[target.id];
                    var objref = $element_objrefs[$drag.obj.id];
                    var where = $hasC(target, "drag_above") ? "above" : "below";
                    $drop(targetinfo["handler"], where, target.id, objref)
                    
                    $remC(target, "drag_hover");
                    $remC(target, "drag_above");
                    $remC(target, "drag_below");
                    $drag.hoverObj = null;
                }

                document.documentElement.removeChild($drag.label);
                $drag.label = null;
            }
        }
        
        $drag.obj = null;
    }
};
