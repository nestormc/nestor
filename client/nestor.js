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
			"chromecast": {
				exports: "chrome",
				init: function() {
					return this.chrome.cast;
				}
			},

			"socketio": {
				exports: "io"
			},
		},

		paths: {
			"chromecast": "https://www.gstatic.com/cv/js/sender/v1/cast_sender",
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

		// Loading status helper
		var loading = {
			items: {},

			reset: function() {
				this.items = {};
				this.update();
			},

			update: function() {
				var keys = Object.keys(this.items);
				var count = keys.length;
				var self = this;

				var loading = $("#loading");
				var initial = $("#initial-loading");
				var startedBar = $("#loading .available");
				var loadedBar = $("#loading .fill");
				var message = $("#loading .message");

				if (count === 0) {
					loading.style.display = "none";
				} else {
					var started = keys.filter(function(k) { return self.items[k] === "loading"; });
					var loaded = keys.filter(function(k) { return self.items[k] === "done"; }).length;
					var errored = keys.filter(function(k) { return self.items[k] === "error"; })[0];

					loading.style.display = "block";
					if (initial) {
						initial.style.display = "none";
					}

					startedBar.style.width = (100 * started.length / count) + "%";
					loadedBar.style.width = (100 * loaded / count) + "%";

					if (errored) {
						message.textContent = "Error loading " + errored;
					}
				}
			},

			add: function(item) {
				this.items[item] = "pending";
				this.update();
			},

			start: function(item) {
				this.items[item] = "loading";
				this.update();
			},

			error: function(item) {
				this.items[item] = "error";
				this.update();
			},

			done: function(item) {
				this.items[item] = "done";
				this.update();
			}
		};

		loading.reset();
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
			loading.done("checking login status");

			if (user) {
				storage.user = user;

				router.on("/logout", function(err, req, next) {
					ui.stop().then(function() {
						storage.user = undefined;
						router.reset();
						rest.stop();
						login.logout();
						loading.reset();
					});
				});

				rest.start();

				plugins(ui, router, storage, io, loading)
				.then(function(plugins) {
					ui.start(user, plugins, apps, router);
					router.start();
				})
				.otherwise(error);
			} else {
				loading.reset();
				login(loginError);
				loginError = false;
			}
		}

		login.loggedIn.add(checkLogin);

		loading.start("checking login status");

		login.status()
		.then(checkLogin)
		.otherwise(error);
	});
}());