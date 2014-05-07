/*jshint browser:true */
/*global define */

define(["dom"], function(dom) {
	"use strict";

	var click, popstate, router, currentRoute,
		rxInitialBang = /^!/,
		rxInitialSlash = /^\//,
		rxFinalSlash = /\/$/,
		rxFinalStar = /\*$/,
		rxAllColonVariables = /:[^\/]+/g,
		routes = {},
		actions = {};


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
			} else {
				var path = location.pathname;
				if (path !== "/") {
					return path;
				}
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
					params[vars[index]] = decodeURIComponent(value);
				}
			});

			return params;
		}
	}


	/* Public interface */
	var subRouters = {};

	router = {
		/**
		 * Update location to get rid of ?route= parameter if present
		 */
		updateLocation: function() {
			var route = getRouteParameter();
			if (route) {
				history.replaceState(null, null, route);
			}
		},

		/**
		 * Start listening to hashchange events
		 *
		 * @memberof router
		 */
		start: function() {
			if (!click) {
				/* Setup capture click handler to handle click on any links */
				click = function(e) {
					// Find <a> element that was clicked on
					var link = dom.$P(e.target, "a[href]", true);
					if (!link) {
						return;
					}

					// getAttribute to avoid getting the full URL
					var href = link.getAttribute("href");

					if (href === "#") {
						e.preventDefault();
						return false;
					}

					if (href.indexOf("#") === 0) {
						var path = href.substr(1);

						e.preventDefault();

						if (path[0] !== "!") {
							// Regular (non-action) route path, push history state
							history.pushState(null, null, path);
						}

						router.navigateTo(path);

						return false;
					}
				};

				addEventListener("click", click, true);
			}

			if (!popstate) {
				popstate = function(e) {
					var route = getRouteParameter();

					if (route && route.length > 0) {
						router.navigateTo(route, e.state);
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
			actions = {};
			currentRoute = undefined;

			if (click) {
				removeEventListener("click", click, true);
				click = null;
			}

			if (popstate) {
				removeEventListener("popstate", popstate, false);
				popstate = null;
			}

			history.replaceState(null, null, "/");
		},



		/**
		 * Navigate to a specific hash
		 *
		 * @param {String} hash hash to navigate to
		 * @param state history state
		 */
		navigateTo: function(path, state) {
			var isAction = path[0] === "!",
				store = isAction ? actions : routes,
				routeStrings = Object.keys(store),
				routeIndex = -1,
				req = { path: path, state: state },
				currentHandler, route;


			if (isAction) {
				path = path.replace(rxInitialBang, "/");
			} else {
				if (currentRoute === path) {
					return;
				}

				currentRoute = path;
			}


			function nextRoute(err) {
				do {
					routeIndex++;
					route = store[routeStrings[routeIndex]];

					if (route) {
						req.match = matchRoute(route, path);
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
			var isAction = route[0] === "!",
				store = isAction ? actions : routes;

			if (isAction) {
				route = route.replace(rxInitialBang, "/");
			}

			if (!store[route]) {
				var vmatch = route.match(rxAllColonVariables);

				store[route] = {
					vars: vmatch ? vmatch.map(function(v) { return v.substr(1); }) : [],
					regexp: new RegExp("^" + route.replace(rxAllColonVariables, "([^\\/]+)").replace(rxFinalStar, ".*") + "$"),
					handlers: []
				};
			}

			store[route].handlers.push(handler);
		},


		/**
		 * Create a router that can only manipulate routes starting with "/prefix/"
		 *
		 * @param {String} prefix router prefix
		 * @return router
		 */
		subRouter: function(prefix) {
			if (!(prefix in subRouters)) {
				var sub = Object.create(router);

				// Remove leading/trailing slashes
				prefix = prefix.replace(rxInitialSlash, "").replace(rxFinalSlash, "");

				sub.on = function(route, handler) {
					var prefixedRoute;

					if (route[0] === "!") {
						prefixedRoute = "!" + prefix + "/" + route.replace(rxInitialBang, "");
					} else {
						prefixedRoute = "/" + prefix + "/" + route.replace(rxInitialSlash, "");
					}

					router.on(prefixedRoute, handler);
				};

				subRouters[prefix] = sub;
			}

			return subRouters[prefix];
		}
	};

	return router;
});