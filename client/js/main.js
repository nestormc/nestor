/*jshint browser:true */
/*global define, require, $, $$ */

(function(global) {
	"use strict";
	
	global.$ = function(selector) {
		return document.querySelector(selector);
	};
	global.$$ = function(selector) {
		return [].slice.call(document.querySelectorAll(selector));
	};
	
	require.config({
		paths: {
			'domReady': 'lib/domReady',
			'ist': 'lib/ist'
		},
		
		packages: [
			 { name: 'when', location: 'lib/when/', main: 'when' }
		]
	});

	require(['domReady', 'rest', 'login', 'ui'], function(domReady, rest, login, ui) {
		domReady(function() {
			rest.loginStatus().then(function(user) {
				if (user) {
					ui(user, login.logout);
				} else {
					login();
				}
			});
		});
	});
}(this));