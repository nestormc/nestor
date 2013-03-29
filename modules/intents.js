/*jshint node:true */
'use strict';

var events = require('events'),
	util = require('util'),
	
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

intents.dispatch = function(intent, args, callback) {
	var index = 0,
		handlersCopy, next;
	
	logger.debug("Intent %s dispatched (%s)", intent, util.inspect(args));
	
	prepareIntent(intent);
	handlersCopy = handlers[intent].slice();
	
	next = function(param) {
		if (param === false) {
			// End processing chain
			return callback(null);
		} else if (param) {
			callback(param);
		}
		
		if (handlersCopy[index]) {
			handlersCopy[index++](args, next);
		} else {
			// No more handlers
			if (index === 0) {
				logger.warn("No handlers for intent %s", intent);
			}
			
			callback(null);
		}
	};
	
	next();
};

module.exports = intents;