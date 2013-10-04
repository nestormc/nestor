/*jshint node:true */
"use strict";

var crypto = require("crypto"),
	express = require("express"),
	lessMiddleware = require("less-middleware"),
	util = require("util"),
	yarm = require("yarm"),
	
	config = require("./config").server,
	logger = require("./logger").createLogger("http"),
	
	app = express();


/* Basic express configuration */
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser());
app.use(express.session({
	secret: crypto.randomBytes(32).toString("base64"),
	cookie: {
		maxAge: 1000 * 60 * 60 * 24 * config.sessionDays
	}
}));

/* Serve LESS-compiled CSS from client/ */
app.use(lessMiddleware({
	src: __dirname + "/../../client",
	force: true,
	pre: function(src, req) {
		if (req.param("namespace")) {
			src = req.param("namespace") + " { " + src + " } ";
		}
		
		return src;
	}
}));

/* Serve static files from client/ */
app.use(express["static"](__dirname + "/../../client"));

/* Heartbeat handler */
app.use("/heartbeat", function(req, res) {
	res.send(204);
});

/* Log REST requests */
app.use("/rest", function(req, res, next) {
	var message = util.format("%s %s", req.method, req.url);

	if (req.body && Object.keys(req.body).length > 0) {
		message += "\nRequest-body: " + util.inspect(req.body);
	}

	logger.debug(message);

	next();
});

/* Serve YARM rest resources */
app.use("/rest", yarm());

/* Catchall error handler */
app.use(function errorHandler(err, req, res, next) {
	logger.error("Unhandled exception: %s\n%s", err.message, err.stack);
	next(err);
});

/* Override Buffer toJSON */
Buffer.prototype.toJSON = function() {
	return "[Buffer]";
}

exports.authHandler = function(handler) {
	function ensureSalt(req) {
		if (!req.session.salt) {
			req.session.salt = crypto.randomBytes(32).toString("base64");
		}
	}

	yarm.resource("login", {
		/* Status/salt request */
		get: function(req, callback) {
			var status;

			ensureSalt(req);

			if (req.session.user) {
				status = { user: req.session.user };
			} else {
				status = { salt: req.session.salt };
			}

			process.nextTick(function() {
				callback(null, status);
			});
		},

		/* Login */
		put: function(req, patch, callback) {
			var data = req.body,
				status;

			ensureSalt(req);

			handler(
				req.connection.remoteAddress,
				req.session.salt,
				data.user,
				data.password,
				function(err, granted) {
					if (granted) {
						req.session.user = data.user;
						status = { user: data.user };
					} else {
						status = {};
					}

					process.nextTick(function() {
						callback(null, status);
					});
				}
			);
		},

		/* Logout */
		del: function(req, callback) {
			req.session.destroy();

			var err = new Error("No content");
			err.code = 204;

			process.nextTick(function() {
				callback(err);
			});
		}
	});
};


/* Launch HTTP server */
exports.init = function() {
	logger.info("Starting HTTP server on :%s", config.port);
	app.listen(config.port);
};
