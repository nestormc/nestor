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
	'lib/plugins',
	'lib/dom',
	'i18n!nls/lang',
	'ist!templates/login',
	'ist!templates/master'
], function(acl, plugins, dom, lang, loginTemplate, masterTemplate) {
	"use strict";
	
	var body = dom.body(),
		master = {};
	
	/**
	 * Empty viewport and show login form; handle login.
	 * @private
	 */
	function showLogin() {
		var form;
		
		dom.empty(body);
		body.appendChild(loginTemplate.render({ lang: lang }));
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
	 * Empty viewport, load plugins, and show main UI
	 * @private
	 */
	function showMainUI(userName) {
		// Load plugins
		plugins.getPages(function(e, pages) {
			// Show UI
			dom.empty(body);
			body.appendChild(masterTemplate.render({
				lang: lang,
				userName: userName,
				pages: pages
			}));
			
			// Disconnect handler
			dom.addListener('a#disconnect', 'click', function() {
				acl.logout(showLogin);
				return false;
			});
			
			// Page show handlers
			pages.forEach(function(p) {
				var link = dom.get('a[data-page="' + p.id + '"]'),
					vp = dom.get('div.pageViewport[data-page="' + p.id + '"]');
				
				dom.addListener(link, 'click', function(e) {
					var slink = dom.get('#pagetree a.selected'),
						svp = dom.get('div.pageViewport.visible');
				
					if (slink !== link) {
						if (slink) {
							dom.classList(slink).remove('selected');
							dom.classList(svp).remove('visible');
						}
						
						// Render page the first time
						if (!dom.classList(vp).contains('rendered')) {
							p.render(function(e, node) {
								dom.classList(vp).remove('rendering');
									
								if (e) {
									vp.innerHTML = e;
								} else {
									vp.appendChild(node);
								}
							});
							
							dom.classList(vp).add('rendering');
							dom.classList(vp).add('rendered');
						}
						
						dom.classList(link).add('selected');
						dom.classList(vp).add('visible');
					}
					
					return false;
				});
			});
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
