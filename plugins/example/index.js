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

/**
 * Mongoose-based nestor plugin example
 */

/*jslint white: true, plusplus: true */
"use strict";

var mongoose = require('mongoose'),
	Schema = mongoose.Schema,
	ObjectId = Schema.ObjectId;


/* A simple model schema */
var personSchema = new Schema({
	name: String,
	age: Number,
	city: String
}); 
 

/* Plugin metadata */
exports.metadata = {
	title: "Example plugin",
	version: "1.0.0",
	author: "Nicolas Joyard",
	uri: "http://www.example.com"
};


/* Plugin static web files */
exports.statics = {
	dir: __dirname + '/static',
	category: 'Example',
	
	/* Plugin web pages */
	pages: [
		{
			title: 'Page 1',
			require: 'page1' // requires exports.statics.dir + '/js/example.page1.js'
		}
	]
};


/* Publish resources */
exports.resources = {
	person: {
		/* Mongoose schema; only necessary when using mongoose. If present, the
		   schema is registered by nestor when loading this plugin. */
		schema: personSchema,
		   
		/* Routes for /plugins/example/person/[route]. Each route has the following properties:
			- method: "GET" or "POST" ; optional, defaults to "GET".
			- route: string, Express route expression; a leading slash is ignored.
			- action: string, action name to perform when the route maches
			
		   Order matters: first routes are tried first.
		 */
		routes: [
			{ route: "/list", action: "list" },
			{ route: "/show/:id", action: "show" },
			{ route: "/create/:name/:age/:city", action: "create" }
		],
	
		/* Available actions. Each action is registered in nestors ACL and thus may
		   be individually allowed or disallowed for a specific user.
		   
		   Actions are called when a route referencing them matches. They are specified as an object
		   with keys 'type' (string) and 'code' (function).
		   
		   The following types are available:
		   - 'express' specifies that the action is an Express handler (accepting req, res, next
		     as parameters).
		   - 'cursor' specifies that the action returns a cursor-like object (ie. a mongoose
		     Query instance or an array). 'code' receives an Express request object and a callback
		     that can be called as :
				callback(new Error(...)) on error
				callback(null, CursorLikeObject) on success
				callback() when unable to handle the request (as calling next() in an Express handler) 
		    
		   Both types of action are called with a 'this' context providing the following properties:
		   - model: the mongoose Model if applicable
		   - logger: plugin logger (has debug, info, warning, error and fatal methods accepting the
		     same arguments as util.format)
		   - getRoute(route): returns a route for this model ('/plugins/example/person' + route)
		     
		 */
		actions: {
			list: {
				type: 'cursor',
				code: function(req, callback) {
					callback(null, this.model.find().fields(['name', 'age', 'city']));
				}
			},
		
			/* Express handlers can be specified without the 'type' key */
			show: function(req, res, next) {
				var id = req.params.id;
				this.model.find({_id: id}, function(err, docs) {
					var person;
					
					if (err || docs.length === 0) {
						res.writeHead(404);
						res.end();
					} else {
						person = docs[0];
						
						res.setHeader('Content-Type', 'text/plain');
						res.end(person.name + ' aged '+ person.age + ' from ' + person.city);
					}
				});
			},
			
			create: function(req, res, next) {
				var self = this,
					Person = self.model,
					person = new Person();
					
				person.name = req.params.name;
				person.age = parseInt(req.params.age, 10);
				person.city = req.params.city;
				
				person.save(function(err) {
					var uri = self.getRoute('/show/' + person._id.toString());
					
					res.setHeader("Content-Type", "text/html");
					res.end("created <a href='" + uri + "'>" + person.name + "</a>");
				});
			}
		}
	}
};


/* Plugin initialization function */
exports.init = function(nestor, callback) {
	var log = nestor.logger;
	
	log.info("Initializing example plugin");
	
	/* Register exit code */
	nestor.on('exit', function() {
		log.info("Unloading example plugin");
	});
	
	callback();
};

