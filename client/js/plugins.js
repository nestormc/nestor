/*jshint browser:true */
/*global require, define */

define(["require", "when", "rest", "settings/shares"], function(mainRequire, when, rest, shares) {
	"use strict";
	
	return function(ui, router, storage) {
		var globalModules = ["ist", "when", "rest", "dom"];
		
		
		/* List available plugins */
		return rest.list("plugins", { limit: 0 })
		.then(function(plugins) {
			var deferred = when.defer();

			mainRequire(globalModules, function() {
				var args = [].slice.call(arguments);

				var pluginInterface = {
					router: function(plugin) {
						return router.subRouter(plugin);
					},

					storage: function(plugin) {
						return storage.subStorage(plugin);
					},

					ui: function(plugin) {
						return ui.pluginUI(plugin);
					},

					share: function(plugin) {
						return shares.getShareInterface(plugin);
					}
				};


				when.map(plugins, function(plugin) {
					var pluginDeferred = when.defer();
					
					/* Prepare plugin-specific require */
					var pluginConfig = {
						context: plugin,
						baseUrl: "plugins/" + plugin + "/js",
						paths: {
							"templates": "../templates"
						},
						define: {}
					};

					/* Predefine global libraries */
					globalModules.forEach(function(module, index) {
						pluginConfig.define[module] = args[index];
					});

					/* Predefine plugin interface modules */
					Object.keys(pluginInterface).forEach(function(module) {
						pluginConfig.define[module] = pluginInterface[module](plugin);
					});

					var pluginRequire = require.config(pluginConfig);

					/* Load plugin */
					pluginRequire(["index"], function(pluginManifest) {
						pluginManifest.name = plugin;
						pluginDeferred.resolve(pluginManifest);
					}, function(err) {
						pluginDeferred.reject(err);
					});

					return pluginDeferred.promise;
				}).then(function(pluginManifests) {
					deferred.resolve(pluginManifests);
				}).otherwise(function(err) {
					deferred.reject(err);
				});
			});

			return deferred.promise;
		});
	};
});