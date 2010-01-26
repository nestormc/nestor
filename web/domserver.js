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
        parent.removeNode(a);
        parent.insertBefore(a, b);
    }
    else
    {
        parent.removeNode(b);
        parent.insertBefore(b, a)
        parent.removeNode(a);
        
        if (next) parent.insertBefore(a, next);
        else parent.appendChild(a);
    }
}

/********************************************************************
 *                           AJAX QUEUES                            *
 ********************************************************************/

/* Création d'un XMLHttpRequest */
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

/* Traitement de la queue */
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

/* Changement d'etat du XHR */
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

/* Recherche d'une requete dans la queue */
function $ajax_mk_queued(queue)
{
	return function(reqid) {
		var i;
		for (i = 0; i < queue._queue.length; i++) {
			if (queue._queue[i]['reqid'] == reqid) return true;
		}

		return false;
	}
}

/* Ajout d'une requete GET */
function $ajax_mk_get(queue)
{
	return function(url, callback, reqid) {
		if (queue._no_dup && reqid && queue._queued(reqid)) return false;

		queue._queue.push({
			'url': url,
			'callback': callback,
			'post': null,
			'reqid': reqid
		});

		if (!queue._working) queue._process();
		return true;
	}
}

/* Ajout d'une requete POST */
function $ajax_mk_post(queue)
{
	return function(url, postdata, callback, reqid) {
		if (queue._no_dup && reqid && queue._queued(reqid)) return false;

		queue._queue.push({
			'url': url,
			'callback': callback,
			'post': postdata,
			'reqid': reqid
		});

		if (!queue._working) queue._process();
		return true;
	}
}


/* Classe ajaxQueue
	q.get(url, callback, [id requete])
	q.post(url, postdata, callback, [id requete])

	no_duplicates (faux par defaut) : si vrai, une requete n'est
	pas enqueuée quand l'id requete est deja present dans la queue.
*/
function $ajaxqueue(qname, no_duplicates) {
	/* Creation du XHR */
	this._xhr = $ajax_xhr();

	/* Creation de la queue */
	this._queue = new Array();
	this._working = false;
	this._callback = null;
	this._no_dup = no_duplicates;
	this._name = qname;

	/* Méthodes privées */
	this._process = $ajax_mk_process(this);
	this._statechange = $ajax_mk_statechange(this);
	this._queued = $ajax_mk_queued(this);

	/* Méthodes publiques */
	this.get = $ajax_mk_get(this);
	this.post = $ajax_mk_post(this);
}



/********************************************************************
 *                           GUI UPDATES                            *
 ********************************************************************/

var $queue = new $ajaxqueue("main");

/* Eval JSON object and execute the code in its 'op' member */
function $op(json)
{
    var obj;
    
    /* Do not use JSON.parse as it doesn't support functions */
    eval("obj=" + json);
    obj.op();
}

/* Update element */
function $update(id)
{
    var url = "?a=update&eid=" + encodeURIComponent(id);
    $queue.get(url, $op);
}

/* Element method handler */
function $method(id, method, arg)
{
    var url = "?a=method&eid=" + encodeURIComponent(id) +
        "&m=" + encodeURIComponent(method) +
        "&arg=" + encodeURIComponent(arg);
    $queue.get(url, $op);   
}

/* Element drop handler */
function $drop(handler, method, target, objref)
{
    var url = "?a=drop&hid=" + encodeURIComponent(handler) +
        "&m=" + encodeURIComponent(method) +
        "&tid=" + encodeURIComponent(target) + 
        "&o="+ encodeURIComponent(objref);
    $queue.get(url, $op);
}

/********************************************************************
 *                             DEV TOOLS                            *
 ********************************************************************/

/* Fatal error */
function $fatal(msg)
{
    var err = document.createElement("div");
    err.className = "domserver_fatal_error";
    err.innerHTML = "<b>Fatal error !</b><br>" + msg + "<br>";
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
	$debug_window = window.open("framework/debug_window.php","debug_window","toolbar=no,scrollbars,width=600,height=400");

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
 *                          DRAG AND DROP                           *
 *     Code adapted from Aaron Boodman's public domain library      *
 ********************************************************************/
var $drag_src = {};
var $drag_targets = {};

var $drag = {

    obj : null,
    label : null,
    labelX : null,
    labelY : null,
    offX : 16,
    offY : 0,
    hoverObj : null,

    init : function(o)
    {
        o.onmousedown = $drag.start;
        o.onDragStart = new Function();
        o.onDragEnd = new Function();
        o.onDrag = new Function();
    },

    start : function(e)
    {
        var o = $drag.obj = this;
        e = $drag.fixE(e);

        o.lastMouseX = e.clientX;
        o.lastMouseY = e.clientY;

        document.onmousemove = $drag.drag;
        document.onmouseup = $drag.end;
        return false;
    },
    
    find_target : function(x, y)
    {
        var candidate = document.elementFromPoint(x, y);
        
        do
        {
            if ($drag_targets[candidate.id]) return candidate;  
            candidate = candidate.offsetParent;
        }
        while (candidate);
        
        return null;
    },

    drag : function(e)
    {
        e = $drag.fixE(e);
        var o = $drag.obj;
        var l = $drag.label;
    
        if (l == null)
        {
            /* Create drag label */
            l = document.createElement("span");
            l.className = "drag_label";
            l.innerHTML = $drag_src[o.id]["label"];
            l.style.position = "absolute";
            document.documentElement.appendChild(l);
            $drag.label = l;
            
            /* Position it under the cursor */
            l.style.left = o.lastMouseX + $drag.offX;
            l.style.top = o.lastMouseY + $drag.offY;
        }

        var ey = e.clientY;
        var ex = e.clientX;
        var y = parseInt(l.style.top);
        var x = parseInt(l.style.left);
        var nx, ny;

        nx = x + (ex - o.lastMouseX);
        ny = y + (ey - o.lastMouseY);

        $drag.label.style.left = nx + "px";
        $drag.label.style.top = ny + "px";
        $drag.obj.lastMouseX = ex;
        $drag.obj.lastMouseY = ey;
        
        var dx = nx - $drag.offX;
        var dy = ny - $drag.offY;
        
        var target = $drag.find_target(dx, dy);
        if ($drag.hoverObj && target != $drag.hoverObj) $remC($drag.hoverObj, "drag_hover");
        if (target) $addC(target, "drag_hover");
        $drag.hoverObj = target;
        
        return false;
    },

    end : function()
    {
        document.onmousemove = null;
        document.onmouseup = null;
        
        if ($drag.label != null)
        {
            var x = parseInt($drag.label.style.left) - $drag.offX;
            var y = parseInt($drag.label.style.top) - $drag.offY;
            
            var target = $drag.find_target(x, y);
            if (target)
            {
                var targetinfo = $drag_targets[target.id];
                var objref = $drag_src[$drag.obj.id]["objref"];
                
                $drop(targetinfo["handler"], targetinfo["method"], target.id, objref)
            }

            document.documentElement.removeChild($drag.label);
            $drag.label = null;
            
            if ($drag.hoverObj)
            {
                $remC($drag.hoverObj, "drag_hover");
                $drag.hoverObj = null;
            }
        }
        
        $drag.obj = null;
    },

    fixE : function(e)
    {
        if (typeof e == 'undefined') e = window.event;
        if (typeof e.layerX == 'undefined') e.layerX = e.offsetX;
        if (typeof e.layerY == 'undefined') e.layerY = e.offsetY;
        return e;
    }
};
