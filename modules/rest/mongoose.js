/*jshint node:true */

"use strict";

var mongoose = require("mongoose"),
	resource = require("./resource"),
	utils = require("./utils");


/**
 * Helper to create a resource from a mongoose document property
 */
function mongooseValueResource(prefix, doc, path) {
	return {
		get: function(req, cb) {
			process.nextTick(function() {
				cb(null, doc.get(path));
			});
		},

		put: function(req, data, patch, cb) {
			doc.set(path, data);
			doc.save(function(err) {
				cb(err, doc.get(path));
			});
		}
	};
}


function mongooseDocResource(prefix, doc) {
	return {
		sub: function(id, cb) {
			var subitem = doc.get(id),
				subprefix = prefix + "/" + doc._id + "/" + id;

			if (subitem instanceof mongoose.Types.DocumentArray) {
				subitem = mongooseDocArrayResource(subprefix, doc, id);
			} else if (subitem instanceof mongoose.Types.Embedded) {
				subitem = mongooseDocResource(subprefix, subitem);
			} else {
				subitem = mongooseValueResource(subprefix, doc, id);
			}

			process.nextTick(function() {
				cb(null, subitem);
			});
		},

		get: function(req, cb) {
			var body = doc.toObject({ virtuals: true });

			utils.addHref(body, req, prefix, body._id);
			process.nextTick(function() {
				cb(null, body);
			});
		},

		put: function(req, data, patch, cb) {
			var resource = this;

			doc.update(data, function(err) {
				if (err) {
					cb(err);
				} else {
					resource.get(req, cb);
				}
			});
		},

		del: function(req, cb) {
			doc.remove(cb);
		}
	};
}


function mongooseDocArrayResource(prefix, doc, path) {
	var docArray = doc.get(path);

	return {
		isCollection: true,

		sub: function(id, cb) {
			var subdoc = docArray.id(id);

			process.nextTick(function() {
				cb(null, subdoc ? mongooseDocResource(prefix, subdoc) : null);
			});
		},

		count: function(req, cb) {
			process.nextTick(function() {
				cb(null, docArray.length);
			});
		},

		list: function(req, offset, limit, cb) {
			var sdocs;

			if (limit > 0) {
				sdocs = docArray.slice(offset, offset+limit);
			} else {
				sdocs = docArray.slice(offset);
			}

			sdocs.forEach(function(sdoc) {
				utils.addHref(sdoc, req, prefix, sdoc._id);
			});

			process.nextTick(function() {
				cb(null, sdocs);
			});
		},

		post: function(req, data, cb) {
			docArray.push(data);
			doc.save(cb);
		}
	};
}


/**
 * Define a REST resource that gives access to a Mongoose model collection
 *
 * @param name resource name
 * @param model Mongoose model
 */
function mongooseResource(name, model) {
	resource(name, {
		isCollection: true,

		sub: function(id, cb) {
			model.findById(id, function(err, item) {
				cb(err, item ? mongooseDocResource(name, item) : null);
			});
		},

		count: function(req, cb) {
			return model.count(cb);
		},

		list: function(req, offset, limit, cb) {
			return model.find({}).skip(offset).limit(limit).exec(function(err, items) {
				cb(err, items.map(function(item) {
					item = item.toObject({ virtuals: true });
					utils.addHref(item, req, name, item._id);

					return item;
				}));
			});
		},

		post: function(req, data, cb) {
			model.create(data, cb);
		}
	});
}


module.exports = mongooseResource;
