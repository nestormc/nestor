/*jshint browser:true */
/*global require, define */

define(["require", "when", "rest", "settings/shares"], function(mainRequire, when, rest, shares) {
	"use strict";
	
	return function(ui, router, storage) {
		var deferred = when.defer(),
			globalModules = ["ist", "when", "rest", "dom"];
		
		
		/* List available plugins */
		rest.list("plugins", { limit: 0 })
		.then(function(plugins) {
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
						return ui.subUI(plugin);
					},

					share: function(plugin) {
						return shares.getShareInterface(plugin);
					}
				};


				var pluginModules = {};

				var loadPromises = plugins.map(function(plugin) {
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
					pluginRequire(["index"], function(pluginModule) {
						pluginModules[plugin] = pluginModule;

						when(pluginModule.init())
						.then(function() {
							pluginDeferred.resolve();
						})
						.otherwise(function(err) {
							pluginDeferred.reject(err);
						});
					});

					return pluginDeferred.promise;
				});

				// There must be a way to make this prettier
				when.all(loadPromises)
				.then(function() {
					deferred.resolve(pluginModules);
				})
				.otherwise(function(err) {
					deferred.reject(err);
				});
			});
		})
		.otherwise(function(err) {
			deferred.reject(err);
		});
		
		return deferred.promise;
	};
});