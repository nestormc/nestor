/*jshint browser:true */
/*global require, define, $, $$, console */

define(
["ist!tmpl/main", "ist", "signals"],
function(template, ist, signals) {
	"use strict";
	
	var ui,
		containers = [],
		SCROLL_THRESHOLD = 64,
		viewportBehaviour,
		activeContainer;
	
	/* Add @dom directive to allow inserting DOM nodes into templates */
	ist.registerHelper("dom", function(ctx, tmpl, fragment) {
		var node = ctx.value;
		
		if (node.ownerDocument !== this.doc) {
			node = this.doc.importNode(node);
		}
		
		while (fragment.hasChildNodes()) {
			fragment.removeChild(fragment.firstChild);
		}
		
		fragment.appendChild(node);
	});

	function behaviour(root, behaviours) {
		if (!behaviours) {
			behaviours = root;
			root = document;
		}

		Object.keys(behaviours).forEach(function(selector) {
			var events = behaviours[selector],
				elems = selector === "&" ? [root] : $$(root, selector);

			elems.forEach(function(element) {
				var activeBehaviours;

				// Remove previously applied behaviour
				if (element.activeBehaviours && selector in element.activeBehaviours) {
					activeBehaviours = element.activeBehaviours[selector];
					Object.keys(activeBehaviours).forEach(function(event) {
						element.removeEventListener(event, activeBehaviours[event]);
					});
				}

				element.activeBehaviours = element.activeBehaviours || {};
				activeBehaviours = element.activeBehaviours[selector] = {};

				Object.keys(events).forEach(function(event) {
					activeBehaviours[event] = events[event];
					element.addEventListener(event, events[event]);
				});
			});
		});
	}

	viewportBehaviour = {
		"&": {
			"scroll": function() {
				if (activeContainer && this.scrollTop + this.offsetHeight > this.scrollHeight - SCROLL_THRESHOLD) {
					activeContainer.scrolledToEnd.dispatch();
				}
			}
		}
	};

	ui = {
		app: "nestor",

		behave: behaviour,
		
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
				namespace = "#bar .app." + this.app + " .applet";
			} else if (container === "") {
				namespace = "#viewport .container-" + this.app;
			} else {
				namespace = "#viewport .container-" + this.app + "-" + container;
			}

			link.type = "text/css";
			link.rel = "stylesheet";
			link.href = "style/" + this.app + "/" + filename + "-min.css?namespace=" + encodeURIComponent(namespace);

			document.querySelector("head").appendChild(link);
		},
		
		container: (function() {
			function showContainer(container) {
				if (activeContainer) {
					activeContainer.style.display = "none";
				}

				container.style.display = "block";
				activeContainer = container;
			}

			
			return function(name) {
				var aname = this.app + "-" + name;
				
				if (!containers[aname]) {
					var c = ist.createNode("div[class=container container-{{ app }} container-{{name}}]", { app: this.app, name: aname });
						
					$("#viewport").appendChild(c);
					
					// Would love to be able to Object.create(DOMNode) here :(
					c.$ = $.bind(null, c);
					c.$$ = $$.bind(null, c);
					c.behave = behaviour.bind(null, c);
					c.show = showContainer.bind(null, c);

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
			$("#main-container").style.display = "block";
			
			$("#main-container").innerHTML = "";
			$("#main-container").appendChild(
				template.render({
					user: user,
					apps: manifests
				})
			);

			behaviour($("#viewport"), viewportBehaviour);
			
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
		}
	};
	
	return ui;
});