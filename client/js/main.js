/*jshint browser:true */
/*global define, require, $, $$ */

(function(global) {
	"use strict";
	
	global.$ = function(element, selector) {
		if (!selector) {
			selector = element;
			element = document;
		}
		
		return element.querySelector(selector);
	};
	
	global.$$ = function(element, selector) {
		if (!selector) {
			selector = element;
			element = document;
		}
		
		return [].slice.call(element.querySelectorAll(selector));
	};
	
	require.config({
		paths: {
			'domReady': 'lib/domReady',
			'ist': 'lib/ist',
			'tmpl': '../templates'
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