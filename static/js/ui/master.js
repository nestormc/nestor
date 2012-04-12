/*
 * Copyright 2010-2012 Nicolas Joyard
 *
 * This file is part of nestor.
 *
 * nestor is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * nestor is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with nestor.  If not, see <http://www.gnu.org/licenses/>.
 */

/*jslint white: true, browser: true, plusplus: true */
/*global define, require */

/*
 * Web masterpage
 */

define([
	'lib/acl',
	'lib/dom',
	'i18n!nls/lang',
	'ist!templates/login',
	'ist!templates/master'
], function(acl, dom, lang, loginTemplate, masterTemplate) {
	"use strict";
	
	var master = {};
	
	/**
	 * Empty viewport and show login form; handle login.
	 * @private
	 */
	function showLogin() {
		var form;
		
		dom.empty(master.container);
		master.container.appendChild(loginTemplate.render({ lang: lang }));
		form = dom.get('form.login');
		
		dom.addListener(form, 'submit', function(e) {
			acl.login(
				dom.get(form, '#login').value,
				dom.get(form, '#password').value, 
				function (e, userName) {
					if (e) {
						dom.get(form, '#error').innerHTML = e;
					} else {
						showMainUI(userName);
					}
				}
			);
		
			return false;
		});
	}
	
	
	/**
	 * Empty viewport and show main UI
	 * @private
	 */
	function showMainUI(userName) {
		dom.empty(master.container);
		master.container.appendChild(masterTemplate.render({
			lang: lang,
			userName: userName
		}));
		
		dom.addListener('a#disconnect', 'click', function() {
			acl.logout(showLogin);
			return false;
		});
	}
	
	
	/**
	 * Masterpage startup: check authentication
	 * @private
	 */
	function startup() {
		master.container = dom.get('#mainContainer');
		
		acl.getStatus(function(e, resp) {
			if (e) {
				throw e;
			}
			
			if (resp.userName) {
				showMainUI(resp.userName);
			} else {
				showLogin();
			}
		});
	}

	master.startup = function() {
		dom.ready(startup);
	};
	
	return master;
});
