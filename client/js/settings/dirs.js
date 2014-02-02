/*jshint browser: true */
/*global define */

define([
	"router", "ui", "dom",

	"./resources",

	"ist!tmpl/settings/dirs"
], function(router, ui, dom, resources, template) {
	"use strict";

	var rendered,
		paneNode;

	function update() {
		return resources.dirs.get().then(function(dirs) {
			rendered.update({ dirs: dirs._items });
		});
	}

	return {
		title: "Watched directories",
		description: "Manage directories watched for media files",
		icon: "settings",

		render: function() {
			if (!rendered) {
				rendered = template.render({ dirs: [] });
				paneNode = rendered.firstChild;

				router.on("!settings/dirs/remove/:id", function(err, req, next) {
					resources.dirs.remove(req.match.id)
					.then(update)
					.then(function() { next(); });
				});
			}

			update();

			return paneNode;
		}
	};
});