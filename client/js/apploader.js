/*jshint browser:true */
/*global require, define, $, $$, nestorAppModules */

define(["require", "when", "rest"], function(mainRequire, when, rest) {
	"use strict";
	
	return function(ui, router) {
		var deferred = when.defer(),
			nestorAppModules = ["ist", "signals", "when"];
		
		
		/* List available apps */
		rest.list("clientApps", { limit: 0 }, function(err, apps) {
			if (err) {
				deferred.reject(err);
			} else {
				mainRequire(nestorAppModules, function() {
					var args = [].slice.call(arguments);

					var appInterface = {
						rest: function(app) {
							return rest;
						},

						router: function(app) {
							return router.subRouter(app);
						},

						ui: function(app) {
							return ui.subUI(app);
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
							paths: {},
							shim: {}
						};

						/* Shim global libraries */
						nestorAppModules.forEach(function(module, index) {
							appConfig.paths[module] = "../../dummy.js?module=" + module + "&for=" + app;
							appConfig.shim[module] = {
								exports: "_dummy",
								init: function() {
									return args[index];
								}
							};
						});

						/* Add app interface module shims */
						Object.keys(appInterface).forEach(function(module) {
							appConfig.paths[module] = "../../dummy.js?module=" + module + "&for=" + app;
							appConfig.shim[module] = {
								exports: "_dummy",
								init: appInterface[module].bind(null, app)
							};
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

					when.all(loadPromises)
					.then(function() {
						deferred.resolve(appModules);
					})
					.otherwise(function(err) {
						deferred.reject(err);
					});
				});
			}
		});
		
		return deferred.promise;
	};
});