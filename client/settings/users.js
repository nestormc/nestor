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
		if (!ui.hasRight("nestor:users")) {
			return;
		}

		var usersView = ui.view("users");
		var uvRendered;
		var uvContext = { users: [], rights: [] };
		var showRights = [];

		function updateUsers() {
			return rightsPromise.then(function(rights) {
				return resources.users.get().then(function(users) {
					users._items.forEach(function(user) {
						user.lastLogin = user.lastLogin ? moment(user.lastLogin).fromNow() : "never";
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

		var addView = ui.view("add-user", { type: "popup" });
		var addForm = ui.helpers.form({
			title: "Add user",

			submitLabel: "Add",
			cancelLabel: "Cancel",

			onSubmit: function(values) {
				resources.users.add(values)
				.then(function() {
					addView.hide();
					updateUsers();
				})
				.otherwise(function(err) {
					addForm.setErrors({ type: err.message });
				});
			},

			onCancel: function() {
				addView.hide();
			},

			fields: [
				{
					name: "type", type: "select", label: "User type", value: "local",
					options: {
						"local": "Local user",
						"twitter": "Twitter",
						"google": "Google"
					}
				},
				{
					name: "username", type: "text", label: "User name", value: "",
					when: { type: "local" },
					validate: function(value) {
						if (value.length === 0) {
							return "User name is mandatory";
						}
					}
				},
				{
					name: "twitterhandle", type: "text", label: "Twitter handle", value: "",
					when: { type: "twitter" },
					validate: function(value) {
						var values = addForm.getValues();

						if (values.type === "twitter" && value.length === 0) {
							return "Twitter handle is mandatory";
						}
					}
				},
				{
					name: "googlemail", type: "text", label: "E-mail address", value: "",
					when: { type: "google" },
					validate: function(value) {
						var values = addForm.getValues();

						if (values.type === "google" && value.length === 0) {
							return "E-mail address is mandatory";
						}
					}
				},
				{
					name: "password", type: "password", label: "Password", value: "",
					when: { type: "local" },
					validate: function(value) {
						var values = addForm.getValues();

						if (values.type === "local" && value.length === 0) {
							return "Password is mandatory";
						}
					}
				},
				{
					name: "confirm", type: "password", label: "Confirm", value: "",
					when: { type: "local" },
					validate: function(value) {
						var values = addForm.getValues();

						if (values.type === "local" && value !== values.password) {
							return "Passwords do not match";
						}
					}
				}
			]
		});
		addView.appendChild(addForm);

		router.on("!settings/users/add", function(err, req, next) {
			addForm.setValues({
				type: "local",
				username: "",
				password: "",
				confirm: "",
				twitterhandle: "",
				googlemail: ""
			});
			addView.show();
			addView.resize();

			next();
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
		ifRight: "nestor:users",
		type: "settings",
		title: "Users",
		description: "Manage nestor users",
		icon: "key",
		actions: [
			{
				"title": "Add user",
				"icon": "add",
				"route": "!settings/users/add"
			}
		]
	};
});