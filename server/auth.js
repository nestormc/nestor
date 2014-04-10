/*jshint node:true */

"use strict";

var bodyParser = require("body-parser"),
	express = require("express"),
	crypto = require("crypto"),
	mongoose = require("mongoose"),
	passport = require("passport"),
	LocalStrategy = require("passport-local").Strategy,
	GoogleStrategy = require("passport-google").Strategy,
	TwitterStrategy = require("passport-twitter").Strategy,
	yarm = require("yarm"),

	config = require("./config").auth,
	logger = require("log4js").getLogger("auth"),
	intents = require("./intents");


var knownRights = [];


var AdminUser = {
	identifier: "admin",

	displayName: "admin",

	validatePassword: function(password) {
		return config.admin.password === password;
	},

	hasRight: function() {
		return !config.admin.disabled;
	},

	policy: "allow",
	rights: []
};


var UserSchema = new mongoose.Schema({
	identifier: String,

	lastLogin: Date,
	displayName: { type: String, default: "" },
	authData: { type: String, default: "" },

	policy: { type: String, default: "deny" },
	rights: [String]
});

UserSchema.methods.hasRight = function(right) {
	if (this.policy === "allow") {
		return this.rights.indexOf(right) === -1;
	} else {
		return this.rights.indexOf(right) !== -1;
	}
};

UserSchema.methods.validatePassword = function(password) {
	var parts = this.authData.split(":"),
		salt = parts[0],
		hashed = parts[1];

	return crypto.createHmac("sha1", salt).update(password).digest("base64") === hashed;
};

UserSchema.methods.setPassword = function(password) {
	var salt = crypto.randomBytes(32).toString("base64");
	var hashed = crypto.createHmac("sha1", salt).update(password).digest("base64");

	this.authData = salt + ":" + hashed;
};

UserSchema.virtual("provider").get(function() {
	return this.identifier.split(":")[0];
});

UserSchema.virtual("userid").get(function() {
	var userid = this.identifier.replace(/^[^:]+:/, "");

	if (this.provider === "twitter") {
		return "@" + userid;
	} else {
		return userid;
	}
});

var User = mongoose.model("user", UserSchema);


function findLocalUser(username, cb) {
	if (username === "admin") {
		process.nextTick(function() { cb(null, AdminUser); });
	} else {
		User.findOneAndUpdate(
			{ identifier: "local:" + username },
			{ lastLogin: new Date() },
			{},
			cb
		);
	}
}


function handleAuthentification(strategy, req, res, next) {
	passport.authenticate(strategy, function(err, user, info) {
		if (err) {
			return next(err);
		}

		if (!user) {
			logger.debug("Login failed from %s: %j", req.ip, info);

			if (strategy === "local") {
				return res.send(401, "Not authorized");
			} else {
				return res.redirect("/?error=not-authorized");
			}
		}

		logger.debug("Login successful from %s for user %j", req.ip, user);

		req.login(user, function(err) {
			if (err) {
				return next(err);
			}

			if (user === AdminUser) {
				logger.warn("Admin login from %s", req.ip);
			}

			if (strategy === "local") {
				// Send JSON response
				res.send(200, {
					user: user.displayName,
					policy: user.policy,
					rights: user.rights
				});
			} else {
				// Redirect to root
				res.redirect("/");
			}
		});
	})(req, res, next);
}


intents.on("nestor:right", function(right) {
	right.regexp = new RegExp(
		"^" +
		right.route.replace(/\*/g, ".*").replace(/:\w+/g, "[^\/]+") +
		"$", "i"
	);

	knownRights.push(right);
});

function countRights(req, cb) {
	process.nextTick(function() { cb(null, knownRights.length); });
}

function listRights(req, offset, limit, cb) {
	var arr;

	if (limit > 0) {
		arr = knownRights.slice(offset, offset + limit);
	} else {
		arr = knownRights.slice(offset);
	}

	process.nextTick(function() {
		cb(null, arr.map(function(right) {
			return {
				name: right.name,
				description: right.description
			};
		}));
	});
}

yarm.mongoose("users", User)
	.set("key", "identifier")
	.set("toObject", {
		virtuals: true,

		transform: function(doc, ret, options) {
			delete ret._id;
			delete ret.__v;
		}
	})

	.post(function(req, cb) {
		var values = req.body;

		var user = new User();
		user.policy = "deny";
		user.rights.push("nestor:login");

		switch (values.type) {
			case "local":
				if (values.username === "admin") {
					return cb(new Error("Invalid user name: " + values.username));
				}

				user.identifier = "local:" + values.username;
				user.displayName = values.username;
				user.setPassword(values.password);
				break;

			case "google":
				user.identifier = "google:" + values.googlemail;
				user.displayName = values.googlemail;
				break;

			case "twitter":
				user.identifier = "twitter:" + values.twitterhandle.replace(/^@/, "");
				user.displayName = "@" + values.twitterhandle.replace(/^@/, "");
				break;

			default:
				return cb(new Error("Unknown user type: " + values.type));
		}

		logger.warn("POSTing user %j", user);

		user.save(function(err) {
			if (err) {
				return cb(err);
			}

			cb.created();
		});
	})

	// Allow removing right by name instead of array index
	.sub(":docid/rights/:right")
		.del(function(req, cb) {
			var doc = req.mongoose.doc;
			var idx = doc.rights.indexOf(req.params.right);

			if (idx === -1) {
				cb.notFound();
			} else {
				doc.rights.splice(idx, 1);
				doc.save(function(err) {
					if (err) {
						cb(err);
					} else {
						cb.noContent();
					}
				});
			}
		});

yarm.resource("rights")
	.count(countRights)
	.list(listRights);


intents.on("nestor:startup", function() {
	intents.emit("nestor:right", {
		name: "nestor:users",
		route: "/users",
		description: "Manage users and their rights"
	});
});


exports.listen = function(app, host) {
	/* Initialize passport */

	app.use(passport.initialize());
	app.use(passport.session());

	passport.serializeUser(function(user, done) {
		done(null, user.identifier);
	});

	passport.deserializeUser(function(id, done) {
		if (id === "admin") {
			done(null, AdminUser);
		} else {
			User.findOneAndUpdate({ identifier: id }, { lastLogin: new Date() }, done);
		}
	});


	/* Setup auth strategies */

	passport.use(new LocalStrategy(
		function (username, password, done) {
			logger.debug("Local auth attempt for user %s", username);

			findLocalUser(username, function(err, user) {
				if (err) {
					return done(err);
				}

				if (!user) {
					return done(null, false, { message: "Unknown user" });
				}

				if (!user.validatePassword(password)) {
					return done(null, false, { message: "Invalid password" });
				}

				if (!user.hasRight("nestor:login")) {
					return done(null, false, { message: "Unauthorized user" });
				}

				done(null, user);
			});
		}
	));

	passport.use(new GoogleStrategy(
		{
			returnURL: host + "/auth/google/return",
			realm: host
		},
		function (id, profile, done) {
			logger.debug("Return from google auth with id %s and profile %j", id, profile);
			User.findOneAndUpdate(
				{ identifier: "google:" + profile.emails[0].value },
				{ displayName: profile.displayName, lastLogin: new Date() },
				{ upsert: true },
				function(err, user) {
					if (err) {
						return done(err);
					}

					if (!user.hasRight("nestor:login")) {
						return done(err, false, { message: "Unauthorized user" });
					}

					done(null, user);
				}
			);
		}
	));

	passport.use(new TwitterStrategy(
		{
			consumerKey: config.twitter.key,
			consumerSecret: config.twitter.secret,
			callbackURL: host + "/auth/twitter/return"
		},
		function (token, tokenSecret, profile, done) {
			logger.debug("Return from twitter auth with token %s, secret %s and profile %j", token, tokenSecret, profile);
			User.findOneAndUpdate(
				{ identifier: "twitter:" + profile.username },
				{ displayName: profile.displayName, lastLogin: new Date() },
				{ upsert: true },
				function(err, user) {
					if (err) {
						return done(err);
					}

					if (!user.hasRight("nestor:login")) {
						return done(err, false, { message: "Unauthorized user" });
					}

					done(null, user);
				}
			);
		}
	));


	/* Setup login routes */

	app.use("/auth", bodyParser.json());

	app.post("/auth/login", function(req, res, next) {
		handleAuthentification("local", req, res, next);
	});

	app.get("/auth/google", passport.authenticate("google"));
	app.get("/auth/google/return", function(req, res, next) {
		handleAuthentification("google", req, res, next);
	});

	app.get("/auth/twitter", passport.authenticate("twitter"));
	app.get("/auth/twitter/return", function(req, res, next) {
		handleAuthentification("twitter", req, res, next);
	});

	app.get("/auth/logout", function(req, res, next) {
		req.logout();
		res.send(204);
	});

	app.get("/auth/status", function(req, res, next) {
		if (req.isAuthenticated()) {
			res.send({
				user: req.user.displayName,
				policy: req.user.policy,
				rights: req.user.rights
			});
		} else {
			res.send({});
		}
	});


	/* Setup rights checking middleware */

	app.use("/rest", function(req, res, next) {
		var restricted = !req.isAuthenticated() || knownRights.some(function(right) {
			if ((!right.methods || right.methods.indexOf(req.method) !== -1) && req.path.match(right.regexp)) {
				if (!req.user.hasRight(right.name)) {
					logger.debug("Denied access to %s /rest%s to user %s who's missing right %s",
						req.method, req.path, req.user.identifier, right.name);
					return true;
				}
			}

			return false;
		});

		if (restricted) {
			res.send(401, "Forbidden");
		} else {
			next();
		}
	});
};
