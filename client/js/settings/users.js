/*jshint browser: true */
/*global define */

define([
	"router", "ui", "dom", "moment", "when",

	"./resources",

	"ist!tmpl/settings/users"
], function(router, ui, dom, moment, when, resources, template) {
	"use strict";

	var rendered,
		paneNode;

	var rightsPromise = resources.rights.get();

	function update() {
		return rightsPromise.then(function(rights) {
			return resources.users.get().then(function(users) {
				users._items.forEach(function(user) {
					user.lastLogin = moment(user.lastLogin).fromNow();
				});

				rendered.update({ rights: rights._items, users: users._items });
			});
		});
	}

	return {
		title: "Users",
		description: "Manage nestor users",
		icon: "key",

		render: function() {
			if (!rendered) {
				rendered = template.render({ users: [] });
				paneNode = rendered.firstChild;
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

			router.on("!settings/users/toggleRights/:id", function(err, req, next) {
				dom.$(".user[data-id=\"" + req.match.id + "\"]").classList.toggle("show-rights");
				next();
			});

			update();

			return paneNode;
		}
	};
});