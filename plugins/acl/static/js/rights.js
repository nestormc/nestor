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

/*
 * ACL configuration plugin - Rights page
 */

define([
	'ist!assets/templates/rights'
], function(rTemplate) {
	"use strict";
	
	var page = {};
	
	page.title = "Rights";
	
	page.init = function() {
		this.addStyleSheet('style.css');
	};
	
	page.render = function(callback) {
		this.get('/rights/', function(err, rights) {
			callback(null, rTemplate.render({ realms: rights }));
		});
	};
	
	return page;
});
