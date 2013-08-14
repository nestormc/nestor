/*jshint browser:true */
/*global require, define, $, $$ */

define([], function() {
	"use strict";
	
	var hashchange, popstate, router,
		routes = {};
	

	var getRouteParameter = (function() {
		var rxPlus = /\+/g,
			rxRoute = /route=([^&]*)/;

		function decode(str) {
			return decodeURIComponent(str.replace(rxPlus, " "));
		}

		return function() {
			var query = location.search.substring(1),
				match = rxRoute.exec(query);

			if (match) {
				return decode(match[1]);
			}
		};
	}());

	
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
		 * @memberof router
		 */
		start: function() {
			var self = this;
				
			if (!hashchange) {
				hashchange = function(e) {
					e.preventDefault();

					var route = location.hash.substr(1);

					// Turn hash into a route query parameter
					history.replaceState(null, null, "?route=" + route);

					self.navigateTo(route);

					return false;
				};
				
				addEventListener("hashchange", hashchange, false);
			}

			if (!popstate) {
				popstate = function() {
					var route = getRouteParameter();

					if (route && route.length > 0) {
						self.navigateTo(route);
					}
				};

				addEventListener("popstate", popstate, false);
			}

			var route = getRouteParameter();
			
			if (route && route.length > 0) {
				this.navigateTo(route);
			}
		},
		
		
		/**
		 * Stop listening to hashchange events and reset router configuration
		 */
		reset: function() {
			routes = {};
			
			if (hashchange) {
				removeEventListener("hashchange", hashchange, false);
				hashchange = null;
			}

			if (popstate) {
				removeEventListener("popstate", popstate, false);
				popstate = null;
			}
			
			history.replaceState(null, null, "?");
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