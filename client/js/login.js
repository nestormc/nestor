/*jshint browser:true */
/*global require, define, $, $$ */

define(["ist!tmpl/login", "ui", "rest"], function(template, ui, rest) {
	"use strict";
	
	var login,
		loginKeypress,
		passKeypress,
		blur,
		currentInput;
	
	loginKeypress = function(e) {
		if (e.keyCode === 13 && this.value) {
            var input = $("#password input");

			// Switch to password input
			$("#password").style.display = "block";
			$("#login").style.display = "none";
			
			input.focus();
			currentInput = input;
		}
	};
	
	passKeypress = function(e) {
		if (e.keyCode === 13 && this.value) {
			rest.login($("#login input").value, this.value).then(
				function(user) {
					if (!user) {
						login("login failed");
					} else {
						currentInput = null;
						ui(user, login.logout);
					}
				}
			);
		}
	};
	
	blur = function(e) {
		// Restore focus
		if (currentInput) {
			setTimeout(function() {
				currentInput.focus();
			}, 50);
		}
	};
	
	// Show login UI
	login = function(error) {
		if (!$("#login")) {
			$("#login-container").appendChild(
				template.render({
					loginKeypress: loginKeypress,
					passKeypress: passKeypress,
					blur: blur
				})
			);
		}

        var input = $("#login input");
		
		$("#login-container").style.display = $("#login").style.display = "block";
		$("#main-container").style.display = $("#password").style.display = "none";
		$("#login .error").innerHTML = error || '';
		
		input.value = $("#password input").value = "";
		input.focus();
		currentInput = input;
	};
	
	login.logout = function() {
		rest.logout().then(function() {
			login();
		});
	};
	
	return login;
});
