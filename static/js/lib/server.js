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
 * Web server request helper module
 */
 
define(function() {
	"use strict";
	
	var server = {},
		progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
		createXHR;

	createXHR = (function () {
		var xhr, i, progId, mkActiveX;

		if (typeof XMLHttpRequest !== 'undefined') {
			return function () {
				return new XMLHttpRequest();
			};
		} else {
			mkActiveX = function (progId) {
				return new ActiveXObject(progId);
			};
			
			for (i = 0; i < 3; i++) {
				progId = progIds[i];
				try {
					xhr = new ActiveXObject(progId);
				} catch (e) { }

				if (xhr) {
					xhr = undefined;
					return mkActiveX.bind(null, progId);
				}
			}
		}

		throw new Error("Cannot create XmlHttpRequest");
	}());
	
	
	server.request = function(method, uri, headers, body, callback) {
		var xhr = createXHR();
		
		xhr.onreadystatechange = function() {
			var err;
			
			if (this.readyState !== 4) {
				return;
			}
			
			if (this.status >= 400) {
				err = new Error("HTTP status " + this.status + ": " + this.statusText);
				callback(err, this.responseText);
			} else {
				callback(null, this.responseText);
			}
		};
		
		xhr.open(method, uri, true);
		
		headers = headers || {};
		Object.keys(headers).forEach(function(key) {
			xhr.setRequestHeader(key, headers[key]);
		});
		
		try {
			xhr.send(body);
		} catch (e) {
			callback(e);
		}
	};
	
	
	server.json = function(method, uri, headers, body, callback) {
		headers = headers || {};
		headers['Accept'] = 'application/json';
		
		if (body && typeof body !== 'string') {
			try {
				body = JSON.stringify(body);
			} catch(e) {
				return callback(e);
			}
			headers['Content-Type'] = 'application/json';
		}

		this.request(method, uri, headers, body, function(e, response) {
			var responseJson;
			
			if (e) {
				return callback(e, response);
			}
			
			try {
				responseJson = JSON.parse(response);
			} catch (e) {
				return callback(e, response);
			}
			
			callback(null, responseJson);
		});
	};
	
	
	server.getJson = function(uri, callback) {
		this.json('GET', uri, null, null, callback);
	};
	
	
	server.postJson = function(uri, obj, callback) {
		this.json('POST', uri, null, obj, callback);
	};
	
	return server;
});
