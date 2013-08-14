/*jshint browser:true */
/*global define, require, $, $$, console */

(function(global) {
	"use strict";
	
	/*!
	 * DOM query helpers
	 */

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

	/*!
	 * Main require configuration
	 */

	var mainConfig = {
		context: "nestor",
		baseUrl: "js",

		paths: {
			"domReady": "bower/requirejs-domready/domReady",
			"signals": "bower/js-signals/dist/signals.js",
			"ist": "lib/ist",
			"tmpl": "../templates"
		},

		packages: [
			{ name: "when", location: "bower/when/", main: "when" }
		]
	};

	var mainRequire = require.config(mainConfig);

	
	function error(err) {
		console.log("=== TOPLEVEL ERROR ===");
		console.log(err.message);
		console.log(err.stack);
	}

	mainRequire(
	["ist", "login", "ui", "router", "apploader", "rest"],
	function(ist, login, ui, router, apploader, rest) {
		rest.heartBeatLost.add(function(err) {
			var lost = $("#heartbeat-lost"),
				msg = $(lost, "#message");

			lost.style.display = "block";
			msg.innerText = err.message;
		});

		rest.heartBeatRestored.add(function() {
			var lost = $("#heartbeat-lost");

			lost.style.display = "none";
		});

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