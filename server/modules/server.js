/*jshint node:true */
"use strict";

var crypto = require("crypto"),
	express = require("express"),
	lessMiddleware = require("less-middleware"),
	yarm = require("yarm"),
	logger = require("log4js").getLogger("server"),
	
	config = require("./config").server,
	share = require("./share"),
	auth = require("./auth"),
	
	app = express();


/* Basic express configuration */
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

/* Auth handler */
app.use("/auth", express.json());
auth.init(app, "http://" + config.host + ":" + config.port);

/* Heartbeat handler */
app.use("/heartbeat", function(req, res) {
	res.send(204);
});

/* Log REST requests */
app.use("/rest", function(req, res, next) {
	if (req.body && Object.keys(req.body).length > 0) {
		logger.debug("%s %s %j", req.method, req.url, req.body);
	} else {
		logger.debug("%s %s", req.method, req.url);
	}
	
	next();
});

/* Serve YARM rest resources */
app.use("/rest", express.json());
app.use("/rest", yarm());

/* Override Buffer toJSON, just in case yarm sends and object with a huge buffer */
Buffer.prototype.toJSON = function() {
	return "[Buffer]";
};

/* Downloads */
app.get("/download/:shortId", function(req, res, next) {
	share.pipeShortIdStream(req, req.params.shortId, function(name) {
		res.setHeader("Content-Type", "application/octet-stream");
		res.setHeader("Content-Disposition", "attachment; filename=\"" + name.replace(/"/g, "\\\"") + "\"");
	}, res, function(err) {
		if (err) {
			res.send(404, "Not found");
		}
	});
});

app.get("/download/:provider/:resource", function(req, res, next) {
	share.pipeDownloadStream(req.params.provider, req.params.resource, function(name) {
		res.setHeader("Content-Type", "application/octet-stream");
		res.setHeader("Content-Disposition", "attachment; filename=\"" + name.replace(/"/g, "\\\"") + "\"");
	}, res, function(err) {
		if (err) {
			res.send(404, "Not found");
		}
	});
});

/* Catchall error handler */
app.use(function errorHandler(err, req, res, next) {
	logger.error("Unhandled exception: %s\n%s", err.message, err.stack);
});

/* Launch HTTP server */
exports.init = function() {
	logger.info("Starting HTTP server on %s:%s", config.host, config.port);
	app.listen(config.port, config.host);
};
