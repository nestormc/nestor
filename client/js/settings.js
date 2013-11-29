/*jshint browser:true */
/*global define */
define([
	"router", "login",

	"settings/users",
	"settings/dirs",
	"settings/shares",

	"ist!tmpl/settings/main"
], function(router, login, users, dirs, shares, template) {
	"use strict";

	var rendered;

	var settings = {
		panes: [],

		init: function(ui) {
			if (login.hasRight("nestor:users"))
				this.addPane(users);

			if (login.hasRight("media:watched-dirs"))
				this.addPane(dirs);

			if (login.hasRight("nestor:shares"))
				this.addPane(shares);

			ui.loadCSS("settings", "");

			router.on("/settings", function(err, req, next) {
				var container = ui.container("settings");

				if (rendered) {
					rendered.update(settings);
				} else {
					rendered = template.render(settings);
					container.appendChild(rendered);
				}

				container.show();
				next();
			});
		},

		addPane: function(pane) {
			this.panes.push(pane);
		}
	};

	return settings;
});