/*jshint browser:true */
/*global require, define */

define(["require", "when", "rest"], function(mainRequire, when, rest) {
	"use strict";
	
	return function(ui, router, storage) {
		var globalModules = ["ist", "when", "rest", "dom"];
		var pluginPublished = {};
		
		
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
					}
				};


				when.map(plugins, function(plugin) {
					var pluginDeferred = when.defer();
					
					/* Prepare plugin-specific require */
					var pluginRequire = require.config({
						context: plugin,
						baseUrl: "plugins/" + plugin + "/js",
						paths: {
							"templates": "../templates"
						}
					});

					/* Predefine global libraries */
					globalModules.forEach(function(module, index) {
						define(module, function() { return args[index]; });
					});

					/* Predefine plugin interface modules */
					Object.keys(pluginInterface).forEach(function(module) {
						define(module, function() { return pluginInterface[module](plugin); });
					});

					/* Add public plugin access */
					define("plugins", function() { return pluginPublished; });

					/* Load plugin */
					pluginRequire(["index-built"], function() {
						pluginRequire(["index"], function(pluginManifest) {
							pluginManifest.name = plugin;
							pluginDeferred.resolve(pluginManifest);

							if (pluginManifest.public) {
								pluginPublished[plugin] = pluginManifest.public;
							}
						}, function(err) {
							pluginDeferred.reject(err);
						});
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