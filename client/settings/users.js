/*jshint browser: true */
/*global define */

define([
	"router", "ui", "dom", "moment", "when",

	"./resources",

	"ist!tmpl/settings/users"
], function(router, ui, dom, moment, when, resources, template) {
	"use strict";

	var rendered,
		paneNode,
		showRights = [];

	var rightsPromise = resources.rights.get();

	function update() {
		return rightsPromise.then(function(rights) {
			return resources.users.get().then(function(users) {
				users._items.forEach(function(user) {
					user.lastLogin = moment(user.lastLogin).fromNow();
					user.showRights = showRights.indexOf(user.identifier) !== -1;
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

				var showIndex = showRights.indexOf(req.match.id);
				if (showIndex !== -1) {
					showRights.splice(showIndex, 1);
				} else {
					showRights.push(req.match.id);
				}

				next();
			});

			router.on("!settings/users/:id/addRight/:right", function(err, req, next) {
				resources.users.addRight(req.match.id, req.match.right)
				.then(update)
				.then(function() { next(); });
			});

			router.on("!settings/users/:id/delRight/:right", function(err, req, next) {
				resources.users.delRight(req.match.id, req.match.right)
				.then(update)
				.then(function() { next(); });
			});

			update();

			return paneNode;
		}
	};
});