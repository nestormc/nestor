/*
 * Copyright 2010-2012 Nicolas Joyard
 *
 * This file is part of nestor.
 *
 * nestor is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * nestor is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with nestor.  If not, see <http://www.gnu.org/licenses/>.
 */

/*jslint white: true, browser: true, plusplus: true */
/*global define, require */

/*
 * Web DOM helpers
 */

define(['domReady'],
function (domReady) {
	"use strict";

	var dom = {},
		slice = Array.prototype.slice,
		addListener, remListener, classOp;


	/**
	 * Execute callback when DOM is ready
	 */
	dom.ready = domReady;


	/**
	 * querySelector[All] aliases
	 */
	dom.get = function(element, selector) {
		if (typeof element === 'string') {
			selector = element;
			element = document;
		}
		
		return element.querySelector(selector);
	};
	
	dom.getAll = function(element, selector) {
		var i, elems, ret = [];
		
		if (typeof element === 'string') {
			selector = element;
			element = document;
		}
		
		elems = element.querySelectorAll(selector);
		
		try {
			return slice.call(elems);
		} catch (e) {
			// slice.call only works with real Arrays in IE<=8
			for(i = elems.length; i >= 0; i--) {
				if (typeof elems[i] !== 'undefined') {
					ret.unshift(elems[i]);
				}
			}
			return ret;
		}
	};
	 
	 
	/**
	 * getElementById alias
	 */
	if (document.getElementById) {
		dom.gbid = function (id) {
			return document.getElementById(id);
		};
	} else if (document.all) {
		dom.gbid = function (id) {
			return document.all[id];
		};
	} else if (document.layers) {
		dom.gbid = function (id) {
			return document.layers[id];
		};
	} else {
		throw new Error("No getElementById alternative");
	}


	/**
	 * document.body alias
	 */
	dom.body = function () { return document.body; };

	
	/**
	 * document.createElement alias
	 */
	dom.create = function(tag) { return document.createElement(tag); };
	dom.createIn = function(tag, doc) { return doc.createElement(tag); };
	
	
	/**
	 * Empty an element
	 */
	dom.empty = function(el) {
		if (typeof el === 'string') {
			dom.getAll(el).forEach(dom.empty);
		} else {
			while (el.firstChild) {
				el.removeChild(el.firstChild);
			}
		}
	};
	

	/**
	 * Set style properties on 'el' from 'style'
	 */
	dom.setStyle = function (el, style) {
		var p;
		
		if (typeof el === 'string') {
			dom.getAll(el).forEach(function(elem) {
				dom.setStyle(elem, style);
			});
		} else {
			for (p in style) {
				if (style.hasOwnProperty(p)) {
					el.style[p] = style[p];
				}
			}
		}
	};
	
	
	// classList shim helper
	classOp = function(op, cls) {
		var cl = this.className.split(' '),
			index = cl.indexOf(cls),
			present = (index !== -1);
			
		if (op === 'toggle') {
			op = present ? 'remove' : 'add';
		}
		
		if (op === 'contains') {
			return present;
		}
			
		if (op === 'add' && !present) {
			cl.push(cls);
			this.className = cl.join(' ');
		} else if (op === 'remove' && present) {
			cl.splice(index, 1);
			this.className = cl.join(' ');
		}
	};
	
	
	/**
	 * classList shim
	 */
	dom.classList = function(el) {
		if (typeof el === 'string') {
			el = dom.get(el);
		}
	
		if (typeof el.classList === 'undefined') {
			el.classList = {
				add: classOp.bind(el, 'add'),
				remove: classOp.bind(el, 'remove'),
				contains: classOp.bind(el, 'contains'),
				toggle: classOp.bind(el, 'toggle')
			};
		}
		
		return el.classList;
	};


	// Event handlers
	if (document.addEventListener) {
		addListener = function (el, evt, handler) {
			el.addEventListener(evt, handler);
		};

		remListener = function (el, evt, handler) {
			el.removeEventListener(evt, handler);
		};
	} else if (document.attachEvent) {
		addListener = function (el, evt, handler) {
			el.attachEvent('on' + evt, handler);
		};

		remListener = function (el, evt, handler) {
			el.detachEvent('on' + evt, handler);
		};
	} else {
		throw new Error("No addEventListener alternative");
	}


	/**
	 * Set 'handler' for 'evt' on 'el' (element or selector).
	 * 'handler' will receive the Event object as a parameter and 'el' as 'this'.
	 * If 'detachMe' is specified, its 'detach()' method is called before attaching
	 * the new handler.
	 *
	 * Returns opaque event handler, on which a "detach()" method is available,
	 * and detaches the handler upon call.
	 *
	 * Returning 'false' from the handler both calls Event.preventDefault (if
	 * available) and sets Event.returnValue = false.  Inside the handler, the
	 * Event object always has a stopPropagation() method.
	 */
	dom.addListener = function (el, evt, handler, detachMe) {
		var cbHandler;
		
		if (typeof el === 'string') {
			el = document.querySelector(el);
		}
		
		cbHandler = function (e) {
			var ret;
			
			e = e || window.event;
			
			if (!e.stopPropagation) {
				e.stopPropagation = function() {
					e.cancelBubble = true;
				};
			}
			
			ret = handler.call(el, e);
			
			if (ret === false) {
				if (e.preventDefault) {
					e.preventDefault();
				}
				
				e.returnValue = ret;
			}
			
			return ret;
		};

		cbHandler.detach = function () {
			remListener(el, evt, cbHandler);
		};

		if (typeof detachMe !== 'undefined') {
			detachMe.detach();
		}

		addListener(el, evt, cbHandler);
		return cbHandler;
	};

	return dom;
});

