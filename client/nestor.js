/*jshint browser:true */
/*global define, require, console */

(function() {
	"use strict";

	function error(err) {
		console.log("=== TOPLEVEL ERROR ===");
		console.log(err.message);
		console.log(err.stack);
	}

	require(
	["ist", "dom", "login", "ui", "router", "settings/settings", "player/player", "storage", "plugins", "ajax", "rest"],
	function(ist, dom, login, ui, router, settings, player, storage, plugins, ajax, rest) {
		var $ = dom.$;
		var apps = [settings, player];

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
				.then(function(plugins) {
					ui.start(user, plugins, apps, router);
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