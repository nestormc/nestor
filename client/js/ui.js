/*jshint browser:true */
/*global require, define, $, $$ */

define(["ist!tmpl/main", "when", "ist", "apploader"], function(template, when, ist, apploader) {
	"use strict";
	
	var ui;
	
	/* Add @dom directive to allow inserting DOM nodes into templates */
	ist.registerHelper("dom", function(ctx, tmpl, fragment) {
		var node = ctx.value;
		
		if (node.ownerDocument !== this.doc) {
			node = this.doc.importNode(node);
		}
		
		while (fragment.hasChildNodes()) {
			fragment.removeChild(fragment.firstChild);
		}
		
		fragment.appendChild(node);
	});
	
	
	ui = function(user, logout) {
		/* Load apps */
		apploader()
		/* Render main template */
		.then(function(apps) {
			var manifests;
			
			/* Extract app manifests and render applets */
			manifests = Object.keys(apps).map(function(name) {
				var app = apps[name],
					manifest = app.manifest;
				
				manifest.appletNode = app.renderApplet();
				manifest.activate = function() {
					if (this.classList.contains("active")) {
						return;
					}
					
					$$(this.parentNode, ".app.active").forEach(function(elem) {
						elem.classList.remove("active");
					});
					
					$("#viewport").innerHTML = "";
					$("#viewport").appendChild(app.render());
					
					this.classList.add("active");
				};
				return manifest;
			});
			
			$("#login-container").style.display = "none";
			$("#main-container").style.display = "block";
			
			$("#main-container").innerHTML = "";
			$("#main-container").appendChild(
				template.render({
					user: user,
					logout: logout,
					apps: manifests
				})
			);
		})
		.otherwise(function(err) {
			ui.error(err.message, err.stack);
		});
	};
	
	
	ui.error = function(title, details) {
		console.error(title);
		console.error(details);
	};
	
	return ui;
});