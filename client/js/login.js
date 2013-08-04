/*jshint browser:true */
/*global require, define, $, $$, CryptoJS */

define(["ist!tmpl/login", "signals", "rest"], function(template, signals, rest) {
	"use strict";
	
	var currentInput,
		loginStatus = {
			user: null,
			salt: null
		},
		loginResource = {
			status: function(cb) {
				rest.get("login", function(err, result) {
					loginStatus.user = (result ? result.user : null) || null;
					loginStatus.salt = (result ? result.salt : null) || null;

					cb(err, loginStatus.user);
				});
			},

			login: function(user, password, cb) {
				if (user === "admin") {
					// Admin password: lowercase and remove spaces
					password = password.toLowerCase().replace(/ /g, "");
				}

				rest.put("login", {
					user: user,
					password: CryptoJS.HmacSHA1(password, loginStatus.salt).toString()
				}, function(err, result) {
					loginStatus.user = (result ? result.user : null) || null;

					if (err) {
						cb(err);
					} else {
						cb(null, user);
					}
				});
			},

			logout: function(cb) {
				loginStatus.user = null;
				rest.del("login", function() {
					loginResource.status(cb);
				});
			}
		};
	

	function loginKeypress(e) {
		if (e.keyCode === 13 && this.value) {
            var input = $("#password input");

			// Switch to password input
			$("#password").style.display = "block";
			$("#login").style.display = "none";
			
			input.focus();
			currentInput = input;
		}
	}
	

	function passKeypress(e) {
		if (e.keyCode === 13 && this.value) {
			loginResource.login($("#login input").value, this.value, function(err, user) {
				if (!user) {
					login("login failed");
				} else {
					currentInput = null;
					
					// Login successfull
					login.loggedIn.dispatch(user);
				}
			});
		}
	}
	

	function blur() {
		// Restore focus
		if (currentInput) {
			setTimeout(function() {
				currentInput.focus();
			}, 50);
		}
	}


	// Show login UI
	function login(error) {
		if (!$("#login")) {
			$("#login-container").replaceChild(
				template.render({
					loginKeypress: loginKeypress,
					passKeypress: passKeypress,
					blur: blur
				}),
				$("#loading")
			);
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
		loginResource.logout(function() {
			login();
		});
	};

	login.status = loginResource.status;
	
	return login;
});