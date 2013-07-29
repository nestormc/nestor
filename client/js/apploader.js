/*jshint browser:true */
/*global require, define, $, $$ */

define(["when", "rest"], function(when, rest) {
	"use strict";
	
	return function(ui, router) {
		var deferred = when.defer(),
			iface = {
				rest: rest
			};
		
		
		function createAppInterface(appname) {
			return {
				rest: rest,
				router: router.subRouter(appname),
				ui: ui.subUI(appname)
			};
		}
		
		
		/* List available apps */
		rest("clientApps").list({ fields: ["name"], limit: 0 })
		.then(function(apps) {
			var names = apps._items.map(function(item) { return item.name; });
		
			/* Load app modules */
			require(names.map(function(app) { return "apps/" + app; }), function() {
				var args = [].slice.call(arguments),
					apps = {};
				
				names.forEach(function(name, index) {
					apps[name] = args[index];
				});
				
				/* Initialize apps */
				when.map(names, function(name) {
					return when(apps[name].init(createAppInterface(name)));
				}).then(function() {
					deferred.resolve(apps);
				}).otherwise(function(err) {
					deferred.reject(err);
				});
			});
		}).otherwise(function(err) {
			deferred.reject(err);
		});
		
		return deferred.promise;
	};
});