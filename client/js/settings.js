/*jshint browser:true */
/*global define */
define([
	"router", "login", "ui",

	"settings/users",
	"settings/dirs",
	"settings/shares",

	"ist!tmpl/settings/main"
], function(router, login, ui, users, dirs, shares, template) {
	"use strict";

	var rendered;
	var panes = [];


	ui.started.add(function() {
		if (login.hasRight("nestor:users"))
			manifest.addPane(users);

		if (login.hasRight("media:watched-dirs"))
			manifest.addPane(dirs);

		if (login.hasRight("nestor:shares"))
			manifest.addPane(shares);

		var view = ui.view("settings");
		view.displayed.add(function() {
			if (rendered) {
				rendered.update({ panes: panes });
			} else {
				rendered = template.render({ panes: panes });
				view.appendChild(rendered);
			}

			panes.forEach(function(pane) {
				if (pane.view) {
					pane.view.show();
				}
			});
		});

		view.undisplayed.add(function() {
			panes.forEach(function(pane) {
				if (pane.view) {
					pane.view.hide();
				}
			});
		});
	});


	ui.stopping.add(function() {
		rendered = null;
		panes = [];
	});


	var manifest = {
		name: "settings",
		views: {
			settings: {
				type: "main",
				css: "settings"
			}
		},

		addPane: function(pane) {
			panes.push(pane);
		}
	};

	return manifest;
});