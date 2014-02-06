/*jshint browser:true */
/*global define */
define([
	"router", "login", "ui",

	"settings/users",
	"settings/dirs",

	"ist!tmpl/settings/main"
], function(router, login, ui, users, dirs, template) {
	"use strict";

	var rendered;
	var panes = [];


	ui.started.add(function() {
		if (login.hasRight("nestor:users"))
			manifest.addPane(users);

		if (login.hasRight("media:watched-dirs"))
			manifest.addPane(dirs);

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
					pane.view.displayed.dispatch();
				}
			});
		});

		view.undisplayed.add(function() {
			panes.forEach(function(pane) {
				if (pane.view) {
					pane.view.undisplayed.dispatch();
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