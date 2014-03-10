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


		function updateIntoView(data, currentConfig, container, next) {
			var key = currentConfig.key;
			var selector = currentConfig.selector;
			var template = currentConfig.template;

			data.forEach(function(item) {
				var itemKey = item[key];
				var elem = dom.$(container, selector.replace("%s", itemKey));
				var nextSibling;

				if (!elem) {
					// Element does not exist, add it

					if (next) {
						// Look for next sibling
						nextSibling = dom.$(container, selector.replace("%s", next[0][key]));
					}

					if (nextSibling) {
						container.insertBefore(template.render(item), nextSibling);
					} else {
						container.appendChild(template.render(item));
					}
				} else if ("childrenArray" in currentConfig) {
					// Element exists and may have children, update them
					updateIntoView(
						item[currentConfig.childrenArray],
						config[currentConfig.childrenConfig],
						elem,
						next ? next[0][currentConfig.childrenArray] : null
					);
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
						removeFromView(
							item[currentConfig.childrenArray],
							config[currentConfig.childrenConfig],
							elem
						);

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

		view.loading = ui.signal();
		view.displayed.add(function() {
			if (!watcher) {
				watcher = resource.watch();
			}

			function fetch() {
				view.loading.dispatch(true);

				watcher.fetch(fetchCount)
				.then(function(docs) {
					if (docs.length) {
						renderDocs(docs);
					}
					
					view.loading.dispatch(false);
				})
				.otherwise(function(err) {
					console.log("Watch fetch error: " + err);
					view.loading.dispatch(false);
				});
			}

			function renderDocs(docs, next) {
				var rootContainer = view.$(root.selector);
				var mapped = dataMapper(docs);

				if (!rootContainer) {
					// Initial render
					view.appendChild(root.template.render(mapped));
				} else {
					// Update
					updateIntoView(
						mapped[root.childrenArray],
						config[root.childrenConfig],
						rootContainer,
						next ? dataMapper([next])[root.childrenArray] : null
					);
				}

				view.behave(behaviour);
			}

			// Add scroll handler to load more
			view.scrolledToEnd.add(fetch);

			// Setup data update handlers
			watcher.updated.add(function(document, next) {
				renderDocs([document], next);
			});

			watcher.removed.add(function(document) {
				var rootContainer = view.$(root.selector);
				var mapped = dataMapper([document]);

				removeFromView(
					mapped[root.childrenArray],
					config[root.childrenConfig],
					rootContainer
				);
			});

			// Initial fetch
			fetch();

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