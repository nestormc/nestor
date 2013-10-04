/*jshint browser:true */
/*global define */

define(["ist!tmpl/login", "hmac-sha1", "signals", "when", "rest", "dom"],
function(template, hmacSHA1, signals, when, rest, dom) {
	"use strict";
	
	var $ = dom.$,
		currentInput,
		loginStatus = {
			user: null,
			salt: null
		},
		loginResource = {
			status: function() {
				var d = when.defer();

				rest.get("login")
				.then(function(result) {
					loginStatus.user = (result ? result.user : null) || null;
					loginStatus.salt = (result ? result.salt : null) || null;

					d.resolve(loginStatus.user);
				})
				.otherwise(function(err) {
					d.reject(err);
				});

				return d.promise;
			},

			login: function(user, password) {
				var d = when.defer();

				if (user === "admin") {
					// Admin password: lowercase and remove spaces
					password = password.toLowerCase().replace(/ /g, "");
				}

				rest.put("login", {
					user: user,
					password: hmacSHA1(password, loginStatus.salt).toString()
				})
				.then(function(result) {
					loginStatus.user = result.user;

					d.resolve(result.user);
				})
				.otherwise(function(err) {
					loginStatus.user = null;

					d.reject(err);
				});

				return d.promise;
			},

			logout: function() {
				loginStatus.user = null;

				return rest.del("login").then(function() { return loginResource.status(); });
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
				if (e.keyCode === 13 && this.value) {
		            var input = $("#password input");

					// Switch to password input
					$("#password").style.display = "block";
					$("#login").style.display = "none";
					
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

	// Show login UI
	function login(error) {
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
		$("#login .error").innerHTML = error || "";
		
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
	
	return login;
});