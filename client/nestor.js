/*jshint browser:true */
/*global define, require, console */

(function() {
	"use strict";

	function error(err) {
		console.log("=== TOPLEVEL ERROR ===");
		console.log(err.message);
		console.log(err.stack);
	}

	require.config({
		shim: {
			"socketio": {
				exports: "io"
			},
		},

		paths: {
			"socketio": "/socket.io/socket.io"
		}
	});

	require(
	[
		"ist", "dom", "login", "ui", "router", "storage", "plugins", "ajax", "rest", "io",
		"settings/settings", "player/player"
	],
	function(ist, dom, login, ui, router, storage, plugins, ajax, rest, io, settings, player) {
		var $ = dom.$;
		var apps = [settings, player];

		io.connect();

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

				plugins(ui, router, storage, io)
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