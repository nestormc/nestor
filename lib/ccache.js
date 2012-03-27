/*jslint white: true, plusplus: true */
"use strict";

var misc = require('./misc'),
	mongoose = require('mongoose'),
	cache = {};

function addCursor(cursor, count) {
	var uid;
	
	// Generate new UID
	do {
		uid = misc.uid(32, true);
	} while (cache.hasOwnProperty(uid));
	
	cache[uid] = {
		type: (cursor instanceof mongoose.Query ? 'mongoose' : 'array'),
		cursor: cursor,
		count: count,
		fetched: 0
	};
	
	return uid;
}


function removeCursor(uid) {
	delete cache[uid];
}


function handleLimitedRequest(uid, limit, res, next) {
	var item = cache[uid],
		cursor = item.cursor,
		offset = item.fetched,
		count = item.count,
		drained = false,
		dataHandler;

	dataHandler = function(err, docs) {
		if (err) {
			return next(err);
		}
		
		item.fetched = offset = offset + docs.length;
		if (offset >= count) {
			// Cursor drained, remove from cache
			drained = true;
			removeCursor(uid);
		}
		
		res.setHeader('Content-Type', 'application/json');		
		res.end(JSON.stringify({
			cursorId: uid,
			docs: docs,
			drained: drained
		}));
	};
	
	if (item.type === 'array') {
		if (limit) {
			dataHandler(null, cursor.slice(offset, offset + limit));
		} else {
			dataHandler(null, cursor.slice(offset));
		}
	} else {
		if (limit) {
			cursor.skip(offset).limit(limit).find(dataHandler);
		} else {
			cursor.skip(offset).find(dataHandler);
		}
	}
};


exports.handleCursor = function (req, res, next, err, cursor) {
	var contentHandler, countHandler,
		limit,
		isArray = Array.isArray(cursor),
		isQuery = !isArray && (cursor instanceof mongoose.Query);
	
	if (err || !cursor) {
		return next(err);
	} else if (!isArray && !isQuery) {
		return next(new Error('Invalid cursor'));
	}
	
	// Did we get a limit ?
	limit = parseInt(req.headers['x-cursor-limit'], 10);
	
	if (isNaN(limit) || limit === 0) {
		// No limit; send full cursor content
		contentHandler = function(err, docs) {
			if (err) {
				return next(err);
			}
			
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify(docs));
		};
		
		if (isArray) {
			contentHandler(null, cursor);
		} else {
			cursor.run(contentHandler);
		}
	} else {
		// Read cursor count
		countHandler = function(err, count) {
			if (err) {
				return next(err);
			}
		
			// Put cursor in cache and handle limited request
			handleLimitedRequest(
				addCursor(cursor, count),
				limit, 
				res,
				next
			);
		};
		
		if (isArray) {
			countHandler(null, cursor.length);
		} else {
			cursor.count(countHandler);
		}
	}
};

exports.getHandler = function (req, res, next) {
	var uid = req.params.id,
		item = cache[uid],
		limit;
		
	if (!uid || !item) {
		res.writeHead(404, 'unknown cursor');
		res.end();
	} else {
		limit = parseInt(req.headers['x-cursor-limit'], 10);
		if (isNaN(limit)) {
			limit = 0;
		}
		
		handleLimitedRequest(uid, limit, res, next);
	}
};

exports.discardHandler = function (req, res, next) {
	var uid = req.params.id;
	removeCursor(uid);
	
	res.writeHead(203, 'empty');
	res.end();
};

