/*jshint browser:true */
/*global require, define */

define(["require", "when", "rest", "settings/shares"], function(mainRequire, when, rest, shares) {
	"use strict";
	
	return function(ui, router, storage) {
		var deferred = when.defer(),
			nestorAppModules = ["ist", "when", "rest", "dom"];
		
		
		/* List available apps */
		rest.list("clientApps", { limit: 0 })
		.then(function(apps) {
			mainRequire(nestorAppModules, function() {
				var args = [].slice.call(arguments);

				var appInterface = {
					router: function(app) {
						return router.subRouter(app);
					},

					storage: function(app) {
						return storage.subStorage(app);
					},

					ui: function(app) {
						return ui.subUI(app);
					},

					share: function(app) {
						return shares.getShareInterface(app);
					}
				};


				var names = apps.map(function(item) { return item.name; }),
					appModules = {};

				var loadPromises = names.map(function(app) {
					var appDeferred = when.defer();
					
					/* Prepare app-specific require */
					var appConfig = {
						context: app,
						baseUrl: "js/apps/" + app,
						define: {}
					};

					/* Predefine global libraries */
					nestorAppModules.forEach(function(module, index) {
						appConfig.define[module] = args[index];
					});

					/* Predefine app interface modules */
					Object.keys(appInterface).forEach(function(module) {
						appConfig.define[module] = appInterface[module](app);
					});

					var appRequire = require.config(appConfig);

					/* Load app */
					appRequire(["index"], function(appModule) {
						appModules[app] = appModule;

						when(appModule.init())
						.then(function() {
							appDeferred.resolve();
						})
						.otherwise(function(err) {
							appDeferred.reject(err);
						});
					});

					return appDeferred.promise;
				});

				// There must be a way to make this prettier
				when.all(loadPromises)
				.then(function() {
					deferred.resolve(appModules);
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