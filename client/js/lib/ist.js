/**
 * IST: Indented Selector Templating
 * version 0.5.5
 *
 * Copyright (c) 2012 Nicolas Joyard
 * Released under the MIT license.
 *
 * Author: Nicolas Joyard <joyard.nicolas@gmail.com>
 * http://njoyard.github.com/ist
 */
(function(global) {
	var isAMD, previous, istComponents,
		scopeCount = 0,
		scopeObject = {};
	
	isAMD = typeof global.define === 'function' && global.define.amd;
	istComponents = { require: global.require };


	istComponents.context = ( function() {
		var Context,
			exprRE = /\{((?:\}(?!\})|[^}])*)\}\}/g;
		
		/**
		 * Context object; holds the rendering context and target document,
		 * and provides helper methods.
		 */
		Context = function(object, doc) {
			this.value = object;
			this.doc = doc || document;
			this.scopeCount = 0;
			this.scopeObject = { document: this.doc };
		};
	
	
		Context.prototype = {
			/* Node creation aliases */
			importNode: function(node, deep) {
				return this.doc.importNode(node, deep);
			},
			
			createDocumentFragment: function() {
				return this.doc.createDocumentFragment();
			},
		
			createElement: function(tagName, namespace) {
				if (typeof namespace !== 'undefined') {
					return this.doc.createElementNS(namespace, tagName);
				} else {
					return this.doc.createElement(tagName);
				}
			},
		
			createTextNode: function(text) {
				return this.doc.createTextNode(text);
			},
			
			istData: function(node) {
				node._ist_data = node._ist_data || { detach: [], indices: [] };
				return node._ist_data;
			},
			
			/* Push an object on the scope stack. All its properties will be
				usable inside expressions and hide any previously available
				property with the same name */
			pushScope: function(scope) {
				this.scopeCount++;
				
				this.scopeObject = Object.create(this.scopeObject);
				Object.keys(scope).forEach(function(key) {
					this.scopeObject[key] = scope[key];
				}, this);
			},
			
			/* Pop the last object pushed on the scope stack  */
			popScope: function() {
				if (this.scopeCount === 0) {
					throw new Error("No scope left to pop out");
				}
				
				this.scopeCount--;
				this.scopeObject = Object.getPrototypeOf(this.scopeObject);
			},
			
			callUpdater: function(updater, domnode) {
				updater.call(this.value, domnode, scopeObject, this.scopeObject, this.istData(domnode));
			},
			
			buildSubContext: function(updater) {
				return this.createContext(updater.call(this.value, null, scopeObject, this.scopeObject));
			},
		
			/**
			 * Evaluate `expr` in a scope where the current context is available
			 * as `this`, all its own properties that are not reserved words are
			 * available as locals, and the target document is available as `document`. 
			 */
			evaluate: function(expr) {
				var func = new Function(
						"__ISTSCOPE__,__SCOPE__",
						"with(__ISTSCOPE__) { with(this) { with(__SCOPE__) { return " + expr + "; } } }"
					);
				
				return func.apply(this.value, [scopeObject, this.scopeObject]);
			},
		
			interpolate: function(text) {		
				return text.replace(exprRE, (function(m, p1) { return this.evaluate(p1); }).bind(this));
			},
		
			createContext: function(newValue) {
				return new Context(newValue, this.doc);
			}
		};
		
		return Context;
	}());
	
	istComponents.livefragment = (function() {
		var slice = Array.prototype.slice,
			DOCUMENT_FRAGMENT_NODE = 11;
		
		/*
		 * LiveFragment object; used to represent a "live"-DocumentFragment.
		 *
		 * Has the same API as a DocumentFragment, with some additions.  Operations
		 * on a LiveFragment are propagated to its parent.
		 *
		 * new LiveFragment(node)
		 *  creates a LiveFragment holding all child nodes of 'node'.  Can be used
		 *  with a "real" node, a DocumentFragment or an other LiveFragment.
		 *
		 * new LiveFragment(node, [], prevNode, nextNode)
		 *  creates an empty LiveFragment inside 'node' between 'prevNode' and
		 *  'nextNode'
		 *
		 * new LiveFragment(node, [nodes...])
		 *  creates a LiveFragment holding a subset of child nodes from 'node'.  The
		 *  subset must be contiguous (and it may be an Array or a NodeList).
		 */
		var LiveFragment = function(parent, nodes, prev, next) {
			if (typeof nodes === 'undefined') {
				this.childNodes = slice.call(parent.childNodes);
				this.previousSibling = null;
				this.nextSibling = null;
			} else {
				if (nodes.length === 0) {
					/* If prev is null, next must be firstChild, which means an
					   empty LiveFragment at the beginning of parent. Same thing if
					   next is null. Corollary: prev and next can be null if parent
					   is empty. */
					if ((!prev && next !== parent.firstChild) ||
						(!next && prev !== parent.lastChild)) {
						throw new Error("Cannot find adjacent siblings");
					}
				
					// TODO check validity of prev/next
					this.previousSibling = prev;
					this.nextSibling = next;
				} else {
					// TODO check whether nodes are contiguous
					this.previousSibling = nodes[0].previousSibling;
					this.nextSibling = nodes[nodes.length - 1].nextSibling;
				}
				
				this.childNodes = slice.call(nodes);
			}
			
			if (parent instanceof LiveFragment) {
				this.parentNode = parent.parentNode;
			} else {
				// TODO check validity of parent
				this.parentNode = parent;
			}
			
			this.ownerDocument = this.parentNode.ownerDocument;
			this.nodeType = DOCUMENT_FRAGMENT_NODE;
		};
	
		LiveFragment.prototype = {
			/* Append node to fragment, removing it from its parent first.
			   Can be called with a DocumentFragment or a LiveFragment */
			appendChild: function(node) {
				if (node instanceof LiveFragment) {
					node = node.getDocumentFragment();
				}
				
				if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
					slice.call(node.childNodes).forEach(this.appendChild, this);
					return;
				}
			
				// Remove child from its parent first
				if (node.parentNode) {
					node.parentNode.removeChild(node);
				}
				
				this._removeChildNoFail(node);
			
				if (this.nextSibling) {
					this.parentNode.insertBefore(node, this.nextSibling);
				} else {
					this.parentNode.appendChild(node);
				}
				
				this.childNodes.push(node);
				
				return node;
			},
			
			/* Insert node into fragment before reference node, removing it from its
				parent first. Can be called with a DocumentFragment or a
				LiveFragment */
			insertBefore: function(newNode, refNode) {
				var index;
				
				if (!refNode) {
					return this.appendChild(newNode);
				}
				
				if (newNode instanceof LiveFragment) {
					newNode = newNode.getDocumentFragment();
				}
				
				if (newNode.nodeType === DOCUMENT_FRAGMENT_NODE) {
					slice.call(newNode.childNodes).forEach(function(n) {
						this.insertBefore(n, refNode);
					}, this);
					return;
				}
				
				// Remove child from its parent first
				if (newNode.parentNode) {
					newNode.parentNode.removeChild(newNode);
				}
				
				this._removeChildNoFail(newNode);
				
				index = this.childNodes.indexOf(refNode);
				
				if (index === -1) {
					throw new Error("Cannot find reference node");
				}
				
				this.parentNode.insertBefore(newNode, refNode);
				this.childNodes.splice(index, 0, newNode);
				
				return newNode;
			},
			
			/* Remove node from fragment */
			removeChild: function(node) {
				var index = this.childNodes.indexOf(node);
				
				if (index === -1) {
					throw new Error("Cannot remove node");
				}
				
				this.parentNode.removeChild(node);
				this.childNodes.splice(index, 1);
				
				return node;
			},
			
			_removeChildNoFail: function(node) {
				var index = this.childNodes.indexOf(node);
				
				if (index === -1) {
					return;
				}
				
				this.parentNode.removeChild(node);
				this.childNodes.splice(index, 1);
				
				return node;
			},
			
			/* Replace node in fragment */
			replaceChild: function(newNode, oldNode) {
				var index = this.childNodes.indexOf(newNode);
				
				if (index === -1) {
					throw new Error("Cannot replace node");
				}
				
				this.parentNode.replaceChild(newNode, oldNode);
				this.childNodes.splice(index, 1, newNode);
				
				return oldNode;
			},
			
			/* Remove all nodes from fragment */
			empty: function() {
				this.childNodes.forEach(function(node) {
					this.parentNode.removeChild(node);
				}, this);
				
				this.childNodes = [];
			},
			
			/* Extend fragment to adjacent node */
			extend: function(node) {
				if (node === this.nextSibling) {
					this.childNodes.push(this.nextSibling);
					this.nextSibling = this.nextSibling.nextSibling;
					return;
				}
				
				if (node === this.previousSibling) {
					this.childNodes.unshift(this.previousSibling);
					this.previousSibling = this.previousSibling.previousSibling;
					return;
				}
				
				throw new Error("Cannot extend to non-adjacent node");
			},
			
			/* Shrink fragment by removing extremal node */
			shrink: function(node) {
				if (node === this.firstChild) {
					this.childNodes.shift();
					this.previousSibling = node;
					return;
				}
				
				if (node === this.lastChild) {
					this.childNodes.pop();
					this.nextSibling = node;
					return;
				}
				
				throw new Error("Cannot shrink by non-extremal node");
			},
			
			/* Empty LiveFragment and return a DocumentFragment with all nodes.
			   Useful to perform operations on nodes while detached from the
			   document.  Call LiveFragment#appendChild with the DocumentFragment
			   to reattach nodes.  Useless when LiveFragment is empty. */
			getDocumentFragment: function() {
				var frag = this.ownerDocument.createDocumentFragment();
				this.childNodes.forEach(frag.appendChild, frag);
				this.childNodes = [];
				return frag;
			},
			
			get firstChild() {
				return this.childNodes[0] || null;
			},
			
			get lastChild() {
				return this.childNodes[this.childNodes.length - 1] || null;
			},
			
			hasChildNodes: function() {
				return this.childNodes.length > 0;
			}
		};
		
		return LiveFragment;
	}());
	
	istComponents.rendered = ( function(Context) {	
		var RenderedTemplate,
			slice = Array.prototype.slice;
		
		RenderedTemplate = function(template, context, nodes, parent) {
			this.nodes = nodes;
			this.parent = parent;
			this.template = template;
			this.context = context;
		};
		
		RenderedTemplate.prototype.update = function(newContext) {	
			var fragment, rendered;
			
			if (newContext) {
				if (!(newContext instanceof Context)) {
					this.context = this.context.createContext(newContext);
				} else {
					this.context = newContext;
				}
			}
			
			if (!this.nodes) {
				rendered = this.template.renderInto(this.parent, this.context);
				this.nodes = rendered.nodes;
			} else {
				fragment = this.template.update(this.context, this.nodes);
				this.nodes = slice.call(fragment.childNodes);
			}
			
			return this;
		};
		
		return RenderedTemplate;
	}(istComponents.context));
	
	istComponents.directives = ( function(LiveFragment) {
		var directives, registered, conditionalHelper, iterationHelper;
		
		conditionalHelper = function(render, tmpl, fragment) {
			if (render) {
				if (fragment.hasChildNodes) {
					// Fragment contains nodes, update them
					tmpl.render(this, null, fragment);
				} else {
					// Nothing in fragment, render subtemplate
					fragment.appendChild(tmpl.render(this));
				}
			} else {
				// Empty fragment
				fragment.empty();
			}
		};
		
		iterationHelper = function(keys, items, ctx, tmpl, fragment) {
			var outer = this.value,
				renderedFragments = [],
				lastFragment,
				lastKey,
				findRenderedFragment;
				
			/* Start by building a list of fragments to group already
				rendered nodes by source array item (knowing that they are
				adjacent siblings) */
			fragment.childNodes.forEach(function(node) {
				var key = ctx.istData(node).iterationKey;
				
				if (key !== lastKey) {
					if (keys.indexOf(key) === -1) {
						// Item has gone away, remove node immediately
						fragment.removeChild(node);
					} else {
						lastFragment = new LiveFragment(fragment, [node]);
						lastKey = key;
					
						renderedFragments.push({
							key: key,
							fragment: lastFragment
						});
					}
				} else {
					lastFragment.extend(node);
				}
			});
			
			findRenderedFragment = function(key) {
				var i, len;
				for (i = 0, len = renderedFragments.length; i < len; i++) {
					if (renderedFragments[i].key === key) {
						return renderedFragments[i].fragment;
					}
				}
			};
			
			/* Loop over array and append updated/newly rendered fragments */
			items.forEach(function(item, index) {
				var i, len,
					sctx = ctx.createContext(item),
					rendered = findRenderedFragment(item);
					
				sctx.pushScope({
					loop: {
						first: index === 0,
						index: index,
						last: index === items.length - 1,
						length: items.length,
						outer: outer
					}
				});
				
				if (rendered) {
					tmpl.render(sctx, null, rendered);
				} else {
					rendered = tmpl.render(sctx, null, rendered);
					for (i = 0, len = rendered.childNodes.length; i < len; i++) {
						ctx.istData(rendered.childNodes[i]).iterationKey = keys[index];
					}
				}
				
				fragment.appendChild(rendered);
			});
		};
		
		
		/* Built-in directive helpers (except @include) */
		registered = {
			"if": function(ctx, tmpl, fragment) {
				conditionalHelper.call(this, ctx.value, tmpl, fragment);
			},
	
			"unless": function(ctx, tmpl, fragment) {
				conditionalHelper.call(this, !ctx.value, tmpl, fragment);
			},
	
			"with": function(ctx, tmpl, fragment) {
				if (fragment.hasChildNodes()) {
					tmpl.render(ctx, null, fragment);
				} else {
					fragment.appendChild(tmpl.render(ctx));
				}
			},
	
			"each": function(ctx, tmpl, fragment) {
				var array = ctx.value;
				
				if (!Array.isArray(array)) {
					throw new Error(array + " is not an array");
				}
				
				iterationHelper.call(this, array, array, ctx, tmpl, fragment);
			},
	
			"eachkey": function(ctx, tmpl, fragment) {
				var object = ctx.value,
					keys = Object.keys(object),
					array;
					
				array = keys.map(function(k) {
					return { key: k, value: object[k] };
				});
				
				// TODO 'object' must be added to 'loop' !
				iterationHelper.call(this, keys, array, ctx, tmpl, fragment);
			}
		};
		
		/* Directive manager object */
		directives = {
			register: function(name, helper) {
				registered[name] = helper;
			},
	
			get: function(name) {
				return registered[name];
			}
		};
		
		return directives;
	}(istComponents.livefragment));
	
	istComponents.escape = (function() {
		return function (content) {
			return content.replace(/(["'\\])/g, '\\$1')
				.replace(/[\f]/g, "\\f")
				.replace(/[\b]/g, "\\b")
				.replace(/[\t]/g, "\\t")
				.replace(/[\n]/g, "\\n")
				.replace(/[\r]/g, "\\r");
		};
	}());
	
	istComponents.prerender = ( function(jsEscape) {
		var T = "__TARGET__",
			G = "__ISTSCOPE__",
			S = "__SCOPE__",
			D = "__DATA__",
			expressionRE = /\{\{((?:\}(?!\})|[^}])*)\}\}/,
			nullUpdater = function() {},
			concat = Array.prototype.concat,
			getExpressionCode, attrUpdateHelper, propUpdateHelper,
			buildNodeUpdater, preRender, preRenderRec;
		
		/*
		 * Return JS code for evaluating a string with embedded expressions.
		 */
		getExpressionCode = function(text, isBareExpression) {
			var parts;
				
			if (isBareExpression) {
				// Pretend "{{ " + text + " }}" was passed
				parts = ["", text, ""];
			} else {
				parts = text.split(expressionRE);
			}
			
			if (parts.length === 3 && parts[0] === "" && parts[2] === "") {
				// Single expression
				return parts[1];
			} else {
				return parts.map(function(part, index) {
					if (index % 2 === 1) {
						// Expression
						return '(' + part + ')';
					} else {
						// Raw text between expressions
						return '"' + jsEscape(part) + '"';
					}
				}).join("+");
			}
		};
		
		attrUpdateHelper = function(attr) {
			return [
				T + ".setAttribute('" + jsEscape(attr) + "', " +
				getExpressionCode(this.attributes[attr]) +
				");"
			];
		};
		
		propUpdateHelper = function(prop) {
			return [
				T + "['" + jsEscape(prop) + "'] = " +
				getExpressionCode(this.properties[prop]) +
				";"
			];
		};
		
		evtUpdateHelper = function(evt) {
			var e = jsEscape(evt);
			
			return [
				"var __HANDLER__ = " + getExpressionCode(this.events[evt], true) + ";",
				T + ".addEventListener('" + e + "', __HANDLER__, false);",
				D + ".detach.push({ event: '" + e + "', handler: __HANDLER__ });"
			];
		};
		
		buildNodeUpdater = function(node) {
			var code = [];
			
			if (typeof node.text !== "undefined") {
				code.push(T + ".data = " + getExpressionCode(node.text) + ";");
			}
			
			if (node.tagName) {
				code = concat.apply(code, Object.keys(node.attributes).map(attrUpdateHelper, node));
				code = concat.apply(code, Object.keys(node.properties).map(propUpdateHelper, node));
			
				if (Object.keys(node.events).length) {
					code = code.concat([
						D + ".detach.forEach(function(evt) {",
							T + ".removeEventListener(evt.event, evt.handler, false);",
						"});",
						D + ".detach = [];"
					]);
					code = concat.apply(code, Object.keys(node.events).map(evtUpdateHelper, node));
				}
			}
			
			if (node.directive && node.expr) {
				code.push("return " + getExpressionCode(node.expr, true) + ";");
			}
			
			if (code.length) {
				try {
					node.updater = new Function(T + "," + G + "," + S + "," + D,
						"with (" + G + ") {\nwith (this) {\nwith (" + S + ") {\n" +
							code.join("\n") +
						"\n}\n}\n}"
					);
				} catch (e) {
					// Save node in exception to allow the Template to add context
					e.node = node;
					throw e;
				}
			} else {
				node.updater = nullUpdater;
			}
		};
		
		
		/* Prerender recursion helper */
		preRenderRec = function(node) {
			var pr, doc = this;
			
			if (!node.updater) {
				buildNodeUpdater(node);
			}
			
			if (!node.pr && doc) {
				/* Constant text node */
				if (typeof node.text !== 'undefined' &&
						!expressionRE.test(node.text)) {
					node.pr = doc.createTextNode(node.text);
				}
			
				/* Element node */
				if (typeof node.tagName !== 'undefined') {
					node.pr = pr = doc.createElement(node.tagName);
				
					node.classes.forEach(function(cls) {
						pr.classList.add(cls);
					});
	
					if (typeof node.id !== 'undefined') {
						pr.id = node.id;
					}
				}
		
				if (typeof node.children !== 'undefined') {
					node.children.forEach(preRenderRec, doc);
				}
			}
		};
		
		
		/* Prerender constant part of nodes */
		preRender = function(nodes, doc) {
			doc = doc || document;
			nodes.forEach(preRenderRec, doc);
			return !!doc;
		};
		
		
		return preRender;
	}(istComponents.escape));
	
	
	istComponents.template = (
	function(Context, LiveFragment, RenderedTemplate, directives, preRender) {
		var Template, findPartialRec, findIndex,
			expressionRE = /\{\{((?:\}(?!\})|[^}])*)\}\}/,
			slice = Array.prototype.slice,
			DOCUMENT_FRAGMENT_NODE = 11;
			
		
		findPartialRec = function(name, nodes) {
			var found, i, len,
				results = nodes.filter(function(n) {
					return n.partial === name;
				});
				
			if (results.length) {
				return results[0];
			}
			
			for (i = 0, len = nodes.length; i < len; i++) {
				if (typeof nodes[i].children !== 'undefined') {
					found = findPartialRec(name, nodes[i].children);
					
					if (found) {
						return found;
					}
				}
			}
		};
		
		
		/* Extract a LiveFragment from parent where nodes have "index" value */
		findIndex = function(context, parent, index, depth) {
			var nodes = parent.childNodes,
				result = [],
				previous = null,
				next = null,
				i, len, node, indices, idx;
			
			for (i = 0, len = nodes.length; i < len; i++) {
				node = nodes[i];
				idx = context.istData(node).indices[depth];
				
				if (typeof idx === 'undefined') {
					previous = node;
					continue;
				}
				
				if (idx < index) {
					previous = node;
				}
				
				if (idx === index) {
					result.push(nodes[i]);
				}
				
				if (idx > index) {
					next = node;
					break;		
				}
			}
	
			return new LiveFragment(parent, result, previous, next);
		};
		
	
		/**
		 * Template object; encapsulate template nodes and rendering helpers
		 */
		Template = function(name, nodes, depth) {
			this.name = name || '<unknown>';
			this.nodes = nodes;
			this.depth = depth || 0;
			
			this.prerendered = false;
			this._preRender();
		};
		
		
		/* Prerender constant part of nodes */
		Template.prototype._preRender = function(doc) {
			try {
				this.prerendered = preRender(this.nodes, doc);
			} catch(e) {
				if (e.node) {
					throw this._completeError(e, e.node);
				}
				
				throw e;
			}
		};
		
		
		/* Complete an Error object with information about the current node and
			template */
		Template.prototype._completeError = function(err, node) {
			var current = "in '" + this.name + "' on line " +
				(node.line || '<unknown>');
			
			if (typeof err.istStack === 'undefined') {
				err.message += " " + current;
				err.istStack = [];
			}
			
			err.istStack.push(current);
			return err;
		};
		
		
		/* Text node rendering helper */
		Template.prototype._renderTextNode = function(ctx, node, index, fragment) {
			var tnode;
			
			if (!fragment.firstChild) {
				if (typeof node.pr !== 'undefined') {
					tnode = ctx.importNode(node.pr, false);
				} else {
					try {
						tnode = ctx.createTextNode("");
						ctx.callUpdater(node.updater, tnode);
					} catch (err) {
						throw this._completeError(err, node);
					}
				}
				
				ctx.istData(tnode).indices[this.depth] = index;
				fragment.appendChild(tnode);
			} else {
				try {
					ctx.callUpdater(node.updater, fragment.firstChild);
				} catch (err) {
					throw this._completeError(err, node);
				}
			}
		};
		
		
		/* Element rendering helper */
		Template.prototype._renderElement = function(ctx, node, index, fragment) {
			var elem = fragment.firstChild,
				needsInserting = false,
				data;
			
			if (!elem) {
				if (typeof node.pr !== 'undefined') {
					elem = ctx.importNode(node.pr, false);
				} else {
					elem = ctx.createElement(node.tagName);
	
					node.classes.forEach(function(cls) {
						elem.classList.add(cls);
					});
	
					if (typeof node.id !== 'undefined') {
						elem.id = node.id;
					}
				}
				
				needsInserting = true;
			}
			
			data = ctx.istData(elem);
			
			try {
				ctx.callUpdater(node.updater, elem);
			} catch (err) {
				throw this._completeError(err, node);
			}
			
			data.indices[this.depth] = index;
			
			if (needsInserting) {
				fragment.appendChild(elem);
			}
		};
		
		
		/* Directive rendering helpers */
		Template.prototype._renderDirective = function(ctx, node, index, fragment) {
			var subTemplate = new Template(this.name, node.children, this.depth + 1),
				helper = directives.get(node.directive),
				subCtx, ret, i, len;
		
			if (typeof helper !== 'function') {
				throw new Error('No directive helper for @' + node.directive + ' has been registered');
			}
		
			if (typeof node.expr !== 'undefined') {
				try {
					subCtx = ctx.buildSubContext(node.updater);
				} catch(err) {
					throw this._completeError(err, node);
				}
			}
		
			try {
				helper.call(ctx, subCtx, subTemplate, fragment);
			} catch (err) {
				throw this._completeError(err, node);
			}
			
			for (i = 0, len = fragment.childNodes.length; i < len; i++) {
				ctx.istData(fragment.childNodes[i]).indices[this.depth] = index;
			}
		};
		
		
		/* Look for a node with the given partial name and return a new
			Template object if found */
		Template.prototype.findPartial = function(name) {
			var result;
			
			if (typeof name === "undefined") {
				return;
			}
				
			result = findPartialRec(name, this.nodes);
			
			if (typeof result !== 'undefined') {
				return new Template(this.name, [result]);
			}
		};
		
		renderRec = function(node, index) {
			var template = this.template,
				ctx = this.context,
				depth = template.depth,
				fragment = findIndex(ctx, this.fragment, index, depth);
		
			if (typeof node.text !== 'undefined') {
				template._renderTextNode(ctx, node, index, fragment, depth);
			}
					
			if (typeof node.tagName !== 'undefined') {
				template._renderElement(ctx, node, index, fragment, depth);
				node.children.forEach(
					renderRec,
					{
						template: template,
						context: ctx,
						fragment: fragment.firstChild
					}
				);
			}
			
			if (typeof node.directive !== 'undefined') {
				template._renderDirective(ctx, node, index, fragment, depth);
			}
		};
	
		
		/* Render template using 'context' in 'doc' */
		Template.prototype.render = function(context, doc, fragment) {
			var detached;
			
			if (!(context instanceof Context)) {
				context = new Context(context, doc);
			} else {
				doc = context.doc;
			}
			
			if (!this.prerendered) {
				this._preRender(context.document);
			}
				
			if (!fragment) {
				fragment = context.createDocumentFragment();
			}
	
			if (fragment instanceof LiveFragment) {
				// Detach nodes from document while updating
				detached = fragment;
				fragment = detached.getDocumentFragment();
			}
		
			this.nodes.forEach(
				renderRec,
				{
					template: this,
					context: context,
					fragment: fragment
				}
			);
	
			if (detached) {
				// Reattach nodes
				detached.appendChild(fragment);
				fragment = detached;
			}
		
			return fragment;
		};
		
		
		Template.prototype.renderInto = function(destination, context) {
			var fragment, rendered;
			
			if (!(context instanceof Context)) {
				context = new Context(context, destination.ownerDocument);
			}
			
			fragment = this.render(context, destination.ownerDocument);
			
			if (fragment.hasChildNodes()) {
				rendered = new RenderedTemplate(this, context, slice.call(fragment.childNodes));
			} else {
				// No nodes rendered, give destination to RenderedTemplate
				rendered = new RenderedTemplate(this, context, null, destination);
			}
			
			destination.appendChild(fragment);
			return rendered;
		};
		
		
		Template.prototype.update = function(context, nodes) {
			var doc, isFragment, fragment;
			
			isFragment = nodes.nodeType &&
				nodes.nodeType === DOCUMENT_FRAGMENT_NODE;
			
			if (!nodes || (!isFragment && !nodes.length)) {
				throw new Error("No nodes to update");
			}
			
			if (!(context instanceof Context)) {
				doc = isFragment ? nodes.ownerDocument : nodes[0].ownerDocument;
				context = new Context(context, doc);
			} else {
				doc = context.doc;
			}
			
			fragment = isFragment ? nodes :
				new LiveFragment(nodes[0].parentNode, slice.call(nodes));
			
			return this.render(context, null, fragment);
		};
		
	
		/* Return code to regenerate this template */
		Template.prototype.getCode = function(pretty) {
			return "new ist.Template(" +
				JSON.stringify(this.name) + ", " +
				JSON.stringify(this.nodes, null, pretty ? 1 : 0) +
				");";
		};
		
		
		return Template;
	}(
		istComponents.context,
		istComponents.livefragment,
		istComponents.rendered,
		istComponents.directives,
		istComponents.prerender
	));
	
	istComponents.parsehelpers = (function() {
		var UNCHANGED = 'U', INDENT = 'I', DEDENT = 'D', UNDEF,
			textToJSON, elemToJSON, directiveToJSON,
			helpers = {};
			
		
		textToJSON = function() {
			return { text: this.text, line: this.line };
		};
		
		elemToJSON =  function() {
			var o = {
					tagName: this.tagName,
					line: this.line,
					classes: this.classes,
					attributes: this.attributes,
					properties: this.properties,
					events: this.events,
					children: this.children
				};
			
			if (typeof this.id !== 'undefined') {
				o.id = this.id;
			}
		
			if (typeof this.partial !== 'undefined') {
				o.partial = this.partial;
			}
		
			return o;
		};
		
		directiveToJSON = function() {
			return {
				directive: this.directive,
				expr: this.expr,
				line: this.line,
				children: this.children
			};
		};
	
		// Generate node tree
		helpers.generateNodeTree = function(first, tail) {
			var root = { children: [] },
				stack = [root],
				nodeCount = 0,
				lines, peekNode, pushNode, popNode;
			
			if (!first) {
				return root.children;
			}
			
			/* Node stack helpers */
		
			peekNode = function() {
				return stack[stack.length - 1];
			};
	
			pushNode = function(node) {
				nodeCount++;
				stack.push(node);
			};
	
			popNode = function(lineNumber) {
				var node;
				if (stack.length < 2) {
					throw new Error("Could not pop node from stack");
				}
		
				node = stack.pop();
				peekNode().children.push(node);
			
				return node;
			};
		
			// Remove newlines
			lines = tail.map(function(item) { return item.pop(); });
			lines.unshift(first);
	
			lines.forEach(function(line, index) {
				var indent = line.indent,
					item = line.item,
					lineNumber = line.num,
					err;
				
				if (indent[0] instanceof Error) {
					throw indent[0];
				}
			
				if (nodeCount > 0) {
					if (indent[0] === UNCHANGED) {
						// Same indent: previous node won't have any children
						popNode();
					} else if (indent[0] === DEDENT) {
						// Pop nodes in their parent
						popNode();
				
						while (indent.length > 0) {
							indent.pop();
							popNode();
						}
					} else if (indent[0] === INDENT && typeof peekNode().text !== 'undefined') {
						err = new Error("Cannot add children to text node");
						err.line = lineNumber;
						throw err;
					}
				}
			
				pushNode(item);
			});
		
			// Collapse remaining stack
			while (stack.length > 1) {
				popNode();
			}
		
			return root.children;
		};
	
		// Keep track of indent
		helpers.parseIndent = function(depths, s, line) {
			var depth = s.length,
				dents = [],
				err;
	
			if (depth.length === 0) {
				// First line, this is the reference indent
				depths.push(depth);
			}
	
			if (depth == depths[0]) {
				// Same indent as previous line
				return [UNCHANGED];
			}
	
			if (depth > depths[0]) {
				// Deeper indent, unshift it
				depths.unshift(depth);
				return [INDENT];
			}
		
			while (depth < depths[0]) {
				// Narrower indent, try to find it in previous indents
				depths.shift();
				dents.push(DEDENT);
			}
	
			if (depth != depths[0]) {
				// No matching previous indent
				err = new Error("Unexpected indent");
				err.line = line;
				err.column = 1;
				return [err];
			}
	
			return dents;
		};
	
		// Text node helper
		helpers.createTextNode = function(text, line) {
			return {
				text: text,
				line: line,
				toJSON: textToJSON
			};
		};
	
		// Element object helper
		helpers.createElement = function(tagName, qualifiers, additions, line) {
			var elem = {
				tagName: tagName,
				line: line,
				classes: [],
				attributes: {},
				properties: {},
				events: {},
				children: [],
				toJSON: elemToJSON
			};
	
			qualifiers.forEach(function(q) {
				if (typeof q.id !== 'undefined') {
					elem.id = q.id;
				} else if (typeof q.className !== 'undefined') {
					elem.classes.push(q.className);
				} else if (typeof q.attr !== 'undefined') {
					elem.attributes[q.attr] = q.value;
				} else if (typeof q.prop !== 'undefined') {
					elem.properties[q.prop] = q.value;
				} else if (typeof q.event !== 'undefined') {
					if (typeof elem.events[q.event] === 'undefined') {
						elem.events[q.event] = [];
					}
				
					elem.events[q.event].push(q.value);
				}
			});
		
			if (typeof additions !== 'undefined') {
				if (additions.partial.length > 0) {
					elem.partial = additions.partial;
				}
			
				if (typeof additions.textnode !== 'undefined' &&
					typeof additions.textnode.text !== 'undefined') {
					elem.children.push(additions.textnode);
				}
			}
	
			return elem;
		};
	
		// Directive object helper
		helpers.createDirective = function(name, expr, line) {
			return {
				directive: name,
				expr: expr,
				line: line,
				children: [],
				toJSON: directiveToJSON
			};
		};
	
		helpers.escapedCharacter = function(char) {
			if (char.length > 1) {
				// 2 or 4 hex digits coming from \xNN or \uNNNN
				return String.fromCharCode(parseInt(char, 16));
			} else {
				return { 'f': '\f', 'b': '\b', 't': '\t', 'n': '\n', 'r': '\r' }[char] || char;
			}
		};
		
		return helpers;
	}());
	
	istComponents.parser = ( function(helpers) {
		var pegjsParser;
	pegjsParser = (function(){
	  /*
	   * Generated by PEG.js 0.7.0.
	   *
	   * http://pegjs.majda.cz/
	   */
	  
	  function quote(s) {
	    /*
	     * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a
	     * string literal except for the closing quote character, backslash,
	     * carriage return, line separator, paragraph separator, and line feed.
	     * Any character may appear in the form of an escape sequence.
	     *
	     * For portability, we also escape escape all control and non-ASCII
	     * characters. Note that "\0" and "\v" escape sequences are not used
	     * because JSHint does not like the first and IE the second.
	     */
	     return '"' + s
	      .replace(/\\/g, '\\\\')  // backslash
	      .replace(/"/g, '\\"')    // closing quote character
	      .replace(/\x08/g, '\\b') // backspace
	      .replace(/\t/g, '\\t')   // horizontal tab
	      .replace(/\n/g, '\\n')   // line feed
	      .replace(/\f/g, '\\f')   // form feed
	      .replace(/\r/g, '\\r')   // carriage return
	      .replace(/[\x00-\x07\x0B\x0E-\x1F\x80-\uFFFF]/g, escape)
	      + '"';
	  }
	  
	  var result = {
	    /*
	     * Parses the input with a generated parser. If the parsing is successfull,
	     * returns a value explicitly or implicitly specified by the grammar from
	     * which the parser was generated (see |PEG.buildParser|). If the parsing is
	     * unsuccessful, throws |PEG.parser.SyntaxError| describing the error.
	     */
	    parse: function(input, startRule) {
	      var parseFunctions = {
	        "templateLines": parse_templateLines,
	        "__": parse___,
	        "line": parse_line,
	        "indent": parse_indent,
	        "newline": parse_newline,
	        "character": parse_character,
	        "identifier": parse_identifier,
	        "partial": parse_partial,
	        "elemId": parse_elemId,
	        "elemClass": parse_elemClass,
	        "squareBracketsValue": parse_squareBracketsValue,
	        "elemAttribute": parse_elemAttribute,
	        "elemProperty": parse_elemProperty,
	        "elemEventHandler": parse_elemEventHandler,
	        "elemQualifier": parse_elemQualifier,
	        "element": parse_element,
	        "implicitElement": parse_implicitElement,
	        "explicitElement": parse_explicitElement,
	        "elementAdditions": parse_elementAdditions,
	        "textNode": parse_textNode,
	        "escapedUnicode": parse_escapedUnicode,
	        "escapedASCII": parse_escapedASCII,
	        "escapedCharacter": parse_escapedCharacter,
	        "doubleQuotedText": parse_doubleQuotedText,
	        "singleQuotedText": parse_singleQuotedText,
	        "quotedText": parse_quotedText,
	        "directive": parse_directive,
	        "simpleDirective": parse_simpleDirective,
	        "exprDirective": parse_exprDirective
	      };
	      
	      if (startRule !== undefined) {
	        if (parseFunctions[startRule] === undefined) {
	          throw new Error("Invalid rule name: " + quote(startRule) + ".");
	        }
	      } else {
	        startRule = "templateLines";
	      }
	      
	      var pos = { offset: 0, line: 1, column: 1, seenCR: false };
	      var reportFailures = 0;
	      var rightmostFailuresPos = { offset: 0, line: 1, column: 1, seenCR: false };
	      var rightmostFailuresExpected = [];
	      
	      function padLeft(input, padding, length) {
	        var result = input;
	        
	        var padLength = length - input.length;
	        for (var i = 0; i < padLength; i++) {
	          result = padding + result;
	        }
	        
	        return result;
	      }
	      
	      function escape(ch) {
	        var charCode = ch.charCodeAt(0);
	        var escapeChar;
	        var length;
	        
	        if (charCode <= 0xFF) {
	          escapeChar = 'x';
	          length = 2;
	        } else {
	          escapeChar = 'u';
	          length = 4;
	        }
	        
	        return '\\' + escapeChar + padLeft(charCode.toString(16).toUpperCase(), '0', length);
	      }
	      
	      function clone(object) {
	        var result = {};
	        for (var key in object) {
	          result[key] = object[key];
	        }
	        return result;
	      }
	      
	      function advance(pos, n) {
	        var endOffset = pos.offset + n;
	        
	        for (var offset = pos.offset; offset < endOffset; offset++) {
	          var ch = input.charAt(offset);
	          if (ch === "\n") {
	            if (!pos.seenCR) { pos.line++; }
	            pos.column = 1;
	            pos.seenCR = false;
	          } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
	            pos.line++;
	            pos.column = 1;
	            pos.seenCR = true;
	          } else {
	            pos.column++;
	            pos.seenCR = false;
	          }
	        }
	        
	        pos.offset += n;
	      }
	      
	      function matchFailed(failure) {
	        if (pos.offset < rightmostFailuresPos.offset) {
	          return;
	        }
	        
	        if (pos.offset > rightmostFailuresPos.offset) {
	          rightmostFailuresPos = clone(pos);
	          rightmostFailuresExpected = [];
	        }
	        
	        rightmostFailuresExpected.push(failure);
	      }
	      
	      function parse_templateLines() {
	        var result0, result1, result2, result3, result4;
	        var pos0, pos1, pos2;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        result0 = [];
	        result1 = parse_newline();
	        while (result1 !== null) {
	          result0.push(result1);
	          result1 = parse_newline();
	        }
	        if (result0 !== null) {
	          result1 = parse_line();
	          result1 = result1 !== null ? result1 : "";
	          if (result1 !== null) {
	            result2 = [];
	            pos2 = clone(pos);
	            result4 = parse_newline();
	            if (result4 !== null) {
	              result3 = [];
	              while (result4 !== null) {
	                result3.push(result4);
	                result4 = parse_newline();
	              }
	            } else {
	              result3 = null;
	            }
	            if (result3 !== null) {
	              result4 = parse_line();
	              if (result4 !== null) {
	                result3 = [result3, result4];
	              } else {
	                result3 = null;
	                pos = clone(pos2);
	              }
	            } else {
	              result3 = null;
	              pos = clone(pos2);
	            }
	            while (result3 !== null) {
	              result2.push(result3);
	              pos2 = clone(pos);
	              result4 = parse_newline();
	              if (result4 !== null) {
	                result3 = [];
	                while (result4 !== null) {
	                  result3.push(result4);
	                  result4 = parse_newline();
	                }
	              } else {
	                result3 = null;
	              }
	              if (result3 !== null) {
	                result4 = parse_line();
	                if (result4 !== null) {
	                  result3 = [result3, result4];
	                } else {
	                  result3 = null;
	                  pos = clone(pos2);
	                }
	              } else {
	                result3 = null;
	                pos = clone(pos2);
	              }
	            }
	            if (result2 !== null) {
	              result3 = [];
	              result4 = parse_newline();
	              while (result4 !== null) {
	                result3.push(result4);
	                result4 = parse_newline();
	              }
	              if (result3 !== null) {
	                result0 = [result0, result1, result2, result3];
	              } else {
	                result0 = null;
	                pos = clone(pos1);
	              }
	            } else {
	              result0 = null;
	              pos = clone(pos1);
	            }
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, first, tail) { return helpers.generateNodeTree(first, tail); })(pos0.offset, pos0.line, pos0.column, result0[1], result0[2]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse___() {
	        var result0;
	        
	        reportFailures++;
	        if (/^[ \t]/.test(input.charAt(pos.offset))) {
	          result0 = input.charAt(pos.offset);
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("[ \\t]");
	          }
	        }
	        reportFailures--;
	        if (reportFailures === 0 && result0 === null) {
	          matchFailed("whitespace");
	        }
	        return result0;
	      }
	      
	      function parse_line() {
	        var result0, result1, result2, result3;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        result0 = parse_indent();
	        if (result0 !== null) {
	          result1 = parse_element();
	          if (result1 === null) {
	            result1 = parse_textNode();
	            if (result1 === null) {
	              result1 = parse_directive();
	            }
	          }
	          if (result1 !== null) {
	            result2 = [];
	            result3 = parse___();
	            while (result3 !== null) {
	              result2.push(result3);
	              result3 = parse___();
	            }
	            if (result2 !== null) {
	              result0 = [result0, result1, result2];
	            } else {
	              result0 = null;
	              pos = clone(pos1);
	            }
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, depth, s) { return { indent: depth, item: s, num: line }; })(pos0.offset, pos0.line, pos0.column, result0[0], result0[1]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_indent() {
	        var result0, result1;
	        var pos0;
	        
	        reportFailures++;
	        pos0 = clone(pos);
	        result0 = [];
	        result1 = parse___();
	        while (result1 !== null) {
	          result0.push(result1);
	          result1 = parse___();
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, s) { return helpers.parseIndent(depths, s, line); })(pos0.offset, pos0.line, pos0.column, result0);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        reportFailures--;
	        if (reportFailures === 0 && result0 === null) {
	          matchFailed("indent");
	        }
	        return result0;
	      }
	      
	      function parse_newline() {
	        var result0;
	        
	        reportFailures++;
	        if (input.charCodeAt(pos.offset) === 10) {
	          result0 = "\n";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\"\\n\"");
	          }
	        }
	        reportFailures--;
	        if (reportFailures === 0 && result0 === null) {
	          matchFailed("new line");
	        }
	        return result0;
	      }
	      
	      function parse_character() {
	        var result0;
	        
	        reportFailures++;
	        if (/^[^\n]/.test(input.charAt(pos.offset))) {
	          result0 = input.charAt(pos.offset);
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("[^\\n]");
	          }
	        }
	        reportFailures--;
	        if (reportFailures === 0 && result0 === null) {
	          matchFailed("character");
	        }
	        return result0;
	      }
	      
	      function parse_identifier() {
	        var result0, result1, result2;
	        var pos0, pos1;
	        
	        reportFailures++;
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (/^[a-z_]/i.test(input.charAt(pos.offset))) {
	          result0 = input.charAt(pos.offset);
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("[a-z_]i");
	          }
	        }
	        if (result0 !== null) {
	          result1 = [];
	          if (/^[a-z0-9_\-]/i.test(input.charAt(pos.offset))) {
	            result2 = input.charAt(pos.offset);
	            advance(pos, 1);
	          } else {
	            result2 = null;
	            if (reportFailures === 0) {
	              matchFailed("[a-z0-9_\\-]i");
	            }
	          }
	          while (result2 !== null) {
	            result1.push(result2);
	            if (/^[a-z0-9_\-]/i.test(input.charAt(pos.offset))) {
	              result2 = input.charAt(pos.offset);
	              advance(pos, 1);
	            } else {
	              result2 = null;
	              if (reportFailures === 0) {
	                matchFailed("[a-z0-9_\\-]i");
	              }
	            }
	          }
	          if (result1 !== null) {
	            result0 = [result0, result1];
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, h, t) { return h + t.join(''); })(pos0.offset, pos0.line, pos0.column, result0[0], result0[1]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        reportFailures--;
	        if (reportFailures === 0 && result0 === null) {
	          matchFailed("identifier");
	        }
	        return result0;
	      }
	      
	      function parse_partial() {
	        var result0, result1;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (input.charCodeAt(pos.offset) === 33) {
	          result0 = "!";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\"!\"");
	          }
	        }
	        if (result0 !== null) {
	          result1 = parse_identifier();
	          if (result1 !== null) {
	            result0 = [result0, result1];
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, name) { return name; })(pos0.offset, pos0.line, pos0.column, result0[1]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_elemId() {
	        var result0, result1;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (input.charCodeAt(pos.offset) === 35) {
	          result0 = "#";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\"#\"");
	          }
	        }
	        if (result0 !== null) {
	          result1 = parse_identifier();
	          if (result1 !== null) {
	            result0 = [result0, result1];
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, id) { return { 'id': id }; })(pos0.offset, pos0.line, pos0.column, result0[1]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_elemClass() {
	        var result0, result1;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (input.charCodeAt(pos.offset) === 46) {
	          result0 = ".";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\".\"");
	          }
	        }
	        if (result0 !== null) {
	          result1 = parse_identifier();
	          if (result1 !== null) {
	            result0 = [result0, result1];
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, cls) { return { 'className': cls }; })(pos0.offset, pos0.line, pos0.column, result0[1]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_squareBracketsValue() {
	        var result0, result1;
	        var pos0;
	        
	        pos0 = clone(pos);
	        result0 = [];
	        result1 = parse_escapedCharacter();
	        if (result1 === null) {
	          if (/^[^\\\n\]]/.test(input.charAt(pos.offset))) {
	            result1 = input.charAt(pos.offset);
	            advance(pos, 1);
	          } else {
	            result1 = null;
	            if (reportFailures === 0) {
	              matchFailed("[^\\\\\\n\\]]");
	            }
	          }
	        }
	        while (result1 !== null) {
	          result0.push(result1);
	          result1 = parse_escapedCharacter();
	          if (result1 === null) {
	            if (/^[^\\\n\]]/.test(input.charAt(pos.offset))) {
	              result1 = input.charAt(pos.offset);
	              advance(pos, 1);
	            } else {
	              result1 = null;
	              if (reportFailures === 0) {
	                matchFailed("[^\\\\\\n\\]]");
	              }
	            }
	          }
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, chars) { return chars.join(''); })(pos0.offset, pos0.line, pos0.column, result0);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_elemAttribute() {
	        var result0, result1, result2, result3, result4;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (input.charCodeAt(pos.offset) === 91) {
	          result0 = "[";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\"[\"");
	          }
	        }
	        if (result0 !== null) {
	          result1 = parse_identifier();
	          if (result1 !== null) {
	            if (input.charCodeAt(pos.offset) === 61) {
	              result2 = "=";
	              advance(pos, 1);
	            } else {
	              result2 = null;
	              if (reportFailures === 0) {
	                matchFailed("\"=\"");
	              }
	            }
	            if (result2 !== null) {
	              result3 = parse_squareBracketsValue();
	              if (result3 !== null) {
	                if (input.charCodeAt(pos.offset) === 93) {
	                  result4 = "]";
	                  advance(pos, 1);
	                } else {
	                  result4 = null;
	                  if (reportFailures === 0) {
	                    matchFailed("\"]\"");
	                  }
	                }
	                if (result4 !== null) {
	                  result0 = [result0, result1, result2, result3, result4];
	                } else {
	                  result0 = null;
	                  pos = clone(pos1);
	                }
	              } else {
	                result0 = null;
	                pos = clone(pos1);
	              }
	            } else {
	              result0 = null;
	              pos = clone(pos1);
	            }
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, attr, value) { return { 'attr': attr, 'value': value }; })(pos0.offset, pos0.line, pos0.column, result0[1], result0[3]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_elemProperty() {
	        var result0, result1, result2, result3, result4, result5;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (input.charCodeAt(pos.offset) === 91) {
	          result0 = "[";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\"[\"");
	          }
	        }
	        if (result0 !== null) {
	          if (input.charCodeAt(pos.offset) === 46) {
	            result1 = ".";
	            advance(pos, 1);
	          } else {
	            result1 = null;
	            if (reportFailures === 0) {
	              matchFailed("\".\"");
	            }
	          }
	          if (result1 !== null) {
	            result2 = parse_identifier();
	            if (result2 !== null) {
	              if (input.charCodeAt(pos.offset) === 61) {
	                result3 = "=";
	                advance(pos, 1);
	              } else {
	                result3 = null;
	                if (reportFailures === 0) {
	                  matchFailed("\"=\"");
	                }
	              }
	              if (result3 !== null) {
	                result4 = parse_squareBracketsValue();
	                if (result4 !== null) {
	                  if (input.charCodeAt(pos.offset) === 93) {
	                    result5 = "]";
	                    advance(pos, 1);
	                  } else {
	                    result5 = null;
	                    if (reportFailures === 0) {
	                      matchFailed("\"]\"");
	                    }
	                  }
	                  if (result5 !== null) {
	                    result0 = [result0, result1, result2, result3, result4, result5];
	                  } else {
	                    result0 = null;
	                    pos = clone(pos1);
	                  }
	                } else {
	                  result0 = null;
	                  pos = clone(pos1);
	                }
	              } else {
	                result0 = null;
	                pos = clone(pos1);
	              }
	            } else {
	              result0 = null;
	              pos = clone(pos1);
	            }
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, prop, value) { return { 'prop': prop, 'value': value }; })(pos0.offset, pos0.line, pos0.column, result0[2], result0[4]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_elemEventHandler() {
	        var result0, result1, result2, result3, result4, result5;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (input.charCodeAt(pos.offset) === 91) {
	          result0 = "[";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\"[\"");
	          }
	        }
	        if (result0 !== null) {
	          if (input.charCodeAt(pos.offset) === 33) {
	            result1 = "!";
	            advance(pos, 1);
	          } else {
	            result1 = null;
	            if (reportFailures === 0) {
	              matchFailed("\"!\"");
	            }
	          }
	          if (result1 !== null) {
	            result2 = parse_identifier();
	            if (result2 !== null) {
	              if (input.charCodeAt(pos.offset) === 61) {
	                result3 = "=";
	                advance(pos, 1);
	              } else {
	                result3 = null;
	                if (reportFailures === 0) {
	                  matchFailed("\"=\"");
	                }
	              }
	              if (result3 !== null) {
	                result4 = parse_squareBracketsValue();
	                if (result4 !== null) {
	                  if (input.charCodeAt(pos.offset) === 93) {
	                    result5 = "]";
	                    advance(pos, 1);
	                  } else {
	                    result5 = null;
	                    if (reportFailures === 0) {
	                      matchFailed("\"]\"");
	                    }
	                  }
	                  if (result5 !== null) {
	                    result0 = [result0, result1, result2, result3, result4, result5];
	                  } else {
	                    result0 = null;
	                    pos = clone(pos1);
	                  }
	                } else {
	                  result0 = null;
	                  pos = clone(pos1);
	                }
	              } else {
	                result0 = null;
	                pos = clone(pos1);
	              }
	            } else {
	              result0 = null;
	              pos = clone(pos1);
	            }
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, event, value) { return { 'event': event, 'value': value }; })(pos0.offset, pos0.line, pos0.column, result0[2], result0[4]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_elemQualifier() {
	        var result0;
	        
	        reportFailures++;
	        result0 = parse_elemId();
	        if (result0 === null) {
	          result0 = parse_elemClass();
	          if (result0 === null) {
	            result0 = parse_elemAttribute();
	            if (result0 === null) {
	              result0 = parse_elemProperty();
	              if (result0 === null) {
	                result0 = parse_elemEventHandler();
	              }
	            }
	          }
	        }
	        reportFailures--;
	        if (reportFailures === 0 && result0 === null) {
	          matchFailed("element qualifier");
	        }
	        return result0;
	      }
	      
	      function parse_element() {
	        var result0;
	        
	        reportFailures++;
	        result0 = parse_implicitElement();
	        if (result0 === null) {
	          result0 = parse_explicitElement();
	        }
	        reportFailures--;
	        if (reportFailures === 0 && result0 === null) {
	          matchFailed("element");
	        }
	        return result0;
	      }
	      
	      function parse_implicitElement() {
	        var result0, result1;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        result1 = parse_elemQualifier();
	        if (result1 !== null) {
	          result0 = [];
	          while (result1 !== null) {
	            result0.push(result1);
	            result1 = parse_elemQualifier();
	          }
	        } else {
	          result0 = null;
	        }
	        if (result0 !== null) {
	          result1 = parse_elementAdditions();
	          if (result1 !== null) {
	            result0 = [result0, result1];
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, qualifiers, additions) { return helpers.createElement('div', qualifiers, additions, line); })(pos0.offset, pos0.line, pos0.column, result0[0], result0[1]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_explicitElement() {
	        var result0, result1, result2;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        result0 = parse_identifier();
	        if (result0 !== null) {
	          result1 = [];
	          result2 = parse_elemQualifier();
	          while (result2 !== null) {
	            result1.push(result2);
	            result2 = parse_elemQualifier();
	          }
	          if (result1 !== null) {
	            result2 = parse_elementAdditions();
	            if (result2 !== null) {
	              result0 = [result0, result1, result2];
	            } else {
	              result0 = null;
	              pos = clone(pos1);
	            }
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, tagName, qualifiers, additions) { return helpers.createElement(tagName, qualifiers, additions, line); })(pos0.offset, pos0.line, pos0.column, result0[0], result0[1], result0[2]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_elementAdditions() {
	        var result0, result1, result2;
	        var pos0, pos1, pos2, pos3;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        pos2 = clone(pos);
	        pos3 = clone(pos);
	        result1 = parse___();
	        if (result1 !== null) {
	          result0 = [];
	          while (result1 !== null) {
	            result0.push(result1);
	            result1 = parse___();
	          }
	        } else {
	          result0 = null;
	        }
	        if (result0 !== null) {
	          result1 = parse_textNode();
	          if (result1 !== null) {
	            result0 = [result0, result1];
	          } else {
	            result0 = null;
	            pos = clone(pos3);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos3);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, t) { return t; })(pos2.offset, pos2.line, pos2.column, result0[1]);
	        }
	        if (result0 === null) {
	          pos = clone(pos2);
	        }
	        result0 = result0 !== null ? result0 : "";
	        if (result0 !== null) {
	          pos2 = clone(pos);
	          pos3 = clone(pos);
	          result2 = parse___();
	          if (result2 !== null) {
	            result1 = [];
	            while (result2 !== null) {
	              result1.push(result2);
	              result2 = parse___();
	            }
	          } else {
	            result1 = null;
	          }
	          if (result1 !== null) {
	            result2 = parse_partial();
	            if (result2 !== null) {
	              result1 = [result1, result2];
	            } else {
	              result1 = null;
	              pos = clone(pos3);
	            }
	          } else {
	            result1 = null;
	            pos = clone(pos3);
	          }
	          if (result1 !== null) {
	            result1 = (function(offset, line, column, p) { return p; })(pos2.offset, pos2.line, pos2.column, result1[1]);
	          }
	          if (result1 === null) {
	            pos = clone(pos2);
	          }
	          result1 = result1 !== null ? result1 : "";
	          if (result1 !== null) {
	            result0 = [result0, result1];
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, t, p) { return { textnode: t, partial: p }; })(pos0.offset, pos0.line, pos0.column, result0[0], result0[1]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_textNode() {
	        var result0;
	        var pos0;
	        
	        reportFailures++;
	        pos0 = clone(pos);
	        result0 = parse_quotedText();
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, text) { return helpers.createTextNode(text, line); })(pos0.offset, pos0.line, pos0.column, result0);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        reportFailures--;
	        if (reportFailures === 0 && result0 === null) {
	          matchFailed("text node");
	        }
	        return result0;
	      }
	      
	      function parse_escapedUnicode() {
	        var result0, result1, result2, result3, result4;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (input.charCodeAt(pos.offset) === 117) {
	          result0 = "u";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\"u\"");
	          }
	        }
	        if (result0 !== null) {
	          if (/^[0-9a-z]/i.test(input.charAt(pos.offset))) {
	            result1 = input.charAt(pos.offset);
	            advance(pos, 1);
	          } else {
	            result1 = null;
	            if (reportFailures === 0) {
	              matchFailed("[0-9a-z]i");
	            }
	          }
	          if (result1 !== null) {
	            if (/^[0-9a-z]/i.test(input.charAt(pos.offset))) {
	              result2 = input.charAt(pos.offset);
	              advance(pos, 1);
	            } else {
	              result2 = null;
	              if (reportFailures === 0) {
	                matchFailed("[0-9a-z]i");
	              }
	            }
	            if (result2 !== null) {
	              if (/^[0-9a-z]/i.test(input.charAt(pos.offset))) {
	                result3 = input.charAt(pos.offset);
	                advance(pos, 1);
	              } else {
	                result3 = null;
	                if (reportFailures === 0) {
	                  matchFailed("[0-9a-z]i");
	                }
	              }
	              if (result3 !== null) {
	                if (/^[0-9a-z]/i.test(input.charAt(pos.offset))) {
	                  result4 = input.charAt(pos.offset);
	                  advance(pos, 1);
	                } else {
	                  result4 = null;
	                  if (reportFailures === 0) {
	                    matchFailed("[0-9a-z]i");
	                  }
	                }
	                if (result4 !== null) {
	                  result0 = [result0, result1, result2, result3, result4];
	                } else {
	                  result0 = null;
	                  pos = clone(pos1);
	                }
	              } else {
	                result0 = null;
	                pos = clone(pos1);
	              }
	            } else {
	              result0 = null;
	              pos = clone(pos1);
	            }
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, a, b, c, d) { return '' + a + b + c + d; })(pos0.offset, pos0.line, pos0.column, result0[1], result0[2], result0[3], result0[4]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_escapedASCII() {
	        var result0, result1, result2;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (input.charCodeAt(pos.offset) === 120) {
	          result0 = "x";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\"x\"");
	          }
	        }
	        if (result0 !== null) {
	          if (/^[0-9a-z]/i.test(input.charAt(pos.offset))) {
	            result1 = input.charAt(pos.offset);
	            advance(pos, 1);
	          } else {
	            result1 = null;
	            if (reportFailures === 0) {
	              matchFailed("[0-9a-z]i");
	            }
	          }
	          if (result1 !== null) {
	            if (/^[0-9a-z]/i.test(input.charAt(pos.offset))) {
	              result2 = input.charAt(pos.offset);
	              advance(pos, 1);
	            } else {
	              result2 = null;
	              if (reportFailures === 0) {
	                matchFailed("[0-9a-z]i");
	              }
	            }
	            if (result2 !== null) {
	              result0 = [result0, result1, result2];
	            } else {
	              result0 = null;
	              pos = clone(pos1);
	            }
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, a, b) { return '' + a + b; })(pos0.offset, pos0.line, pos0.column, result0[1], result0[2]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_escapedCharacter() {
	        var result0, result1;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (input.charCodeAt(pos.offset) === 92) {
	          result0 = "\\";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\"\\\\\"");
	          }
	        }
	        if (result0 !== null) {
	          result1 = parse_escapedUnicode();
	          if (result1 === null) {
	            result1 = parse_escapedASCII();
	            if (result1 === null) {
	              result1 = parse_character();
	            }
	          }
	          if (result1 !== null) {
	            result0 = [result0, result1];
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, c) { return helpers.escapedCharacter(c); })(pos0.offset, pos0.line, pos0.column, result0[1]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_doubleQuotedText() {
	        var result0, result1, result2;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (input.charCodeAt(pos.offset) === 34) {
	          result0 = "\"";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\"\\\"\"");
	          }
	        }
	        if (result0 !== null) {
	          result1 = [];
	          result2 = parse_escapedCharacter();
	          if (result2 === null) {
	            if (/^[^\\\n"]/.test(input.charAt(pos.offset))) {
	              result2 = input.charAt(pos.offset);
	              advance(pos, 1);
	            } else {
	              result2 = null;
	              if (reportFailures === 0) {
	                matchFailed("[^\\\\\\n\"]");
	              }
	            }
	          }
	          while (result2 !== null) {
	            result1.push(result2);
	            result2 = parse_escapedCharacter();
	            if (result2 === null) {
	              if (/^[^\\\n"]/.test(input.charAt(pos.offset))) {
	                result2 = input.charAt(pos.offset);
	                advance(pos, 1);
	              } else {
	                result2 = null;
	                if (reportFailures === 0) {
	                  matchFailed("[^\\\\\\n\"]");
	                }
	              }
	            }
	          }
	          if (result1 !== null) {
	            if (input.charCodeAt(pos.offset) === 34) {
	              result2 = "\"";
	              advance(pos, 1);
	            } else {
	              result2 = null;
	              if (reportFailures === 0) {
	                matchFailed("\"\\\"\"");
	              }
	            }
	            if (result2 !== null) {
	              result0 = [result0, result1, result2];
	            } else {
	              result0 = null;
	              pos = clone(pos1);
	            }
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, chars) { return chars.join(''); })(pos0.offset, pos0.line, pos0.column, result0[1]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_singleQuotedText() {
	        var result0, result1, result2;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (input.charCodeAt(pos.offset) === 39) {
	          result0 = "'";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\"'\"");
	          }
	        }
	        if (result0 !== null) {
	          result1 = [];
	          result2 = parse_escapedCharacter();
	          if (result2 === null) {
	            if (/^[^\\\n']/.test(input.charAt(pos.offset))) {
	              result2 = input.charAt(pos.offset);
	              advance(pos, 1);
	            } else {
	              result2 = null;
	              if (reportFailures === 0) {
	                matchFailed("[^\\\\\\n']");
	              }
	            }
	          }
	          while (result2 !== null) {
	            result1.push(result2);
	            result2 = parse_escapedCharacter();
	            if (result2 === null) {
	              if (/^[^\\\n']/.test(input.charAt(pos.offset))) {
	                result2 = input.charAt(pos.offset);
	                advance(pos, 1);
	              } else {
	                result2 = null;
	                if (reportFailures === 0) {
	                  matchFailed("[^\\\\\\n']");
	                }
	              }
	            }
	          }
	          if (result1 !== null) {
	            if (input.charCodeAt(pos.offset) === 39) {
	              result2 = "'";
	              advance(pos, 1);
	            } else {
	              result2 = null;
	              if (reportFailures === 0) {
	                matchFailed("\"'\"");
	              }
	            }
	            if (result2 !== null) {
	              result0 = [result0, result1, result2];
	            } else {
	              result0 = null;
	              pos = clone(pos1);
	            }
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, chars) { return chars.join(''); })(pos0.offset, pos0.line, pos0.column, result0[1]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_quotedText() {
	        var result0;
	        
	        reportFailures++;
	        result0 = parse_doubleQuotedText();
	        if (result0 === null) {
	          result0 = parse_singleQuotedText();
	        }
	        reportFailures--;
	        if (reportFailures === 0 && result0 === null) {
	          matchFailed("quoted text");
	        }
	        return result0;
	      }
	      
	      function parse_directive() {
	        var result0;
	        
	        reportFailures++;
	        result0 = parse_exprDirective();
	        if (result0 === null) {
	          result0 = parse_simpleDirective();
	        }
	        reportFailures--;
	        if (reportFailures === 0 && result0 === null) {
	          matchFailed("directive");
	        }
	        return result0;
	      }
	      
	      function parse_simpleDirective() {
	        var result0, result1;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (input.charCodeAt(pos.offset) === 64) {
	          result0 = "@";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\"@\"");
	          }
	        }
	        if (result0 !== null) {
	          result1 = parse_identifier();
	          if (result1 !== null) {
	            result0 = [result0, result1];
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, name) { return helpers.createDirective(name, undefined, line); })(pos0.offset, pos0.line, pos0.column, result0[1]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      function parse_exprDirective() {
	        var result0, result1, result2, result3, result4;
	        var pos0, pos1;
	        
	        pos0 = clone(pos);
	        pos1 = clone(pos);
	        if (input.charCodeAt(pos.offset) === 64) {
	          result0 = "@";
	          advance(pos, 1);
	        } else {
	          result0 = null;
	          if (reportFailures === 0) {
	            matchFailed("\"@\"");
	          }
	        }
	        if (result0 !== null) {
	          result1 = parse_identifier();
	          if (result1 !== null) {
	            result3 = parse___();
	            if (result3 !== null) {
	              result2 = [];
	              while (result3 !== null) {
	                result2.push(result3);
	                result3 = parse___();
	              }
	            } else {
	              result2 = null;
	            }
	            if (result2 !== null) {
	              result4 = parse_character();
	              if (result4 !== null) {
	                result3 = [];
	                while (result4 !== null) {
	                  result3.push(result4);
	                  result4 = parse_character();
	                }
	              } else {
	                result3 = null;
	              }
	              if (result3 !== null) {
	                result0 = [result0, result1, result2, result3];
	              } else {
	                result0 = null;
	                pos = clone(pos1);
	              }
	            } else {
	              result0 = null;
	              pos = clone(pos1);
	            }
	          } else {
	            result0 = null;
	            pos = clone(pos1);
	          }
	        } else {
	          result0 = null;
	          pos = clone(pos1);
	        }
	        if (result0 !== null) {
	          result0 = (function(offset, line, column, name, expr) { return helpers.createDirective(name, expr.join(''), line); })(pos0.offset, pos0.line, pos0.column, result0[1], result0[3]);
	        }
	        if (result0 === null) {
	          pos = clone(pos0);
	        }
	        return result0;
	      }
	      
	      
	      function cleanupExpected(expected) {
	        expected.sort();
	        
	        var lastExpected = null;
	        var cleanExpected = [];
	        for (var i = 0; i < expected.length; i++) {
	          if (expected[i] !== lastExpected) {
	            cleanExpected.push(expected[i]);
	            lastExpected = expected[i];
	          }
	        }
	        return cleanExpected;
	      }
	      
	      
	      
	      	var depths = [0];
	      
	      
	      var result = parseFunctions[startRule]();
	      
	      /*
	       * The parser is now in one of the following three states:
	       *
	       * 1. The parser successfully parsed the whole input.
	       *
	       *    - |result !== null|
	       *    - |pos.offset === input.length|
	       *    - |rightmostFailuresExpected| may or may not contain something
	       *
	       * 2. The parser successfully parsed only a part of the input.
	       *
	       *    - |result !== null|
	       *    - |pos.offset < input.length|
	       *    - |rightmostFailuresExpected| may or may not contain something
	       *
	       * 3. The parser did not successfully parse any part of the input.
	       *
	       *   - |result === null|
	       *   - |pos.offset === 0|
	       *   - |rightmostFailuresExpected| contains at least one failure
	       *
	       * All code following this comment (including called functions) must
	       * handle these states.
	       */
	      if (result === null || pos.offset !== input.length) {
	        var offset = Math.max(pos.offset, rightmostFailuresPos.offset);
	        var found = offset < input.length ? input.charAt(offset) : null;
	        var errorPosition = pos.offset > rightmostFailuresPos.offset ? pos : rightmostFailuresPos;
	        
	        throw new this.SyntaxError(
	          cleanupExpected(rightmostFailuresExpected),
	          found,
	          offset,
	          errorPosition.line,
	          errorPosition.column
	        );
	      }
	      
	      return result;
	    },
	    
	    /* Returns the parser source code. */
	    toSource: function() { return this._source; }
	  };
	  
	  /* Thrown when a parser encounters a syntax error. */
	  
	  result.SyntaxError = function(expected, found, offset, line, column) {
	    function buildMessage(expected, found) {
	      var expectedHumanized, foundHumanized;
	      
	      switch (expected.length) {
	        case 0:
	          expectedHumanized = "end of input";
	          break;
	        case 1:
	          expectedHumanized = expected[0];
	          break;
	        default:
	          expectedHumanized = expected.slice(0, expected.length - 1).join(", ")
	            + " or "
	            + expected[expected.length - 1];
	      }
	      
	      foundHumanized = found ? quote(found) : "end of input";
	      
	      return "Expected " + expectedHumanized + " but " + foundHumanized + " found.";
	    }
	    
	    this.name = "SyntaxError";
	    this.expected = expected;
	    this.found = found;
	    this.message = buildMessage(expected, found);
	    this.offset = offset;
	    this.line = line;
	    this.column = column;
	  };
	  
	  result.SyntaxError.prototype = Error.prototype;
	  
	  return result;
	})();
		return pegjsParser;
	}(istComponents.parsehelpers));
	
	istComponents.preprocessor = (function() {
		var newlines = /\r\n|\r|\n/,
			whitespace = /^[ \t]*$/,
			comment = /\/\*((?:\/(?!<\*)|[^\/])*?)\*\//g,
			removeComment, removeWhitespace;
	
		removeComment = function(m, p1) {
			return p1.split(newlines).map(function(l) { return ''; }).join('\n');
		};
	
		removeWhitespace = function(l) {
			return l.match(whitespace) ? "" : l;
		};
	
		/**
		 * Template preprocessor; handle what the parser cannot handle
		 * - Make whitespace-only lines empty
		 * - Remove block-comments (keeping line count)
		 */	
		return function(text) {
			var lines;
	
			// Remove block comments
			text = text.replace(comment, removeComment); 
	
			// Remove everthing from whitespace-only lines
			text = text.split(newlines).map(removeWhitespace).join('\n');
	
			return text;
		};
	}());
	
	istComponents.findscript = (function() {
		return function(id) {
			var i, len, s, found, scripts; 
	
			try {
				scripts = document.querySelectorAll('script#' + id);
			} catch(e) {
				// DOM exception when selector is invalid - no <script> tag with this id
				return;
			}
				
			if (scripts) {
				for (i = 0, len = scripts.length; i < len; i++) {
					s = scripts[i];
					if (s.getAttribute('type') === 'text/x-ist') {
						return s.innerHTML;
					}
				}
			}
			
			return found;
		};
	}());
	
	istComponents.amdplugin = ( function(require, findScriptTag) {
		var pluginify = function(ist) {
			var getXhr, fetchText,
				progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
				buildMap = {};
	
			if (typeof window !== "undefined" && window.navigator && window.document) {
				getXhr = function() {
					var xhr, i, progId;
					if (typeof XMLHttpRequest !== "undefined") {
						return new XMLHttpRequest();
					} else {
						for (i = 0; i < 3; i++) {
							progId = progIds[i];
							try {
								xhr = new ActiveXObject(progId);
							} catch (e) {}
	
							if (xhr) {
								progIds = [progId];  // faster next time
								break;
							}
						}
					}
	
					if (!xhr) {
						throw new Error("getXhr(): XMLHttpRequest not available");
					}
	
					return xhr;
				};
	
				fetchText = function(url, callback) {
					var xhr = getXhr();
					xhr.open('GET', url, true);
					xhr.onreadystatechange = function (evt) {
						//Do not explicitly handle errors, those should be
						//visible via console output in the browser.
						if (xhr.readyState === 4) {
							if (xhr.status !== 200) {
								throw new Error("HTTP status "  + xhr.status + " when loading " + url);
							}
		
							callback(xhr.responseText);
						}
					};
					xhr.send(null);
				};
			} else if (typeof process !== "undefined" && process.versions && !!process.versions.node) {
				fs = require.nodeRequire('fs');
	
				fetchText = function(url, callback) {
					var file = fs.readFileSync(url, 'utf8');
					//Remove BOM (Byte Mark Order) from utf8 files if it is there.
					if (file.indexOf('\uFEFF') === 0) {
						file = file.substring(1);
					}
					callback(file);
				};
			}
	
			ist.write = function (pluginName, name, write) {
				var bmName = 'ist!' + name;
	
				if (buildMap.hasOwnProperty(bmName)) {
					var text = buildMap[bmName];
					write(text);
				}
			};
	
			ist.load = function (name, parentRequire, load, config) {
				var path, dirname, doParse = true;
				
				if (/!bare$/.test(name)) {
					doParse = false;
					name = name.replace(/!bare$/, '');
				}
				
				path = parentRequire.toUrl(name + '.ist'),
				dirname = name.indexOf('/') === -1 ? '.' : name.replace(/\/[^\/]*$/, '');
	
				fetchText(path, function (text) {
					var code, i, m, deps = ['ist'];
		
					/* Find @include calls and replace them with 'absolute' paths
						(ie @include 'inc/include' in 'path/to/template'
						becomes @include 'path/to/inc/include')
						while recording all distinct include paths
					 */
						 
					text = text.replace(/^(\s*)@include\s+(?:text=)?(['"])((?:(?=(\\?))\4.)*?)\2/gm,
						function(m, p1, p2, p3) {
							if (!findScriptTag(p3)) {
								var dpath = dirname + '/' + p3.replace(/\.ist$/, '');
				
								if (deps.indexOf('ist!' + dpath) === -1) {
									deps.push('ist!' + dpath);
								}
				
								return p1 + '@include "' + dpath + '"';
							} else {
								// Script tag found, do not change directive
								return m;
							}
						});
					
					if (doParse) {
						/* Get parsed code */
						code = ist(text, name).getCode(false);
						text = "define('ist!" + name + "'," + JSON.stringify(deps) + ", function(ist) {\n" +
							"  return " + code + ";\n" +
							"});\n";
					} else {
						if (config.isBuild) {
							text = jsEscape(text);		
							text = "define('ist!" + name + "'," + JSON.stringify(deps) + ",function(ist){" +
								"var template='" + text + "';" +
								"return ist(template,'" + name + "');" +
								"});";
						} else {
							/* "Pretty-print" template text */
							text = jsEscape(text).replace(/\\n/g, "\\n' +\n\t               '");
							text = "define('ist!" + name + "'," + JSON.stringify(deps) + ", function(ist){ \n" +
								"\tvar template = '" + text + "';\n" +
								"\treturn ist(template, '" + name + "');\n" +
								"});\n";
						}
					}
	
					//Hold on to the transformed text if a build.
					if (config.isBuild) {
						buildMap['ist!' + name] = text;
					}
	
					//IE with conditional comments on cannot handle the
					//sourceURL trick, so skip it if enabled.
					/*@if (@_jscript) @else @*/
					if (!config.isBuild) {
						text += "\r\n//@ sourceURL=" + path;
					}
					/*@end@*/
		
					load.fromText('ist!' + name, text);
	
					// Finish loading and give result to load()
					parentRequire(['ist!' + name], function (value) {
						load(value);
					});
				});
			};
		};
		
		return pluginify;
	}(istComponents.require, istComponents.findscript));
	
	istComponents.ist = ( function(Template, directives, pegjsParser, preprocess, pluginify, findScriptTag) {
		var ist;
		
		/**
		 * Template parser
		 */
		ist = function(template, name) {
			var parsed;
			
			name = name || '<unknown>';
			
			try {
				parsed = pegjsParser.parse(preprocess(template));
			} catch(e) {
				e.message += " in '" + name + "' on line " + e.line +
					(typeof e.column !== 'undefined' ?  ", character " + e.column : '');
				throw e;
			}
			
			return new Template(name, parsed);
		};
		
		ist.Template = Template;
		
		ist.pushScope = function(scope) {
			scopeCount++;
			
			scopeObject = Object.create(scopeObject);
			Object.keys(scope).forEach(function(key) {
				scopeObject[key] = scope[key];
			});
		};
			
		ist.popScope = function() {
			if (scopeCount === 0) {
				throw new Error("No scope left to pop out");
			}
			
			scopeCount--;
			scopeObject = Object.getPrototypeOf(scopeObject);
		};
		
		/**
		 * Node creation interface
		 * Creates nodes with IST template syntax
		 *
		 * Several nodes can be created at once using angle brackets, eg.:
		 *   ist.createNode('div.parent > div#child > "text node")
		 *
		 * Supports context variables and an optional alternative document.
		 * Does not support angle brackets anywhere else than between nodes.
		 * 
		 * Directives are supported ("div.parent > @each ctxVar > div.child")
		 */
		ist.createNode = function(branchSpec, context, doc) {
			var nodes = branchSpec.split('>').map(function(n) { return n.trim(); }),
				indent = '',
				template = '',
				rendered;
		
			nodes.forEach(function(nodeSpec) {
				template += '\n' + indent + nodeSpec;
				indent += ' ';
			});
		
			rendered = ist(template).render(context, doc);
			return rendered.childNodes.length === 1 ? rendered.firstChild : rendered;
		};
	
		/**
		 * <script> tag template parser
		 */
		ist.fromScriptTag = function(id) {
			var template = findScriptTag(id);
			
			if (template) {
				return ist(template);
			}
		};
	
	
		/**
		 * IST helper block registration; allows custom iterators/helpers that will
		 * be called with a new context.
		 */
		ist.registerHelper = function(name, helper) {
			directives.register(name, helper);
		};
		
		
		/* Built-in @include helper */
		ist.registerHelper("include", function(ctx, tmpl, fragment) {
			var what = ctx.value.replace(/\.ist$/, ''),
				scripts, found, tryReq;
	
			// Try to find a <script type="text/x-ist" id="...">
			found = findScriptTag(what);
	
			if (isAMD)
			{
				// Try to find a previously require()-d template or string
				tryReq = [
					what,
					what + '.ist',
					'ist!' + what,
					'text!' + what + '.ist'
				];
	
				while (!found && tryReq.length) {
					try {
						found = requirejs(tryReq.shift());
					} catch(e) {
						// Pass
					}
				}
			}
	
			if (!found) {
				throw new Error("Cannot find included template '" + what + "'");
			}
	
			if (typeof found === 'string') {
				// Compile template
				found = ist(found, what);
			}
	
			if (typeof found.render === 'function') {
				// Render included template
				if (fragment.hasChildNodes) {
					found.update(this, fragment);
				} else {	
					fragment.appendChild(found.render(this));
				}
			} else {
				throw new Error("Invalid included template '" + what + "'");
			}
		});
		
	
		if (isAMD) {
			pluginify(ist);
		}
		
		return ist;
	}(
		istComponents.template,
		istComponents.directives,
		istComponents.parser,
		istComponents.preprocessor,
		istComponents.amdplugin,
		istComponents.findscript
	));
		
	if (isAMD) {
		global.define(function() { return istComponents.ist; });
	} else {
		previous = global.ist;
		
		global.ist = istComponents.ist;
		global.ist.noConflict = function() {
			global.ist = previous;
			return istComponents.ist;
		};
		
	}
}(this)); 
