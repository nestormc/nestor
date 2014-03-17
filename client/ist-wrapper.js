/*jshint browser:true */
/*global define */

define(["ist", "ajax", "dom", "login"], function(ist, ajax, dom, login) {
	"use strict";


	ist.helper("if-right", function(context, value, tmpl, iterate) {
		iterate(login.hasRight(value) ? [value] : [], function(key, rendered) {
			if (rendered) {
				rendered.update(context);
			} else {
				return tmpl.render(context);
			}
		});
	});


	ist.helper("svg", function(context, value, tmpl, iterate) {
		iterate(function(key, rendered) {
			var data = typeof value === "string" ? { src: value } : value;

			if (!rendered) {
				rendered  = context.createElement("span");
				rendered.classList.add("svg-container");
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
	});


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


	ist.global("humanSize", function(size) {
		var suffixes = ["", "k", "M", "G", "T"];
		size = Math.floor(size);

		while (size > 1024) {
			size = size / 1024;
			suffixes.shift();
		}

		return (Math.floor(size * 10) / 10) + " " + suffixes[0] + suffix;
	});

	ist.global("uri", function() {
		var args = [].slice.call(arguments);
		return args.shift().replace(/%s/g, function() {
				return encodeURIComponent(args.shift());
			});
	});

	return ist;
});