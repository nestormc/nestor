/*jshint node:true */
'use strict';

var crypto = require('crypto'),
	express = require('express'),
	mongoose = require('mongoose'),
	util = require('util'),
	
	config = require('./config').server,
	logger = require('./logger').createLogger('http'),
	
	app = express(),
	resources = [],
	wrapDocument, notAllowed;
	

// Generic 405: not allowed response helper
notAllowed = function notAllowed(req, res, next) {
	res.restStatus(405, 'Method not allowed');
};

app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser());
app.use(express.session({
	secret: crypto.randomBytes(32).toString('base64'),
	cookie: {
		maxAge: 1000 * 60 * 60 * 24 * config.sessionDays
	}
}));
app.use(express['static'](__dirname + '/../client'));
app.use(app.router);
app.use(function errorHandler(err, req, res, next) {
	logger.error("Unhandled exception: %s\n%s", err.message, err.stack);
	next(err);
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

app.all('/rest/*', function(err, req, res, next) {
	res.restStatus(500, err.message);
});


/* Make custom REST resource available */
exports.resource = function(name, resource) {
	var prefix = '/rest/' + name;
	
	if (resources.indexOf(name) !== -1) {
		logger.warn("Resource '%s' was declared multiple times");
	}
	
	resources.push(name);
		
	app.get(prefix, resource.list || notAllowed);
	app.get(prefix + '/:id', resource.get || notAllowed);
	app.post(prefix, resource.create || notAllowed);
	app.put(prefix + '/:id', resource.update || notAllowed);
	app.del(prefix + '/:id', resource.remove || notAllowed);
	app.del(prefix, resource.purge || notAllowed);
};


wrapDocument = function wrapDocument (req, name, doc) {
	doc._href = req.protocol + "://" + req.headers.host + "/rest/" + name + "/" + doc._id;
};


/* Make Mongoose model available as a REST resource */
exports.mongooseResource = (function() {
	var listResources, getResource, removeResource, createResource;
	
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
	
	createResource = function createResource(name, model, req, res, next) {
		model(req.body).save(function(err, r) {
			logger.debug("CREATE %s \nerr = %s, \nr = %s", name, util.inspect(err), util.inspect(r));
			
			/* TODO	error handling
				err.name = 'MongoError'
				err.code = 11000 => duplicate key
			*/
			
			res.restStatus(204, 'No content');
		});
	};
	
	return function(name, model, options) {
		var resource;
		
		resource = {
			list: listResources.bind(null, name, model),
			get: getResource.bind(null, name, model),
			remove: removeResource.bind(null, name, model),
			create: createResource.bind(null, name, model)
		};
	
		if (options && options.disable) {
			options.disable.forEach(function(method) {
				resource[method] = notAllowed;
			});
		}
		
		exports.resource(name, resource);
	};
}());

/* Make custom mongoose Query available as a resource */
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

/* Make mongoose aggregate pipeline available as a resource */
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


exports.authHandler = function(handler) {
	var authHandler;
	
	authHandler = function(operation, req, res, next) {
		var response = {};
		
		if (operation === 'status') {
			if (!req.session.salt) {
				req.session.salt = crypto.randomBytes(32).toString('base64');
			}
			
			if (req.session.user) {
				res.send({ user: req.session.user });
			} else {
				res.send({ salt: req.session.salt });
			}
		}
		
		if (operation === 'login') {
			try {
				handler(
					req.connection.remoteAddress,
					req.session.salt,
					req.body.user,
					req.body.password,
					function(err, granted) {
						if (granted) {
							req.session.user = req.body.user;
							res.send({ user: req.body.user });
						} else {
							res.send({});
						}
					}
				);
			} catch(e) {
				throw e;
			}
		}
		
		if (operation === 'logout') {
			req.session.destroy();
			res.restStatus(204, "No content");
		}
	};
	
	exports.resource('login', {
		list: authHandler.bind(null, "status"),
		create: authHandler.bind(null, "login"),
		purge: authHandler.bind(null, "logout")
	});
};


/* Launch HTTP server */
exports.init = function() {
	logger.info("Starting HTTP server on :%s", config.port);
	app.listen(config.port);
};
