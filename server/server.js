/*jshint node:true */
"use strict";

var http = require("http"),
	https = require("https"),
	fs = require("fs"),
	path = require("path"),
	express = require("express"),
	lessMiddleware = require("less-middleware"),
	requirejs = require("requirejs"),
	yarm = require("yarm"),
	logger = require("log4js").getLogger("server"),
	MongoStore = require("connect-mongo")(express),

	config = require("./config"),

	intents = require("./intents"),
	auth = require("./auth"),
	streaming = require("./streaming"),
	io = require("./io"),

	app = express();



var serverConfig = config.server;
serverConfig.host = serverConfig.host || "localhost";
serverConfig.port = serverConfig.port || (serverConfig.ssl ? 443 : 80);

var webHost = (serverConfig.ssl ? "https" : "http") + "://" + serverConfig.host + ":" + serverConfig.port;


/*!
 * Common helpers
 */



function lessPreprocessor(src, req) {
	src = "@import \"defs.less\";\n" + src;

	if (req.param("namespace")) {
		src = req.param("namespace") + " { " + src + " } ";
	}

	return src;
}



function rjsBuild(options, next) {
	logger.debug("Building " + options.out);

	requirejs.optimize(
		options,
		function(output) {
			logger.debug("Build output:\n%s", output);
			next();
		},
		function(err) {
			logger.error("Build error for %s: %s", options.out, err);
			next(err);
		}
	);
}



function rjsBuilder(name, next) {
	var options;

	if (name === "nestor") {
		options = {
			baseUrl: clientRoot,
			name: "nestor",
			paths: {
				domReady: "bower/requirejs-domready/domReady",
				signals: "bower/js-signals/dist/signals",
				ist: "bower/ist/ist",
				async: "bower/requirejs-plugins/src/async",
				goog: "bower/requirejs-plugins/src/goog",
				propertyParser : "bower/requirejs-plugins/src/propertyParser",
				moment: "bower/momentjs/moment",

				tmpl: "templates",

				chromecast: "empty:",
				socketio: "empty:"
			},

			packages: [
				{ name: "when", location: "bower/when/", main: "when" }
			]
		};
	} else if (name in plugins && plugins[name].build) {
		var build = plugins[name].build;

		options = {
			baseUrl: build.base,
			name: name,
			paths: {
				/* Path to ist to allow template compilation, but it will be stubbed in the output */
				"ist": path.join(clientRoot, "bower/ist/ist"),

				/* Do not look for modules provided by the client plugin loader */
				"ui": "empty:",
				"router": "empty:",
				"storage": "empty:",
				"plugins": "empty:",
				"when": "empty:",
				"rest": "empty:",
				"io": "empty:",
				"dom": "empty:",
				"moment": "empty:"
			},
			stubModules: ["ist"]
		};

		if (build.paths) {
			Object.keys(build.paths).forEach(function(path) {
				options.paths[path] = build.paths[path];
			});
		}
	} else {
		return next();
	}

	options.out = path.join(path.join(publicRoot, "js"), name + "-min.js");
	//options.optimize = "uglify2";
	options.optimize = "none";

	if (app.get("env") === "development") {
		// Force build
		rjsBuild(options, next);
	} else {
		// Only build when file does not exist
		fs.stat(options.out, function(err) {
			if (err) {
				rjsBuild(options, next);
			} else {
				next();
			}
		});
	}
}



/*!
 * Session configuration and Authentication
 */



app.use(express.cookieParser());
app.use(express.session({
	secret: serverConfig.cookieSecret,
	cookie: {
		maxAge: 1000 * 60 * 60 * 24 * (serverConfig.sessionDays || 2)
	},
	store: new MongoStore({ url: config.database })
}));
auth.listen(app, webHost);



/*!
 * Static client files
 */



var nestorRoot = path.normalize(path.join(__dirname, ".."));
var clientRoot = path.join(nestorRoot, "client");
var publicRoot = path.join(clientRoot, "public");

app.use(lessMiddleware(
	publicRoot,
	{
		force: true,
		preprocess: {
			less: lessPreprocessor
		}
	}
));


app.use("/js/require.js", function(req, res, next) {
	res.sendfile(path.join(nestorRoot, "node_modules/requirejs/require.js"));
});


app.get(/^\/js\/(\w+)-min\.js$/, function(req, res, next) {
	rjsBuilder(req.params[0], next);
});

app.use(express.static(publicRoot));


var plugins = {};
function registerPlugin(name, clientPlugin) {
	plugins[name] = clientPlugin;

	if (clientPlugin.public) {
		app.use("/plugins/" + name, lessMiddleware(
			clientPlugin.public,
			{
				force: true,
				preprocess: {
					less: lessPreprocessor
				}
			},
			{
				paths: [path.join(publicRoot, "style")]
			}
		));

		app.use("/plugins/" + name, express.static(clientPlugin.public));
	}
}



/*!
 * REST endpoints
 */



/* Log REST requests */
app.use("/rest", express.json());
app.use("/rest", function(req, res, next) {
	if (req.body && Object.keys(req.body).length > 0) {
		logger.debug("REST-%s %s %j", req.method, req.url, req.body);
	} else {
		logger.debug("REST-%s %s", req.method, req.url);
	}

	next();
});

/* Serve YARM rest resources */
app.use("/rest", yarm());

/* Override Buffer toJSON, just in case yarm sends an object with a huge buffer */
Buffer.prototype.toJSON = function() {
	return "[Buffer]";
};

/* Plugin list */
yarm.resource("plugins")
	.count(function(req, cb) {
		cb(null, Object.keys(plugins).length);
	})
	.list(function(req, offset, limit, cb) {
		var ary = Object.keys(plugins);

		if (limit) {
			ary = ary.slice(offset, offset + limit);
		} else {
			ary = ary.slice(offset);
		}

		cb(null, ary);
	});


/*!
 * Streaming endpoints
 */


streaming.listen(app);


/*!
 * Misc handlers
 */


/* Heartbeat handler, can be used to check for connectivity with nestor */
app.use("/heartbeat", function(req, res) {
	res.send(204);
});

/* Catchall error handler */
app.use(function errorHandler(err, req, res, next) {
	logger.error("Unhandled exception: %s\n%s", err.message, err.stack);

	if (app.get("env") === "development") {
		res.send("<h1>" + err.message + "</h1><pre>" + err.stack + "</pre>");
	} else {
		res.send(500, "Internal server error");
	}
});



/*!
 * Intent handlers
 */



/* Allow plugins to add GET routes with nestor:http:get intent.
   Plugins SHOULD prefer REST resources with yarm. But this can be used
   to achieve shorter URLs (I'm looking at you, nestor-share plugin) */
intents.on("nestor:http:get", function(route, handler) {
	app.get(route, handler);
});


intents.on("nestor:startup", function() {
	/* Launch HTTP server */
	var server;

	if (serverConfig.ssl) {
		var sslOptions;

		try {
			sslOptions = {
				key: fs.readFileSync(serverConfig.ssl.keyFile),
				cert: fs.readFileSync(serverConfig.ssl.certFile)
			};
		} catch(e) {
			logger.error("Cannot start HTTPS server: %s", e.message);
			throw e;
		}

		logger.info("Starting web server on %s", webHost);
		server = https.createServer(sslOptions, app);
		server.listen(serverConfig.port, serverConfig.host);
	} else {
		logger.info("Starting wbe server on %s", webHost);
		server = http.createServer(app);
		server.listen(serverConfig.port, serverConfig.host);
	}

	io.listen(server);
});


module.exports = {
	registerPlugin: registerPlugin
};
