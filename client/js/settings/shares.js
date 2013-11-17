/*jshint browser: true */
/*global define */

define([
	"router", "ui", "dom",

	"./resources",

	"ist!tmpl/settings/shares",
	"ist!tmpl/settings/shares-popup"
], function(router, ui, dom, resources, template, popupTemplate) {
	"use strict";

	var rendered,
		node;

	function update() {
		return resources.shares.get().then(function(shares) {
			rendered.update({ shares: shares._items });
		});
	}

	return {
		title: "Shares",
		description: "Manage shared resources",
		icon: "share",

		render: function() {
			if (!rendered) {
				rendered = template.render({ shares: [] });
				node = rendered.firstChild;

				router.on("!settings/shares/remove/:id", function(err, req, next) {
					resources.shares.remove(req.match.id)
					.then(update)
					.then(function() { next(); });
				});

				router.on("!settings/shares/disable/:id", function(err, req, next) {
					resources.shares.disable(req.match.id)
					.then(update)
					.then(function() { next(); });
				});

				router.on("!settings/shares/enable/:id", function(err, req, next) {
					resources.shares.enable(req.match.id)
					.then(update)
					.then(function() { next(); });
				});
			}

			update();

			return node;
		},

		getShareInterface: function(provider) {
			return function shareResource(description, resource) {
				var rendered = popupTemplate.render({ loading: true }),
					popup = ui.popup(rendered);

				resources.shares.add(description, provider, resource)
				.then(function(share) {
					rendered.update({
						loading: false,
						share: share,
						behaviour: {
							".cancel": {
								"click": function() {
									popup.hide();
									resources.shares.remove(share.shortId);
								}
							},

							".share": {
								"click": function() {
									popup.hide();
									resources.shares.enable(share.shortId);
								}
							}
						}
					});

					popup.resize();
				})
				.otherwise(function(err) {
					ui.error("Cannot share resource", err.message);
				});
			};
		}
	};
});