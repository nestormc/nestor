/*jshint browser: true */
/*global define */

define([
	"router", "ui", "dom", "moment",

	"./resources",

	"ist!tmpl/settings/users"
], function(router, ui, dom, moment, resources, template) {
	"use strict";

	var rendered,
		node;

	function update() {
		return resources.users.get().then(function(users) {
			users._items.forEach(function(user) {
				user.lastLogin = moment(user.lastLogin).fromNow();
			});

			rendered.update({ users: users._items });
		});
	}

	return {
		title: "Users",
		description: "Manage nestor users",
		icon: "share",

		render: function() {
			if (!rendered) {
				rendered = template.render({ users: [] });
				node = rendered.firstChild;
			}

			router.on("!settings/users/remove/:id", function(err, req, next) {
				resources.users.remove(req.match.id)
				.then(update)
				.then(function() { next(); });
			});

			router.on("!settings/users/enable/:id", function(err, req, next) {
				resources.users.enable(req.match.id)
				.then(update)
				.then(function() { next(); });
			});

			update();

			return node;
		}
	};
});