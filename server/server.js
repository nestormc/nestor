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
	serverConfig = config.server,

	intents = require("./intents"),
	auth = require("./auth"),
	
	app = express();



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

				tmpl: "templates"
			},

			packages: [
				{ name: "when", location: "bower/when/", main: "when" }
			]
		};
	} else if (name === "require") {
		return next();
	} else {
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
				"dom": "empty:",
			},
			stubModules: ["ist"]
		};

		if (build.paths) {
			Object.keys(build.paths).forEach(function(path) {
				options.paths[path] = build.paths[path];
			});
		}
	}

	options.out = path.join(path.join(publicRoot, "js"), name + ".js");
	options.optimize = "uglify2";
	options.generateSourceMaps = true;
	options.preserveLicenseComments = false;

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
app.use("/auth", express.json());
auth.init(app, "http://" + serverConfig.host + ":" + serverConfig.port);



/*!
 * Static client files
 */



var nestorRoot = path.normalize(path.join(__dirname, ".."));
var clientRoot = path.join(nestorRoot, "client");
var publicRoot = path.join(clientRoot, "public");

app.use(lessMiddleware({
	src: publicRoot,
	force: true,
	preprocessor: lessPreprocessor
}));


app.use("/js/require.js", function(req, res, next) {
	res.sendfile(path.join(nestorRoot, "node_modules/requirejs/require.js"));
});
	

app.get(/^\/js\/(\w+)\.js$/, function(req, res, next) {
	rjsBuilder(req.params[0], next);
});

app.use(express.static(publicRoot));


var plugins = {};
function registerPlugin(name, clientPlugin) {
	plugins[name] = clientPlugin;

	app.use("/plugins/" + name, lessMiddleware({
		src: clientPlugin.public,
		force: true,
		paths: [path.join(publicRoot, "style")],
		preprocessor: lessPreprocessor
	}));

	app.use("/plugins/" + name, express.static(clientPlugin.public));
}



/*!
 * REST endpoints
 */



/* Log REST requests */
app.use("/rest", function(req, res, next) {
	if (req.body && Object.keys(req.body).length > 0) {
		logger.debug("REST-%s %s %j", req.method, req.url, req.body);
	} else {
		logger.debug("REST-%s %s", req.method, req.url);
	}
	
	next();
});

/* Serve YARM rest resources */
app.use("/rest", express.json());
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

		logger.info("Starting HTTPS server on %s:%s", serverConfig.host, serverConfig.ssl.port);
		https.createServer(sslOptions, app).listen(serverConfig.ssl.port, serverConfig.host);
	}

	if (!serverConfig.ssl || !serverConfig.ssl.mandatory) {
		logger.info("Starting HTTP server on %s:%s", serverConfig.host, serverConfig.port);
		http.createServer(app).listen(serverConfig.port, serverConfig.host);
	}
});


module.exports = {
	registerPlugin: registerPlugin
};
