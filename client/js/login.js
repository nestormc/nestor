/*jshint browser:true */
/*global require, define, $, $$ */

define(["ist", "ui", "rest"], function(ist, ui, rest) {
	"use strict";
	
	var login,
		loginKeypress,
		passKeypress;
	
	loginKeypress = function(e) {
		if (e.keyCode === 13 && this.value) {
			// Switch to password input
			$("#password").style.display = "block";
			$("#login").style.display = "none";
			
			$("#password input").focus();
		}
	};
	
	passKeypress = function(e) {
		if (e.keyCode === 13 && this.value) {
			rest.login($("#login input").value, this.value).then(
				function(user) {
					if (!user) {
						login("login failed");
					} else {
						ui(user, login.logout);
					}
				}
			);
		}
	};

	// Show login UI
	login = function(error) {
		var template = ist.fromScriptTag("loginForm");
		
		if (!$("#login")) {
			$("#login-container").appendChild(
				template.render({
					loginKeypress: loginKeypress,
					passKeypress: passKeypress
				})
			);
		}
		
		$("#login-container").style.display = $("#login").style.display = "block";
		$("#main-container").style.display = $("#password").style.display = "none";
		$("#login .error").innerHTML = error || '';
		
		$("#login input").value = $("#password input").value = "";
		$("#login input").focus();
	};
	
	login.logout = function() {
		rest.logout().then(function() {
			login();
		});
	};
	
	return login;
});
