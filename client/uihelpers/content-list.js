/*jshint browser:true*/
/*global define, require */
define(["router", "ui", "dom"], function(router, ui, dom) {
	"use strict";

	function setupContentList(router, ui, view, config) {
		var resource = config.resource;
		var modifier = config.dataModifier || function(d) { return d; };
		var behaviour = config.behaviour || {};
		var routes = config.routes || {};
		var root = config.root;

		if (config.listSelection) {
			var selectBehaviour = ui.helpers.listSelectionBehaviour(
				view,
				config.listSelection.itemSelector,
				config.listSelection.listSelector,
				config.listSelection.onItemDblClick
			);

			Object.keys(selectBehaviour).forEach(function(selector) {
				behaviour[selector] = behaviour[selector] || {};

				Object.keys(selectBehaviour[selector]).forEach(function(event) {
					behaviour[selector][event] = selectBehaviour[selector][event];
				});
			});
		}

		// Setup routes
		Object.keys(routes).forEach(function(route) {
			router.on(route, routes[route].bind(null, view));
		});


		function updateView(data, current, container) {
			var key = current.key;
			var selector = current.selector;
			var template = current.template;

			data.forEach(function(item) {
				var itemKey = item[key];
				var elem = dom.$(container, selector.replace("%s", itemKey));

				if (!elem) {
					container.appendChild(template.render(item));
				} else if ("nextArray" in current) {
					updateView(item[current.nextArray], config[current.nextConfig], elem);
				}
			});
		}


		var promise;
		var loaded = false;


		view.loading = ui.signal();
		view.displayed.add(function() {
			setupContentList.activeView = view;

			if (!promise) {
				promise = resource.list();
			}

			// Add scroll handler to load more
			view.scrolledToEnd.add(function() {
				if (!loaded) {
					view.loading.dispatch(true);
					promise.fetchMore();
				}
			});


			promise
			.whenData(function(items) {
				// Call data modifier
				var data = modifier(items);
				var rootContainer = view.$(root.selector);

				if (!rootContainer) {
					try {
						view.appendChild(root.template.render(data));
					} catch(e) {
						ui.error("Cannot render root template", e.stack);
						return;
					}
				} else {
					updateView(data[root.nextArray], config[root.nextConfig], rootContainer);
				}

				view.loading.dispatch(false);
				view.behave(behaviour);
			})
			.then(function() {
				// Nothing more to load
				loaded = true;
			})
			.otherwise(function(err) {
				ui.error("Cannot fetch data", err.stack);
			});

			ui.stopping.add(function() {
				// Cancel loading when UI stops
				promise.cancel();
			});
		});
	}

	return {
		bindPlugin: function(plugin) {
			return setupContentList.bind(null, router.subRouter(plugin), require("ui").pluginUI(plugin));
		}
	};
});