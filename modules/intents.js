/*jshint node:true */
'use strict';

var events = require('events'),
	util = require('util'),
	when = require('when'),
	
	intents = {},
	handlers = {},
	
	logger = require('./logger');
	
	
function prepareIntent(intent) {
	handlers[intent] = handlers[intent] || [];
}

intents.register = function(intent, handler) {
	var index;
	
	prepareIntent(intent);
	index = handlers[intent].indexOf(handler);
	if (index === -1) {
		handlers[intent].push(handler);
	}
};

intents.unregister = function(intent, handler) {
	var index;
	
	prepareIntent(intent);
	index = handlers[intent].indexOf(handler);
	if (index !== -1) {
		handlers[intent].splice(index, 1);
	}
};

intents.dispatch = function(intent, args) {
	var index = 0,
		deferred = when.defer(),
		handlersCopy, next;
	
	logger.debug("Intent %s dispatched (%s)", intent, args ? util.inspect(args) : "no data");
	
	prepareIntent(intent);
	handlersCopy = handlers[intent].slice();
	
	next = function(param) {
		if (param === false) {
			// End processing chain
			deferred.resolve();
		} else if (param) {
			deferred.resolve(param);
		} else if (handlersCopy[index]) {
			handlersCopy[index++](args, next);
		} else {
			// No more handlers
			if (index === 0) {
				logger.warn("No handlers for intent %s", intent);
			}
			
			return deferred.resolve();
		}
	};
	
	next();
	return deferred.promise;
};

module.exports = intents;