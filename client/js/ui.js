/*jshint browser:true */
/*global define, console */

define(
["ist-wrapper", "ist!tmpl/main", "signals", "ajax", "dom", "debug"],
function(ist, template, signals, ajax, dom, debug) {
	"use strict";
	
	var ui,
		containers = {},
		stylesheets = [],
		SCROLL_THRESHOLD = 64,
		$ = dom.$,
		$$ = dom.$$,
		viewportBehaviour,
		activeContainer;
	
	viewportBehaviour = {
		"&": {
			"scroll": function() {
				if (activeContainer && this.scrollTop + this.offsetHeight > this.scrollHeight - SCROLL_THRESHOLD) {
					activeContainer.scrolledToEnd.dispatch();
				}
			}
		}
	};

	var madeSignals = [];

	/**
	 * Signal factory
	 * Signals made with this factory are reset with the ui
	 */
	function makeSignal() {
		var s = new signals.Signal(),
			dispose = s.dispose.bind(s);

		madeSignals.push(s);

		s.dispose = function() {
			dispose();
			madeSignals.splice(madeSignals.indexOf(s), 1);
		};

		return s;
	}


	ui = {
		app: "nestor",

		searchQueryChanged: makeSignal(),
		searchQueryCancelled: makeSignal(),

		appletsReady: makeSignal(),
		stopping: makeSignal(),
		
		subUI: function(appname) {
			var sub = Object.create(ui);
			sub.app = appname;

			return sub;
		},
		
		error: function(title, details) {
			console.log("=== " + this.app + " ERROR ===");
			console.error(title);
			console.error(details);
		},

		signal: makeSignal,

		/**
		 * Load <filename>.css, namespacing it depending on the value of `container`.
		 * If container is not specified, the stylesheet is namespaced for the applet node
		 * If it is an empty string, it is namespaced for all containers
		 * Else, it is namespaced for the container with name `container`.
		 */
		loadCSS: function(filename, container) {
			var link = document.createElement("link"),
				namespace;

			if (typeof container === "undefined") {
				namespace = "#bar .app-" + this.app + " .applet";
			} else if (container === "") {
				namespace = "#viewport .container-" + this.app;
			} else {
				namespace = "#viewport .container-" + this.app + "-" + container;
			}

			link.type = "text/css";
			link.rel = "stylesheet";
			link.href = "style/" + this.app + "/" + filename + "-min.css?namespace=" + encodeURIComponent(namespace);

			stylesheets.push(link);
			document.querySelector("head").appendChild(link);
		},
		
		container: (function() {
			function showContainer(container) {
				if (activeContainer) {
					activeContainer.style.display = "none";
					activeContainer.undisplayed.dispatch();
				}

				container.style.display = "block";
				container.displayed.dispatch();
				activeContainer = container;
			}

			function setContainerUpdater(container, updater, interval) {
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
					handle = setTimeout(run, interval);
				}

				container.displayed.add(function() {
					run();
				});

				container.undisplayed.add(function() {
					helpers.clear();
				});

				return helpers;
			}

			
			return function(name) {
				var aname = this.app + "-" + name;
				
				if (!containers[aname]) {
					var c = ist.create("div[class=container container-{{ app }} container-{{name}}]", { app: this.app, name: aname });
						
					$("#viewport").appendChild(c);
					
					// Would love to be able to Object.create(DOMNode) here :(
					c.$ = $.bind(null, c);
					c.$$ = $$.bind(null, c);
					c.behave = dom.behave.bind(null, c);
					c.show = showContainer.bind(null, c);
					c.setUpdater = setContainerUpdater.bind(null, c);

					c.displayed = new signals.Signal();
					c.undisplayed = new signals.Signal();
					c.scrolledToEnd = new signals.Signal();
					
					containers[aname] = c;
				}
				
				return containers[aname];
			};
		}()),
		
		start: function(user, apps, router) {
			var manifests;
			
			/* Extract app manifests and render applet nodes */
			manifests = Object.keys(apps).map(function(name) {
				var app = apps[name],
					manifest = app.manifest;
				
				manifest.appletNode = app.renderApplet();
				return manifest;
			});
			
			
			/* Render main template */
			$("#login-container").style.display = "none";

			var mainContainer = $("#main-container");
			mainContainer.style.display = "block";
			
			mainContainer.innerHTML = "";
			mainContainer.appendChild(
				template.render({
					user: user,
					apps: manifests
				})
			);

			mainContainer.appendChild(debug.render());

			/* Applets are in the DOM, dispatch signal for apps */
			this.appletsReady.dispatch();

			dom.behave($("#viewport"), viewportBehaviour);
			
			/* Setup page selection routes */
			manifests.forEach(function(app) {
				if (!app.pages) {
					return;
				}
				
				Object.keys(app.pages).forEach(function(page) {
					router.on("/" + app.title + "/" + page, function(err, req, next) {
						if (!err) {
							var prev = $("#bar .app li.selected"),
								item = $("#bar .app." + app.title + " li." + page);
							
							if (prev) {
								prev.classList.remove("selected");
							}
							
							if (item) {
								item.classList.add("selected");
							}
						}
						
						next(err);
					});
				});
			});
			
			/* Setup error handling route */
			router.on("*", function(err, req, next) {
				if (err) {
					ui.error("router/* - " + err.message, err.stack);
				}
				
				next(err);
			});

			/* Setup search keypress handlers */
			var search = $("#search"),
				input = $("#search input");

			addEventListener("keydown", function(e) {
				// Ignore input in contentEditable and <input> elements
				if (e.target.contentEditable === "true" || e.target.tagName === "INPUT") {
					return;
				}

				// Ignore non printable characters
				if (e.which < 32) {
					return;
				}

				// Redirect input to search box
				search.style.display = "block";
				input.value = "";
				input.focus();
			});

			dom.behave(input, {
				"&": {
					"keydown": function(e) {
						// Prevent toplevel event handling
						e.stopPropagation();

						if (e.which === 27) {
							search.style.display = "none";
							ui.searchQueryCancelled.dispatch();
						}
					},

					"keyup": function(e) {
						// Prevent toplevel event handling
						e.stopPropagation();

						if (e.which !== 27) {
							ui.searchQueryChanged.dispatch(this.value);
						}
					}
				}
			});

			ui.searchQueryChanged.add(function(v) {
				console.log("Search query: " + (v ? v : "<empty>"));
			});

			ui.searchQueryCancelled.add(function() {
				console.log("Search query cancelled");
			});
		},

		stop: function() {
			// Dispatch stopping signal
			this.stopping.dispatch();

			// Destroy containers
			Object.keys(containers).forEach(function(name) {
				var c = containers[name];
				c.parentNode.removeChild(c);
			});
			containers = {};
			activeContainer = undefined;

			// Remove stylesheets
			stylesheets.forEach(function(s) {
				s.parentNode.removeChild(s);
			});
			stylesheets = [];

			// Reset all signals
			madeSignals.forEach(function(s) {
				s.removeAll();
			});
		}
	};
	
	return ui;
});