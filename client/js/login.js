/*jshint browser:true */
/*global define */

define(["ist!tmpl/login", "signals", "when", "ajax", "dom"],
function(template, signals, when, ajax, dom) {
	"use strict";
	
	var $ = dom.$,
		currentInput,
		currentStatus;

	var loginResource = {
			status: function() {
				var d = when.defer();

				ajax.json("get", "/auth/status")
				.then(function(status) {
					currentStatus = status;
					d.resolve(status.user);
				})
				.otherwise(function(err) {
					currentStatus = {};
					d.reject(err);
				});

				return d.promise;
			},

			login: function(user, password) {
				var d = when.defer();

				ajax.json("post", "/auth/login", { username: user, password: password })
				.then(function(status) {
					currentStatus = status;
					d.resolve(status.user);
				})
				.otherwise(function(err) {
					currentStatus = {};
					d.reject(err);
				});

				return d.promise;
			},

			logout: function() {
				return ajax.text("get", "/auth/logout");
			}
		};
	

	var loginBehaviour = {
		"input": {
			"blur": function blur() {
				// Restore focus
				if (currentInput) {
					setTimeout(function() {
						currentInput.focus();
					}, 50);
				}
			}
		},

		"input[type=text]": {
			"keyup": function loginKeypress(e) {
				showProviders(this.value.length === 0);

				if (e.keyCode === 13 && this.value) {
		            var input = $("#password input");

					// Switch to password input
					showProviders(false);
					$("#password").style.display = "block";
					$("#login").style.display = "none";
					error(false);
					
					input.focus();
					currentInput = input;
				}
			}
		},

		"input[type=password]": {
			"keyup": function passKeypress(e) {
				if (e.keyCode === 13 && this.value) {
					loginResource.login($("#login input").value, this.value)
					.then(function(user) {
						currentInput = null;

						// Login successfull
						login.loggedIn.dispatch(user);
					})
					.otherwise(function() {
						login("login failed");
					});
				}
			}
		}
	};


	function error(err) {
		if (err === "not-authorized") {
			err = "not authorized";
		}

		$("#login-container .error").innerHTML = err || "-";
		$("#login-container .error").style.visibility = err ? "visible" : "hidden";
	}


	function showProviders(show) {
		$("#auth-providers").style.display = show ? "block" : "none";
	}


	// Show login UI
	function login(err) {
		if (!$("#login")) {
			$("#login-container").replaceChild(
				template.render({}),
				$("#loading")
			);

			dom.behave($("#login-container"), loginBehaviour);
		}

        var input = $("#login input");

		$("#login-container").style.display = $("#login").style.display = "block";
		$("#main-container").style.display = $("#password").style.display = "none";
        showProviders(true);
		error(err);
		
		input.value = $("#password input").value = "";
		input.focus();
		currentInput = input;
	}
	
	
	login.loggedIn = new signals.Signal();
	
	login.logout = function() {
		return loginResource.logout().then(function() {
			login();
		});
	};

	login.status = loginResource.status;

	login.hasRight = function(right) {
		if (!currentStatus.user) {
			return false;
		} else {
			if (currentStatus.policy === "allow") {
				return currentStatus.rights.indexOf(right) === -1;
			} else {
				return currentStatus.rights.indexOf(right) !== -1;
			}
		}
	};
	
	return login;
});