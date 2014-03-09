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


	/* Build and URI from an argument list, optionnally extracting
	 * additional arguments.
	 *
	 * Returns an object with an 'uri' key, which is the first element
	 * in 'args' with each instance of '%s' replaced by url-encoding an
	 * additional element in 'args'.
	 *
	 * For each key name in 'names', an additional element is taken from
	 * 'args' and added to the returned object.
	 *
	 * Example:
	 *  getArguments(['/path/to/%s', 'foo bar', 'baz'], ['arg'])
	 *  returns { uri: '/path/to/foo%20bar', arg: 'baz' }
	 *
	 */
	function getArguments(args, names) {
		args = [].slice.call(args);

		var ret = {
				uri: args.shift().replace(/%s/g, function() {
					return encodeURIComponent(args.shift());
				})
			};

		(names || []).forEach(function(name) {
			ret[name] = args.shift();
		});

		return ret;
	}


	function addQueryString(uri, querystring) {
		if (Object.keys(querystring || {}).length) {
			uri += "?" + Object.keys(querystring).map(function(param) {
				return param + "=" + encodeURIComponent(querystring[param]);
			}).join("&");
		}

		return "/rest/" + uri;
	}


	var rest = {
		list: function(/* uri[, uri params][, options] */) {
			var args = getArguments(arguments, ["options"]);

			var querystring = {};
			args.options = args.options || {};

			if ("skip" in args.options) {
				querystring.skip = args.options.skip;
			}

			if ("limit" in args.options) {
				querystring.limit = args.options.limit;
			}

			if ("query" in args.options) {
				querystring.query = args.options.query;
			}

			var d = when.defer();

			request.get(addQueryString(args.uri, querystring))
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
		incremental: function(/* uri[, uri params][, query][, limit] */) {
			var args = getArguments(arguments, ["query", "limit"]);

			var loading, count,
				rejected = false,
				d = when.defer(),
				rest = this,
				offset = 0,
				options;

			if (typeof args.limit === "undefined" && typeof args.query === "number") {
				args.limit = args.query;
				args.query = "";
			}

			options = { query: args.query || "" };

			if (typeof args.limit !== "undefined") {
				options.limit = args.limit;
			}


			function more() {
				if (rejected || loading || count === offset) {
					return;
				}

				loading = true;

				options.skip = offset;
				rest.list(args.uri, options)
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

		get: function(/* uri[, uri params][, querystring] */) {
			var args = getArguments(arguments, ["querystring"]);

			return request.get(addQueryString(args.uri, args.querystring));
		},

		put: function(/* uri[, uri params][, querystring], data */) {
			var args = getArguments(arguments, ["querystring", "data"]);

			if (!args.data) {
				args.data = args.querystring;
				args.querystring = null;
			}

			return request.put(addQueryString(args.uri, args.querystring), args.data);
		},

		patch: function(/* uri[, uri params][, querystring], data */) {
			var args = getArguments(arguments, ["querystring", "data"]);

			if (!args.data) {
				args.data = args.querystring;
				args.querystring = null;
			}

			return request.patch(addQueryString(args.uri, args.querystring), args.data);
		},

		post: function(/* uri[, uri params][, querystring], data */) {
			var args = getArguments(arguments, ["querystring", "data"]);

			if (!args.data) {
				args.data = args.querystring;
				args.querystring = null;
			}

			return request.post(addQueryString(args.uri, args.querystring), args.data);
		},

		del: function(/* uri[, uri params][, querystring] */) {
			var args = getArguments(arguments, ["querystring"]);
			return request.del(addQueryString(args.uri, args.querystring));
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