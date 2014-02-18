var requireConfig = {
	baseUrl: "js",

	paths: {
		domReady: "bower/requirejs-domready/domReady",
		signals: "bower/js-signals/dist/signals",
		ist: "bower/ist/ist",
		async: "bower/requirejs-plugins/src/async",
		goog: "bower/requirejs-plugins/src/goog",
		propertyParser : "bower/requirejs-plugins/src/propertyParser",
		moment: "bower/momentjs/moment",

		tmpl: "../templates"
	},

	packages: [
		{ name: "when", location: "bower/when/", main: "when" }
	],

	// deps: [ "when/monitor/console" ]
};

if (typeof process !== "undefined" && process.versions && !!process.versions.node) {
	module.exports = requireConfig;
} else {
	var require = requireConfig;
}