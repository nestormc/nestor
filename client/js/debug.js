/*jshint browser:true */
/*global define */

define(["ist!tmpl/debug", "ist!tmpl/rest-data", "ajax", "router", "dom"], function(debugTemplate, restTemplate, ajax, router, dom) {
	"use strict";

	return {
		render: function() {
			var $ = dom.$,
				node = debugTemplate.render(),
				debug = $(node, "#debug"),
				loading = $(node, "#rest #loading"),
				display = $(node, "#rest #display");

			dom.behave(node, {
				"#rest input": {
					"keydown": function(e) {
						var url = this.value;
						e.stopPropagation();

						if (e.which === 13 || e.which === 10) {
							loading.innerHTML = "Loading " + url + "...";
							loading.style.display = "block";

							ajax.text("GET", this.value)
							.then(function(text) {
								var obj;

								loading.style.display = "none";
								display.innerHTML = "";

								try {
									obj = JSON.parse(text);
								} catch(e) {
									display.innerHTML = text;
								}

								if (obj) {
									try {
										display.appendChild(restTemplate.render(obj));
									} catch(e) {
										display.innerHTML = "ERROR: " + e.stack;
									}
								}

								display.style.display = "block";
							})
							.otherwise(function(err) {
								loading.innerHTML = "Error loading " + url + ": " + err.message;
							});
						}
					}
				}
			});

			router.on("!debug/open", function(req, res, next) {
				debug.style.display = "block";
				next();
			});

			router.on("!debug/close", function(req, res, next) {
				debug.style.display = "none";
				next();
			});

			return node;
		}
	};
});
