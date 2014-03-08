/*jshint browser:true*/
/*global define, require */
define(["router", "ui", "dom"], function(router, ui, dom) {
	"use strict";

	function setupContentList(router, ui, view, config) {
		var resource = config.resource;
		var fetchCount = config.fetchCount || 10;
		var dataMapper = config.dataMapper;
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


		function updateIntoView(data, currentConfig, container) {
			var key = currentConfig.key;
			var selector = currentConfig.selector;
			var template = currentConfig.template;

			data.forEach(function(item) {
				var itemKey = item[key];
				var elem = dom.$(container, selector.replace("%s", itemKey));

				if (!elem) {
					// Element does not exist, add it
					container.appendChild(template.render(item));
				} else if ("childrenArray" in currentConfig) {
					// Element exists and may have children, update them
					updateIntoView(item[currentConfig.childrenArray], config[currentConfig.childrenConfig], elem);
				} else {
					// Element exists and is leaf element, update it
					container.replaceChild(template.render(item), elem);
				}
			});
		}


		function removeFromView(data, currentConfig, container) {
			var key = currentConfig.key;
			var selector = currentConfig.selector;

			data.forEach(function(item) {
				// Find element at current level, and do nothing if none found
				var itemKey = item[key];
				var elem = dom.$(container, selector.replace("%s", itemKey));

				if (elem) {
					if ("childrenArray" in currentConfig) {
						// Remove children first
						removeFromView(item[currentConfig.childrenArray], config[currentConfig.childrenConfig], elem);

						// Remove current element if no more children are present
						if (!dom.$(elem, currentConfig.childSelector)) {
							elem.parentNode.removeChild(elem);
						}
					} else {
						// Leaf element, remove it
						elem.parentNode.removeChild(elem);
					}
				}
			});
		}


		var watcher;
		view.displayed.add(function() {
			if (!watcher) {
				watcher = resource.watch();
			}

			// Add scroll handler to load more
			view.scrolledToEnd.add(function() {
				watcher.fetch(fetchCount);
			});

			// Setup data update handlers
			watcher.updated.add(function(document) {
				var rootContainer = view.$(root.selector);
				var mapped = dataMapper(document);

				console.dir({ type: "Got document", doc: document, mapped: mapped });

				if (!rootContainer) {
					// Initial render
					view.appendChild(root.template.render(mapped));
				} else {
					// Update
					updateIntoView(mapped[root.childrenArray], config[root.childrenConfig], rootContainer);
				}

				view.behave(behaviour);
			});

			watcher.removed.add(function(document) {
				var rootContainer = view.$(root.selector);
				var mapped = dataMapper(document);

				removeFromView(mapped[root.childrenArray], config[root.childrenConfig], rootContainer);
			});

			// Initial fetch
			watcher.fetch(fetchCount);

			// Cancel loading when UI stops
			ui.stopping.add(function() {
				watcher.dispose();
				watcher = null;
			});
		});
	}

	return {
		bindPlugin: function(plugin) {
			return setupContentList.bind(null, router.subRouter(plugin), require("ui").pluginUI(plugin));
		}
	};
});