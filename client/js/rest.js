/*jshint browser:true */
/*global require, define, CryptoJS */

define(["when"], function(when, md5) {
	"use strict";
	
	var rest, request, onStateChange,
		resources = {},
		status = {
			user: null,
			salt: null
		};
		
	
	/**
	 * State change handler for request()'s XMLHttpRequest object
	 * Takes a deferred as an argument, and resolves it with the
	 * parsed request JSON result, or rejects it when an error
	 * occurs.
	 */
	onStateChange = function(deferred) {
		if (this.readyState !== 4) {
			return;
		}
		
		if (this.status === 200) {
			try {
				var obj = JSON.parse(this.responseText);
				deferred.resolve(obj);
			} catch(e) {
				deferred.reject(e);
			}
		} else if (this.status === 204) {
			// No content
			deferred.resolve();
		} else {
			deferred.reject(new Error("HTTP " + this.status));
		}
		
		this.onreadystatechange = null;
		this.abort();
	};
	
	
	/**
	 * JSON ajax request helper
	 *
	 * @param {String} method request method; case-insensitive, maps 'del' to 'delete'
	 * @param {String} uri request URI
	 * @param {Object} [data] request data
	 * @return {Promise}
	 */
	request = function(method, uri, data) {
		var xhr = new XMLHttpRequest(),
			deferred = when.defer();
			
		if (method.toUpperCase() === 'DEL') {
			method = 'DELETE';
		}
			
		xhr.onreadystatechange = onStateChange.bind(xhr, deferred);
		xhr.open(method.toUpperCase(), uri, true);
		
		if ('object' === typeof data) {
			xhr.setRequestHeader("Content-Type", "application/json");
			data = JSON.stringify(data);
		}
		
		try {
			xhr.send(data || null);
		} catch(e) {
			deferred.reject(e);
		}
		
		return deferred.promise;
	};
	
	
	/**
	 * JSON ajax request method-specific helpers:
	 *   request.get
	 *   request.head
	 *   request.post
	 *   request.put
	 *   request.del
	 *   request.delete
	 */
	'get head post put del delete'.split(' ').forEach(function(method) {
		request[method] = request.bind(null, method);
	});
	
	
	rest = function(name) {
		var makeQueryParameter;
		
		makeQueryParameter = function(key) {
			return key + "=" + encodeURIComponent(this[key]);
		};
		
		if (!resources[name]) {
			resources[name] = {
				list: function(options) {
					var query;
					
					if (options) {
						query = Object.keys(options).map(makeQueryParameter.bind(options)).join('&');
					}
					
					return request.get('/rest/' + name + (query ? "?" + query : ""));
				},
				
				get: function(id, options) {
					var query;
					
					if (options) {
						Object.keys(options).map(makeQueryParameter.bind(options)).join('&');
					}
					
					return request.get('/rest/' + name + '/' + id + (query ? "?" + query : ""));
				},
				
				create: function(data) {
					return request.post('/rest/' + name, data);
				},
				
				update: function(id, data) {
					return request.put('/rest/' + name + '/' + id, data);
				},
				
				remove: function(id) {
					return request.del('/rest/' + name + '/' + id);
				},
				
				purge: function() {
					return request.del('/rest/' + name);
				},
				
				lister: function() {
					var resource = this;
					
					return {
						count: 0,
						
						more: function(options) {
							var lister = this;
							
							options = options || {};
							options.skip = lister.count;
							
							return resource.list(options).then(function(results) {
								lister.count += results._items.length;
								return when.resolve(results);
							});
						}
					};
				}
			};
		}
		
		return resources[name];
	};
	
	rest.loginStatus = function() {
		return rest('login').list().then(function(result) {
			status.user = result.user || null;
			status.salt = result.salt || null;
			
			return result.user;
		});
	};
		
	rest.login = function(user, password) {
		if (user === 'admin') {
			// Admin password: lowercase and remove spaces
			password = password.toLowerCase().replace(/ /g, '');
		}
		
		return rest('login').create({
			user: user,
			password: CryptoJS.HmacSHA1(password, status.salt).toString()
		}).then(function(result) {
			status.user = result.user || null;
			return status.user;
		});
	};
		
	rest.logout = function() {
		status.user = null;
		
		return rest('login').purge().then(function() {
			// Call status to refresh salt
			rest.loginStatus();
			return;
		});
	};
	
	rest.resource = rest;
	return rest;
});