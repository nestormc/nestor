/*jshint browser:true*/
/*global define*/
define(
["ist-wrapper", "ist!tmpl/main", "components/index", "player/player", "signals", "dom", "when"],
function(ist, mainTemplate, components, player, signals, dom, when) {
	"use strict";

	var $ = dom.$;
	var $$ = dom.$$;


	/*!
	 * View show/hide helpers
	 */

	function showView(view) {
		view.displayed.dispatch();
		view.style.display = "block";
	}


	function hideView(view) {
		view.undisplayed.dispatch();
		view.style.display = "none";
	}



	var showPopup = (function() {
		var lastPopup = when.resolve();

		return function(view) {
			var popup = $("#popup");

			var last = lastPopup;
			var next = when.defer();
			lastPopup = next.promise;

			// Resolve next promise when view is hidden
			var binding = view.undisplayed.add(function () {
				binding.detach();
				popup.style.display = "none";
				next.resolve();
			});

			// Wait for last popup to disappear
			last.then(function() {
				// Show popup
				popup.style.display = "block";
				showView(view);
			});
		};
	}());


	var showMainView = (function() {
		var current;

		return function(view) {
			if (current) {
				hideView(current);
			}

			current = view;
			showView(view);
		};
	}());


	/*!
	 * CSS lodaer
	 */

	function loadCSS(plugin, namespace, filename) {
		var stylePath = plugin === "nestor" ? "style" : "plugins/" + plugin + "/style";
		var href = stylePath + "/" + filename + "-min.css?namespace=" + encodeURIComponent(namespace);
		var link = $("link[href='" + href + "']");

		if (!link) {
			link = ist.create("link[type=text/css][rel=stylesheet][href=" + href + "]");
			$("head").appendChild(link);
		}
	}


	/*!
	 * View updater
	 */

	var DEFAULT_INTERVAL = 2000;
	function autoUpdateView(view, updater, interval) {
		var handle = null,
			helpers = {
				clear: function() {
					clearTimeout(handle);
					handle = null;
				},

				trigger: function() {
					helpers.clear();
					run();
				}
			};

		function run() {
			updater(done);
		}

		function done() {
			handle = setTimeout(run, interval || DEFAULT_INTERVAL);
		}

		// Start updater when view is visible
		view.displayed.add(function() {
			run();
		});

		// Suspend updater when view is hidden
		view.undisplayed.add(function() {
			helpers.clear();
		});

		return helpers;
	}


	/*!
	 * UI-specific signal factory
	 */

	var makeSignal = (function() {
		var sigs = [];

		function makeSignal() {
			var signal = new signals.Signal(),
				originalDispose = signal.dispose.bind(signal);

			sigs.push(signal);

			signal.dispose = function() {
				sigs.splice(sigs.indexOf(sigs), 1);
				originalDispose();
			};

			return signal;
		}

		makeSignal.removeAll = function() {
			sigs.forEach(function(s) {
				s.removeAll();
			});
		};

		return makeSignal;
	}());


	/*!
	 * ist context and main UI rendered fragment
	 */
	var istContext;
	var istRendered;
	var views = {};


	/*!
	 * Public interface
	 */

	var pluginUIs = {};
	var activeMainView;
	var settingsApp;

	var ui = {
		plugin: "nestor",
		components: components,

		/* Player interface */
		player: player.public,


		/* Signals */
		started: new signals.Signal(),
		stopping: new signals.Signal(),


		/* Error handler, should make this nicer... */
		error: function(title, details) {
			console.log("=== " + this.plugin + " ERROR ===");
			console.error(title);
			console.error(details);
		},


		/* Start the UI */
		start: function(user, plugins, apps, router) {
			// Initialize rendering context
			istContext = {
				user: user,
				plugins: plugins,
				nestor: {
					viewTypes: {
						"main": [],
						"popup": [],
						"settings": []
					}
				},
				player: player.render(ui)
			};

			settingsApp = apps.filter(function(a) { return a.name === "settings"; })[0];

			function createViews(isPlugin, manifest) {
				var name = manifest.name;
				var pluginUI = isPlugin ? ui.pluginUI(name) : ui;
				var pluginRouter = isPlugin ? router.subRouter(name) : router;

				if (isPlugin) {
					manifest.links = [];
					manifest.viewTypes = { "main": [], "applet": [], "popup": [], "settings": [] };
				}

				if (manifest.css) {
					pluginUI.loadCSS(manifest.css);
				}

				/* Create manifest views and routes */
				Object.keys(manifest.views || {}).forEach(function(id) {
					var options = manifest.views[id];
					var view = pluginUI.view(id, options);

					if (options.type === "main" || options.type === "popup") {
						var route = options.type === "popup" ? "!" + id : "/" + id;
						pluginRouter.on(route, function(err, req, next) {
							if (err) {
								next(err);
							} else {
								view.show();
								next();
							}
						});
					}
				});
			}

			// Create app views
			apps.forEach(createViews.bind(null, false));

			// Create plugin views
			plugins.forEach(createViews.bind(null, true));

			// Render main template
			$("#login-container").style.display = "none";

			var mainContainer = $("#main-container");
			mainContainer.style.display = "block";
			
			istRendered = mainTemplate.render(istContext);
			mainContainer.innerHTML = "";
			mainContainer.appendChild(istRendered);

			// Setup viewport behaviour
			dom.behave($("#viewport"), {
				"&": {
					"scroll": function() {
						if (activeMainView && this.scrollTop + this.offsetHeight > this.scrollHeight - this.offsetHeight) {
							activeMainView.scrolledToEnd.dispatch();
						}
					}
				}
			});

			// Setup error handling route
			router.on("*", function(err, req, next) {
				if (err) {
					ui.error("router/* - " + err.message, err.stack);
				}
				
				next(err);
			});

			// Dispatch started signal
			ui.started.dispatch();
		},


		stop: function() {
			var d = when.defer();

			// Add "stopping" binding to ensure the signal has been dispatched
			// to plugins first
			var binding = ui.stopping.add(function() {
				// Remove all views from plugin manifests
				istContext.plugins.forEach(function(manifest) {
					Object.keys(manifest.viewTypes).forEach(function(type) {
						manifest.viewTypes[type].forEach(function(view) {
							hideView(view);
						});
					});
					
					delete manifest.viewTypes;
					delete manifest.links;
				});

				// Disconnect session signal handlers
				makeSignal.removeAll();

				// Remove all views from document
				$("#main-container").innerHTML = "";
				istRendered = null;
				istContext = null;
				views = {};

				// We keep loaded CSS, there's no real point in removing them

				binding.detach();
				d.resolve();
			});

			activeMainView = null;

			ui.stopping.dispatch();
			return d.promise;
		},


		/* Session-specific signal factory */
		signal: makeSignal,


		/* Get plugin-specific UI */
		pluginUI: function(plugin) {
			if (!(plugin in pluginUIs)) {
				var sub = Object.create(ui);
				sub.plugin = plugin;

				pluginUIs[plugin] = sub;
			}

			return pluginUIs[plugin];
		},


		/* Load CSS file for all views in this plugin */
		loadCSS: function(filename) {
			loadCSS(this.plugin, "." + this.plugin + "-view", filename);
		},


		/*
		 * Get a view element, creating it if necessary
		 *
		 * Options: 
		 *   type:        "main", "popup", "applet" or "settings"
		 *   updater:     optional; passed to view.autoUpdate()
		 *   css:         optional; passed to view.loadCSS()
		 *
		 * When type is "main" or "popup", those can be specified to add a link to show 
		 * the view in the action bar :
		 *   link:        link label
		 *   icon:        optional; link icon name
		 *
		 * When type is "settings", those are mandatory:
		 *   title:       settings pane title
		 *   description: settings pane subtitle
		 *   icon:        settings pane icon name
		 */
		view: function(id, options) {
			var plugin = this.plugin;

			options = options || {};
			options.type = options.type || "main";

			var viewId = "view-" + plugin + "-" + id;
			var view = views[viewId];

			if (!view) {
				var manifest;

				// Create view
				var classNames = [options.type + "-view", plugin + "-view"];
				view = ist.create("div#" + viewId + "." + classNames.join(".") + "[style=display: none;]");

				// Save it in plugin manifest
				if (plugin === "nestor") {
					manifest = istContext.nestor;
				} else {
					manifest = istContext.plugins.filter(function(m) {
							return m.name === plugin;
						})[0];
				}

				manifest.viewTypes[options.type].push(view);

				// Add common methods and helpers
				view.$ = $.bind(null, view);
				view.$$ = $$.bind(null, view);
				view.behave = dom.behave.bind(null, view);
				view.autoUpdate = autoUpdateView.bind(null, view);
				view.loadCSS = loadCSS.bind(null, plugin, "#" + viewId);

				// Add signals
				view.displayed = ui.signal();
				view.undisplayed = ui.signal();
				view.scrolledToEnd = ui.signal();

				// Type-specific shenanigans
				if (options.type === "settings") {
					settingsApp.addPane({
						title: options.title,
						description: options.description,
						icon: options.icon,
						view: view
					});

					view.style.display = "block";
				} else if (options.type === "applet") {
					view.show = showView.bind(null, view);
					view.hide = hideView.bind(null, view);
				} else {
					if (options.type === "popup") {
						view.show = showPopup.bind(null, view);
						view.hide = hideView.bind(null, view);
					} else {
						view.show = showMainView.bind(null, view);
						view.undisplayed.add(function() {
							if (activeMainView === view) {
								activeMainView = null;
							}
						});
						view.displayed.add(function() {
							activeMainView = view;
						});
					}

					if (options.link) {
						manifest.links.push({
							route: (options.type === "popup" ? "!" : "/") + plugin + "/" + id,
							label: options.link,
							icon: options.icon || "list"
						});
					}
				}

				// Enable autoupdate if specified
				if (options.updater) {
					view.autoUpdate(options.updater, options.updaterInterval);
				}

				// Load view-specific CSS if specified
				if (options.css) {
					view.loadCSS(options.css);
				}

				// Update render if already done (useful for non-manifest views)
				if (istRendered) {
					istRendered.update();
				}

				views[viewId] = view;
			}

			return view;
		}
	};

	return ui;
});