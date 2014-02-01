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
			ist: "bower/ist/ist",
	        async: "bower/requirejs-plugins/src/async",
	        goog: "bower/requirejs-plugins/src/goog",
	        propertyParser : "bower/requirejs-plugins/src/propertyParser",
	        moment: "bower/momentjs/moment",

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
		],

		deps: [ "when/monitor/console" ]
	};

	var mainRequire = require.config(mainConfig);

	
	function error(err) {
		console.log("=== TOPLEVEL ERROR ===");
		console.log(err.message);
		console.log(err.stack);
	}

	mainRequire(
	["dom", "login", "ui", "router", "settings", "storage", "plugins", "ajax", "rest"],
	function(dom, login, ui, router, settings, storage, plugins, ajax, rest) {
		var $ = dom.$;

		ajax.connectionStatusChanged.add(function(connected) {
			var lost = $("#heartbeat-lost");

			if (connected) {
				lost.style.display = "none";
			} else {
				var msg = $(lost, "#message");

				lost.style.display = "block";
				msg.innerText = "Oops...";
			}
		});

		var getErrorParameter = (function() {
			var rxPlus = /\+/g,
				rxRoute = /error=([^&]*)/;

			function decode(str) {
				return decodeURIComponent(str.replace(rxPlus, " "));
			}

			return function() {
				var query = location.search.substring(1),
					match = rxRoute.exec(query);

				if (match) {
					return decode(match[1]);
				}
			};
		}());

		var loginError = getErrorParameter();

		function checkLogin(user) {
			if (user) {
				storage.user = user;

				router.on("/logout", function(err, req, next) {
					ui.stop().then(function() {
						storage.user = undefined;
						router.reset();
						rest.stop();
						login.logout();
					});
				});
				
				rest.start();
				plugins(ui, router, storage)
				.then(function(apps) {
					ui.start(user, apps, router, settings);
					router.start();
				})
				.otherwise(error);
			} else {
				login(loginError);
				loginError = false;
			}
		}
		
		login.loggedIn.add(checkLogin);
		
		login.status()
		.then(checkLogin)
		.otherwise(error);
	});
}());