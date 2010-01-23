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

/* Fatal error */
function $fatal(msg)
{
    var err = document.createElement("div");
    err.className = "domserver_fatal_error";
    err.innerHTML = "<b>Fatal error !</b><br>" + msg;
    document.getElementsByTagName("body")[0].appendChild(err);
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

    init : function(o)
    {
        o.onmousedown = $drag.start;
        if (isNaN(parseInt(o.style.left))) o.style.left   = "0px";
        if (isNaN(parseInt(o.style.top))) o.style.top    = "0px";
        o.onDragStart = new Function();
        o.onDragEnd = new Function();
        o.onDrag = new Function();
    },

    start : function(e)
    {
        var o = $drag.obj = this;
        e = $drag.fixE(e);
        var y = parseInt(o.style.top);
        var x = parseInt(o.style.left);
        
        o.onDragStart(x, y);

        o.lastMouseX = e.clientX;
        o.lastMouseY = e.clientY;

        document.onmousemove = $drag.drag;
        document.onmouseup = $drag.end;
        return false;
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

        $drag.obj.onDrag(nx, ny);
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
            
            var target = document.elementFromPoint(x, y);
            if (target && $drag_targets[target.id])
            {
                var app = $drag_targets[target.id];
                var objref = $drag_src[$drag.obj.id]["objref"];
                window.alert("Objref \"" + objref + "\" dragged to app \"" + app + "\"");
            }
        
            $drag.obj.onDragEnd(x, y);
            document.documentElement.removeChild($drag.label);
            $drag.label = null;
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
