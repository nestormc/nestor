/*jshint browser:true */
/*global define */
define([
	"router",

	"settings/users",
	"settings/shares",

	"ist!tmpl/settings/main"
], function(router, users, shares, template) {
	"use strict";

	var rendered;

	var settings = {
		panes: [],

		init: function(ui) {
			this.addPane(users);
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