/*jshint browser:true */
/*global require, define, $, $$ */

define(["ist"], function(ist) {
	"use strict";
	
	var ui;
	
	ui = function(user, logout) {
		$("#login-container").style.display = "none";
		$("#main-container").style.display = "block";
		
		$("#main-container").innerHTML = "";
		$("#main-container").appendChild(
			ist.fromScriptTag("mainTemplate").render({
				user: user,
				logout: logout
			})
		);
	};
	
	return ui;
});