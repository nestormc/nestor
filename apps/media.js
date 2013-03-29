/*jshint node:true */
'use strict';

var async = require('async'),
	fs = require('fs'),
	path = require('path');
	

exports.init = function(nestor, callback) {
	var walkDirectory, statWalkItem, analyzeFile, workQueue, updateConcurrency;
	
	walkDirectory = function(dir, callback) {
		nestor.logger.debug("Walking directory %s", dir);
		fs.readdir(dir, function dirReader(err, files) {
			if (err) {
				nestor.logger.error("Could not read directory %s: %s", dir, err.message);
			} else {
				// Push files on the workqueue
				workQueue.push(files.map(function(file) {
					return { type: 'stat', path: path.join(dir, file) };
				}));
			}
			
			callback(null);
		});
	};

	statWalkItem = function(item, callback) {
		fs.stat(item, function(err, stat) {
			if (err) {
				nestor.logger.error("Could not stat %s: %s", item, err.message);
			} else {
				if (stat.isDirectory()) {
					workQueue.push({ type: 'walk', path: item });
				} else {
					workQueue.push({ type: 'analyze', path: item });
				}
			}
			
			callback(null);
		});
	};

	analyzeFile = function(file, callback) {
		nestor.intents.dispatch('media.analyzeFile', { path: file }, callback);
	};

	workQueue = async.queue(function(task, callback) {
		switch (task.type) {
			case 'walk':
				walkDirectory(task.path, callback);
				break;
				
			case 'stat':
				statWalkItem(task.path, callback);
				break;
				
			case 'analyze':
				analyzeFile(task.path, callback);
				break;
				
			default:
				callback(new Error("Unknown task type: " + task.type));
				break;
		}
	}, 1);
	
	updateConcurrency = function(value) {
		workQueue.concurrency = value || 1;
	};
	nestor.config.watch('media.concurrency', updateConcurrency);
	
	nestor.intents.register('nestor.startup', function(args, next) {
		nestor.config.get('media.directory', function(value) {
			if (!value) {
				nestor.logger.warn("No media directory (set 'media.directory' configuration value)");
			} else {
				workQueue.push({ type: 'walk', path: value });
			}
			next();
		});
	});
	
	callback(null);
};

exports.manifest = {
	description: "Media scanning dispatcher"
};
