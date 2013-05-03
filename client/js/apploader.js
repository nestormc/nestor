/*jshint browser:true */
/*global require, define, $, $$ */

define(["when", "rest"], function(when, rest) {
	return function() {
		var deferred = when.defer(),
			iface = {
				rest: rest
			};
		
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
					return when(apps[name].init(iface));
				}).then(function() {
					deferred.resolve(apps);
				});
			});
		});
			
		return deferred.promise;
	};
});