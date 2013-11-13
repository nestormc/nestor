/*jshint browser:true */
/*global define, require, console */

(function() {
	"use strict";

	/*!
	 * Main require configuration
	 */

	var mainConfig = {
		context: "nestor",
		baseUrl: "js",

		paths: {
			"hmac-sha1": "lib/hmac-sha1",

			domReady: "bower/requirejs-domready/domReady",
			signals: "bower/js-signals/dist/signals",
			ist: "bower/ist/dist/ist",
	        async: "bower/requirejs-plugins/src/async",
	        goog: "bower/requirejs-plugins/src/goog",
	        propertyParser : "bower/requirejs-plugins/src/propertyParser",

			tmpl: "../templates"
		},

		shim: {
			"hmac-sha1": {
				exports: "CryptoJS",
				init: function() {
					return this.CryptoJS.HmacSHA1;
				}
			}
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
	["dom", "login", "ui", "router", "storage", "apploader", "rest"],
	function(dom, login, ui, router, storage, apploader, rest) {
		var $ = dom.$;

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
				storage.user = user;

				router.on("/logout", function(err, req, next) {
					ui.stop();
					storage.user = undefined;
					router.reset();
					login.logout();
				});
				
				apploader(ui, router, storage)
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
		
		login.status()
		.then(checkLogin)
		.otherwise(error);
	});
}());