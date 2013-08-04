/*jshint browser:true */
/*global define, require, $, $$, console */

(function(global) {
	"use strict";
	
	global.$ = function(element, selector) {
		if (!selector) {
			selector = element;
			element = document;
		}
		
		return element.querySelector(selector);
	};
	
	global.$$ = function(element, selector) {
		if (!selector) {
			selector = element;
			element = document;
		}
		
		return [].slice.call(element.querySelectorAll(selector));
	};
	
	require.config({
		paths: {
			"domReady": "lib/domReady",
			"ist": "lib/ist",
			"signals": "lib/signals",
			"tmpl": "../templates"
		},
		
		packages: [
			 { name: "when", location: "lib/when/", main: "when" }
		]
	});
	
	function error(err) {
		console.log("=== TOPLEVEL ERROR ===");
		console.log(err.message);
		console.log(err.stack);
	}

	require(
	["ist", "login", "ui", "router", "apploader"],
	function(ist, login, ui, router, apploader) {
		function checkLogin(user) {
			if (user) {
				router.on("/logout", function(err, req, next) {
					router.reset();
					login.logout();
				});
				
				apploader(ui, router)
				.then(function(apps) {
					ui.start(user, apps, router);
					router.start();
				})
				.otherwise(error);
			} else {
				login();
			}
		}
		
		login.loggedIn.add(checkLogin);
		login.status(function(err, user) {
			if (err) {
				error(err);
			} else {
				checkLogin(user);
			}
		});
	});
}(this));