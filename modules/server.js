/*jshint node:true */
'use strict';

var express = require('express'),
	mongoose = require('mongoose'),
	util = require('util'),
	
	config = require('./config'),
	logger = require('./logger').createLogger('http'),
	
	app = express(),
	resources = [],
	wrapDocument;
	

app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express['static'](__dirname + '/../client'));
app.use(app.router);
app.use(function errorHandler(err, req, res, next) {
	app.logger.error("Unhandled exception: %s\n%s", err.message, err.stack);
	res.restStatus(500, err.message);
});

/* Parse REST-specific query parameters */
app.all('/rest/*', function(req, res, next) {
	if (req.param('fields')) {
		req.fields = req.param('fields').split(',');
	}
	
	req.skip = parseInt(req.param('skip'), 10);
	req.limit = parseInt(req.param('limit'), 10);

	if (isNaN(req.skip)) {
		req.skip = 0;
	}
	
	if (isNaN(req.limit)) {
		req.limit = 10;
	}
	
	res.restStatus = function(status, message) {
		this.send(status, { _status: status, _message: message });
	};
	
	next();
});


/* Make custom REST resource available */
exports.resource = function(name, resource) {
	var prefix = '/rest/' + name;
	
	resources.push(name);
		
	if (resource.list) {
		app.get(prefix, resource.list);
	}
	
	if (resource.get) {
		app.get(prefix + '/:id', resource.get);
	}
	
	if (resource.create) {
		app.post(prefix, resource.create);
	}
	
	if (resource.update) {
		app.put(prefix + '/:id', resource.update);
	}
	
	if (resource.remove) {
		app.del(prefix + '/:id', resource.remove);
	}
};


wrapDocument = function wrapDocument (req, name, doc) {
	doc._href = req.protocol + "://" + req.headers.host + "/rest/" + name + "/" + doc._id;
};


/* Make Mongoose model available as a REST resource */
exports.mongooseResource = (function() {
	var listResources, getResource, removeResource;
	
	listResources = function listResources(name, model, req, res, next) {
		var query = model.find({}),
			countq = model.find(query);
		
		if (req.fields) {
			query = query.select(req.fields.join(' '));
		}
		
		query
			.skip(req.skip)
			.limit(req.limit)
			.lean()
			.exec(function(err, docs) {
				if (err) {
					return next(err);
				}
				
				countq.count(function(err, count) {
					if (err) {
						return next(err);
					}
					
					docs.forEach(wrapDocument.bind(null, req, name));
					
					res.send({
						_count: count,
						_items: docs
					});
				});
			});
	};
	
	getResource = function getResource(name, model, req, res, next) {
		var query = model.findById(req.param('id'));
		
		if (req.fields) {
			query = query.select(req.fields.join(' '));
		}
		
		query
			.lean()
			.exec(function(err, doc) {
				if (err) {
					return next(err);
				}
				
				if (doc) {
					wrapDocument(req, name, doc);
					res.send(doc);
				} else {
					res.restStatus(404, 'Not found');
				}
			});
	};
	
	removeResource = function removeResource(name, model, req, res, next) {
		model.remove({ _id: req.param('id') }, function(err) {
			if (err) {
				return next(err);
			} else {
				res.restStatus(204, 'No content');
			}
		});
	};
	
	return function(name, model, options) {
		var resource;
		
		resource = {
			list: listResources.bind(null, name, model),
			get: getResource.bind(null, name, model),
			remove: removeResource.bind(null, name, model)
		};
	
		if (options && options.disable) {
			options.disable.forEach(function(method) {
				resource[method] = function(req, res, next) {
					res.restStatus(405, 'Method not allowed');
				};
			});
		}
		
		exports.resource(name, resource);
	};
}());


exports.mongooseView = (function() {
	var listResources;
	
	listResources = function listResources(name, model, query, req, res, next) {
		var countq = model.find(query);
			
		if (req.fields) {
			query = query.select(req.fields.join(' '));
		}
		
		query
			.skip(req.skip)
			.limit(req.limit)
			.lean()
			.exec(function(err, docs) {
				if (err) {
					return next(err);
				}
				
				countq.count(function(err, count) {
					if (err) {
						return next(err);
					}
					
					docs.forEach(wrapDocument.bind(null, req, name));
					
					res.send({
						_count: count,
						_items: docs
					});
				});
			});
	};
	
	return function(name, model, query) {
		exports.resource(name, { list: listResources.bind(null, name, model, query) });
	};
}());


exports.mongooseAggregate = (function() {
	var preparePipeline, listResources, getResource;
	
	preparePipeline = function(pipeline, req) {
		var p = pipeline.slice(),
			project;
		
		if (req.fields) {
			req.fields.forEach(function(field) {
				project[field] = 1;
			});
			
			p.push({ $project: project });
		}
		
		p.push({ $skip: req.skip });
		p.push({ $limit: req.limit });
		
		return p;
	};
	
	listResources = function listResources(name, model, pipeline, req, res, next) {
		var p = preparePipeline(pipeline, req);
		
		model.aggregate(p, function(err, docs) {
			if (err) {
				return next(err);
			}
			
			docs.forEach(wrapDocument.bind(null, req, name));
			
			res.send({
				_items: docs
			});
		});
	};
	
	return function(name, model, pipeline) {
		exports.resource(name, { list: listResources.bind(null, name, model, pipeline) });
	};
}());


/* Launch HTTP server */
exports.init = function() {
	config.get(['http.port'], function(port) {
		port = port || 8080;
		
		logger.info("Starting HTTP server on :%s", port);
		app.listen(port);
	});
};
