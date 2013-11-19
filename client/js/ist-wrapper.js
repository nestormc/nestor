/*jshint browser:true */
/*global define */

define(["ist", "ajax", "dom", "login"], function(ist, ajax, dom, login) {
	"use strict";


	ist.helper("if-right", function(context, value, tmpl, fragment) {
		var rendered = fragment.extractRenderedFragment();
	
		if (login.hasRight(value)) {
			if (rendered) {
				rendered.update(context);
			} else {
				rendered = tmpl.render(context);
			}

			fragment.appendRenderedFragment(rendered);
		}
	});


	ist.helper("svg", function(context, value, tmpl, fragment) {
		var data = typeof value === "string" ? { src: value } : value,
			container = fragment.firstChild;

		if (!container) {
			container = context.createElement("span");
			fragment.appendChild(container);
		}

		if (container.loading === data.src || container.loaded === data.src) {
			// Already loading or loaded this SVG, do nothing
			return;
		}

		container.loading = data.src;
		delete container.loaded;

		ajax.cachedXML(data.src).then(function(xml) {
			var svg = context.importNode(xml.querySelector("svg"), true);

			if (container.loading !== data.src) {
				// Already loading an other URI for this SVG, ignore this one
				return;
			}

			delete container.loading;
			container.loaded = data.src;

			// Allow resize
			svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
			svg.setAttribute("viewBox", "0 0 " + svg.getAttribute("width") + " " + svg.getAttribute("height"));

			// Set misc attributes
			if (data.title) {
				svg.setAttribute("title", data.title);
			}

			if (container.firstChild) {
				container.replaceChild(svg, container.firstChild);
			} else {
				container.appendChild(svg);
			}
		}).otherwise(function(err) {
			if (container.loading !== data.src) {
				// Already loading an other URI for this SVG, ignore the error
				return;
			}

			delete container.loading;
			console.error(err);
		});
	});


	ist.helper("behave", function(context, value, tmpl, fragment) {
		var rendered = fragment.extractRenderedFragment();

		if (rendered) {
			rendered.update(context.value);
		} else {
			rendered = tmpl.render(context.value);
		}

		fragment.appendRenderedFragment(rendered);
		dom.behave(fragment, value);
	});

	return ist;
});