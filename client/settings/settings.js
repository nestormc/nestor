/*jshint browser:true */
/*global define */
define([
	"router", "login", "ui",

	"./users",

	"ist!tmpl/settings/main"
], function(router, login, ui, usersView, template) {
	"use strict";

	var rendered;
	var panes = [];


	ui.started.add(function() {
		var view = ui.view("settings");
		view.displayed.add(function() {
			if (!rendered) {
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
			},

			users: usersView
		},

		addPane: function(pane) {
			panes.push(pane);
		}
	};

	return manifest;
});