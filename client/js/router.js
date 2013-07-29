/*jshint browser:true */
/*global require, define, $, $$ */

define([], function() {
	"use strict";
	
	var listener, router,
		routes = {};
	
	
	/**
	 * Try to match a hash to a route
	 *
	 * Return an object with route parameter values when the route matches
	 * 
	 * @param {Object} route route definition
	 * @param {String} hash location hash
	 * @return {Object|undefined} 
	 * @private
	 */
	function matchRoute(route, hash) {
		var re = route.regexp,
			vars = route.vars,
			ret = re.exec(hash),
			params = {};
		
		if (ret) {
			// Remove first element (full regexp match)
			ret.shift();
			
			ret.forEach(function(value, index) {
				if (typeof vars[index] !== "undefined") {
					params[vars[index]] = value;
				}
			});
			
			return params;
		}
	}
	
	
	/* Public interface */
	router = {
		/**
		 * Start listening to hashchange events
		 *
		 * Uses window.onhashchange if available, else falls back to polling
		 * location.hash for changes every 50ms
		 *
		 * @memberof router
		 */
		start: function() {
			var oldhash,
				self = this;
				
			if (!listener) {
				if (typeof onhashchange !== "undefined") {
					listener = function() {
						self.navigateTo(location.hash.substr(1));
					};
					
					addEventListener("hashchange", listener, false);
				} else {
					oldhash = location.hash;
					listener = setInterval(function() {
						if (location.hash !== oldhash) {
							oldhash = location.hash;
							self.navigateTo(location.hash.substr(1));
						}
					}, 50);
				}
			}
			
			if (location.hash.length > 0) {
				this.navigateTo(location.hash.substr(1));
			}
		},
		
		
		/**
		 * Stop listening to hashchange events and reset router configuration
		 */
		reset: function() {
			routes = {};
			
			if (listener) {
				if (typeof onhashchange !== "undefined") {
					removeEventListener("hashchange", listener, false);
				} else {
					clearInterval(listener);
				}
				
				listener = null;
			}
			
			this.set("");
		},
		
		
		/**
		 * Navigate to a specific hash
		 *
		 * @param {String} hash hash to navigate to
		 */
		navigateTo: function(hash) {
			var routeStrings = Object.keys(routes),
				currentRoute = -1,
				req = { route: hash },
				currentHandler, route;
				
			
			function nextRoute(err) {
				do {
					currentRoute++;
					route = routes[routeStrings[currentRoute]];
				
					if (route) {
						req.match = matchRoute(route, hash);
						if (req.match) {
							currentHandler = -1;
							nextHandler(err);
						}
					}
				} while (route && !req.match);
			}
			
			function nextHandler(err) {
				var handler;
				currentHandler++;
				
				handler = route.handlers[currentHandler];
				
				if (handler) {
					try {
						handler.call(null, err, req, nextHandler);
					} catch(e) {
						nextHandler(e);
					}
				} else {
					nextRoute(err);
				}
			}
			
			nextRoute();
		},
		
		
		set: function(hash) {
			window.location = "#" + hash;
		},
		
		
		/**
		 * Register a route handler
		 *
		 * @param {String} route route specification
		 * @param {Function} handler route handler
		 */
		on: function(route, handler) {
			if (!routes[route]) {
				var vmatch = route.match(/:[^\/]+/g);
				
				routes[route] = {
					vars: vmatch ? vmatch.map(function(v) { return v.substr(1); }) : [],
					regexp: new RegExp("^" + route.replace(/:[^\/]+/g, "([^\\/]+)").replace(/\*$/, ".*") + "$"),
					handlers: []
				};
			}
			
			routes[route].handlers.push(handler);
		},
		
		
		/**
		 * Create a router that can only manipulate routes starting with "/prefix/"
		 *
		 * @param {String} prefix router prefix
		 * @return router
		 */
		subRouter: function(prefix) {
			var sub = Object.create(router);
			
			// Remove leading/trailing slashes
			prefix = prefix.replace(/^\//, "").replace(/\/$/, "");
			
			sub.on = function(route, handler) {
				router.on("/" + prefix + "/" + route.replace(/^\//, ""), handler);
			};
			
			return sub;
		}
	};
	
	return router;
});