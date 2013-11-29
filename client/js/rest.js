/*jshint browser:true */
/*global define */

define(["ajax", "when", "signals"], function(ajax, when, signals) {
	"use strict";

	
	var restAvailable = false,
		pendingRequests = [];


	/**
	 * JSON ajax request helper
	 *
	 * @param {String} method request method; case-insensitive, maps "del" to "delete"
	 * @param {String} uri request URI
	 * @param {Object} [data] request data
	 */
	function request(method, uri, data, d) {
		d = d || when.defer();

		if (!restAvailable) {
			pendingRequests.push({
				method: method,
				uri: uri,
				data: data,
				deferred: d
			});
		} else {
			ajax.json(method, uri, data)
			.then(function(json) {
				d.resolve(json);
			})
			.otherwise(function(err) {
				console.log("=== REST ERROR on " + method + " " + uri + " ===");
				console.error(err.stack);
				d.reject(err);
			});
		}

		return d.promise;
	}
	
	
	/**
	 * JSON ajax request method-specific helpers:
	 *   request.get
	 *   request.head
	 *   request.patch
	 *   request.post
	 *   request.put
	 *   request.del
	 */
	"get post put patch del".split(" ").forEach(function(method) {
		request[method] = request.bind(null, method);
	});


	function makeURI(uri, querystring) {
		if (Object.keys(querystring || {}).length) {
			uri += "?" + Object.keys(querystring).map(function(param) {
				return param + "=" + encodeURIComponent(querystring[param]);
			}).join("&");
		}

		return "/rest/" + uri;
	}


	var rest = {
		list: function(uri, options) {
			var querystring = {};
			options = options || {};

			if ("skip" in options) {
				querystring.skip = options.skip;
			}

			if ("limit" in options) {
				querystring.limit = options.limit;
			}

			if ("query" in options) {
				querystring.query = options.query;
			}

			var d = when.defer();

			request.get(makeURI(uri, querystring))
			.then(function(result) {
				var items = result._items;
					items.totalCount = result._count;

				d.resolve(items);
			})
			.otherwise(function(err) {
				d.reject(err);
			});

			return d.promise;
		},


		/* Incremental collection fetching helper
		 *
		 * Returns a promise that is fulfilled when the whole collection has been fetched.
		 * The promise sends progress updates when items arrive, and has three additional
		 * methods:
		 *   .whenData(fn) is a shortcut to .then(undefined, undefined, fn)
		 *   .fetchMore() triggers fetching a new batch of items
		 *   .cancel() prevents any further progress updates and resolves the promise immediately
		 * 
		 * fetchMore is called once before returning, so you should wait for the first
		 * progress update before calling it again.  Calling it either when items are pending
		 * or after the promise has been fulfilled or rejected has no effect.
		 */
		incremental: function(uri, query, limit) {
			var loading, count,
				rejected = false,
				d = when.defer(),
				rest = this,
				offset = 0,
				options;

			if (typeof limit === "undefined" && typeof query === "number") {
				limit = query;
				query = "";
			}

			options = { query: query || "" };

			if (typeof limit !== "undefined") {
				options.limit = limit;
			}


			function more() {
				if (rejected || loading || count === offset) {
					return;
				}

				loading = true;

				options.skip = offset;
				rest.list(uri, options)
				.then(function(result) {
					loading = false;

					count = result.totalCount;
					offset += result.length;

					d.notify(result);

					if (count === offset) {
						// Finished loading
						d.resolve();
					}
				})
				.otherwise(function(err) {
					loading = false;
					rejected = true;
					d.reject(err);
				});
			}

			more();

			var promise = d.promise;
			promise.fetchMore = more;
			promise.whenData = function(fn) {
				return promise.then(undefined, undefined, fn);
			};
			promise.cancel = function() {
				count = offset;
				d.resolve();
			};

			return promise;
		},

		get: function(uri, querystring) {
			return request.get(makeURI(uri, querystring));
		},

		put: function(uri, querystring, data) {
			if (!data) {
				data = querystring;
				querystring = null;
			}

			return request.put(makeURI(uri, querystring), data);
		},

		patch: function(uri, querystring, data) {
			if (!data) {
				data = querystring;
				querystring = null;
			}

			return request.patch(makeURI(uri, querystring), data);
		},

		post: function(uri, querystring, data) {
			if (!data) {
				data = querystring;
				querystring = null;
			}

			return request.post(makeURI(uri, querystring), data);
		},

		del: function(uri, querystring) {
			return request.del(makeURI(uri, querystring));
		},

		stop: function() {
			restAvailable = false;
		},

		start: function() {
			restAvailable = true;

			pendingRequests.forEach(function(r) {
				request(r.method, r.uri, r.data, r.deferred);
			});

			pendingRequests = [];
		}
	};

	return rest;
});