/*jshint browser:true */
/*global require, define, $, $$ */

define(["when", "rest"], function(when, rest) {
	"use strict";
	
	return function(ui, router) {
		var deferred = when.defer();
		
		
		function createAppInterface(appname) {
			return {
				rest: rest,
				router: router.subRouter(appname),
				ui: ui.subUI(appname)
			};
		}
		
		
		/* List available apps */
		rest.list("clientApps", { limit: 0 }, function(err, apps) {
			if (err) {
				deferred.reject(err);
			} else {
				var names = apps.map(function(item) { return item.name; });
			
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
			}
		});
		
		return deferred.promise;
	};
});