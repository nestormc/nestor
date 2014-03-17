/*jshint browser: true */
/*global define */

define([
	"router", "ui", "dom", "moment", "when",

	"./resources",

	"ist!tmpl/settings/users"
], function(router, ui, dom, moment, when, resources, template) {
	"use strict";

	var rightsPromise = resources.rights.get();
	
	ui.started.add(function() {
		var usersView = ui.view("users");
		var uvRendered;
		var uvContext = { users: [], rights: [] };
		var showRights = [];

		function updateUsers() {
			return rightsPromise.then(function(rights) {
				return resources.users.get().then(function(users) {
					users._items.forEach(function(user) {
						user.lastLogin = moment(user.lastLogin).fromNow();
						user.showRights = showRights.indexOf(user.identifier) !== -1;
					});

					uvContext.users = users._items;
					uvContext.rights = rights._items;

					uvRendered.update();
				});
			});
		}

		usersView.displayed.add(function() {
			if (!uvRendered) {
				uvRendered = template.render(uvContext);
				usersView.appendChild(uvRendered);
			}

			updateUsers();
		});

		router.on("!settings/users/remove/:id", function(err, req, next) {
			resources.users.remove(req.match.id)
			.then(updateUsers)
			.then(function() { next(); });
		});

		router.on("!settings/users/enable/:id", function(err, req, next) {
			resources.users.enable(req.match.id)
			.then(updateUsers)
			.then(function() { next(); });
		});

		router.on("!settings/users/toggleRights/:id", function(err, req, next) {
			usersView.$(".user[data-id=\"" + req.match.id + "\"]").classList.toggle("show-rights");

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
			.then(updateUsers)
			.then(function() { next(); });
		});

		router.on("!settings/users/:id/delRight/:right", function(err, req, next) {
			resources.users.delRight(req.match.id, req.match.right)
			.then(updateUsers)
			.then(function() { next(); });
		});
	});

	return {
		type: "settings",
		title: "Users",
		description: "Manage nestor users",
		icon: "key"
	};
});