/*jshint browser:true */
/*global define */

define(["ist", "ist!tmpl/components/menu", "ajax", "dom", "login"], function(ist, menuTemplate, ajax, dom, login) {
	"use strict";

	var menuBehaviour = {
		".menuicon": {
			"click": function() {
				dom.$P(this, ".menu").classList.toggle("visible");
			}
		}
	};


	ist.helper("menu", function(context, value, tmpl, iterate) {
		iterate(function(key, rendered) {
			return menuTemplate.render({ items: tmpl.render(context), behaviour: menuBehaviour });
		});
	});


	ist.helper("if-right", function(context, value, tmpl, iterate) {
		iterate(login.hasRight(value) ? [value] : [], function(key, rendered) {
			if (rendered) {
				rendered.update(context);
			} else {
				return tmpl.render(context);
			}
		});
	});


	function getSVGHelper(className, getURL) {
		getURL = getURL || function(v) { return v; };

		return function(context, value, tmpl, iterate) {
			iterate(function(key, rendered) {
				var data = typeof value === "string" ? { src: value } : value;
				data.src = getURL(data.src);

				if (!rendered) {
					rendered  = context.createElement("span");
					rendered.classList.add(className);

					if (data.colorize) {
						rendered.classList.add("nestor-colorized");
					}
				}

				if (rendered.loading === data.src || rendered.loaded === data.src) {
					// Already loading or loaded this SVG, do nothing
					return;
				}

				rendered.loading = data.src;
				delete rendered.loaded;

				ajax.cachedXML(data.src).then(function(xml) {
					var svg = context.importNode(xml.querySelector("svg"), true);

					if (rendered.loading !== data.src) {
						// Already loading an other URI for this SVG, ignore this one
						return;
					}

					delete rendered.loading;
					rendered.loaded = data.src;

					// Allow resize
					svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
					svg.setAttribute("viewBox", "0 0 " + svg.getAttribute("width") + " " + svg.getAttribute("height"));

					// Set misc attributes
					if (data.title) {
						svg.setAttribute("title", data.title);
					}

					if (rendered.firstChild) {
						rendered.replaceChild(svg, rendered.firstChild);
					} else {
						rendered.appendChild(svg);
					}
				}).otherwise(function(err) {
					if (rendered.loading !== data.src) {
						// Already loading an other URI for this SVG, ignore the error
						return;
					}

					delete rendered.loading;
					console.error(err);
				});

				return rendered;
			});
		};
	}

	function uriHelper() {
		var args = [].slice.call(arguments);
		return args.shift().replace(/%s/g, function() {
				return encodeURIComponent(args.shift());
			});
	}


	ist.helper("svg", getSVGHelper("svg-container", function(name) { return "static/" + name; }));
	ist.helper("icon", getSVGHelper("icon", function(name) {
		if (name.indexOf(":") === -1) {
			return uriHelper("static/icons/%s.svg", name);
		} else {
			var split = name.split(":");
			var plugin = split[0];
			var icon = split[1];

			return uriHelper("static/plugins/%s/icons/%s.svg", plugin, icon);
		}
	}));


	ist.helper("behave", function(context, value, tmpl, iterate) {
		iterate(function(key, rendered) {
			if (rendered) {
				rendered.update(context.value);
			} else {
				rendered = tmpl.render(context.value);
			}

			dom.behave(rendered, value);
			return rendered;
		});
	});


	ist.global("humanTime", function(duration) {
		var hours = Math.floor(duration / 3600),
			minutes = Math.floor(duration % 3600 / 60),
			seconds = Math.floor(duration) % 60;

		return hours === 0 ? minutes + ":" + (seconds > 9 ? seconds : "0" + seconds)
						   : hours + "h" + (minutes > 9 ? minutes : "0" + minutes) + "m" + (seconds > 9 ? seconds : "0" + seconds) + "s";
	});


	ist.global("humanSize", function(size, suffix, decimals) {
		var suffixes = ["", "k", "M", "G", "T", "P", "E"];
		size = Math.floor(size);

		if (typeof decimals === "undefined") {
			decimals = 1;
		}

		var precision = Math.pow(10, decimals);

		while (size > 1024 && suffixes.length > 1) {
			size = size / 1024;
			suffixes.shift();
		}

		return (Math.floor(size * precision) / precision) + " " + suffixes[0] + (suffix || "");
	});

	ist.global("uri", uriHelper);

	return ist;
});