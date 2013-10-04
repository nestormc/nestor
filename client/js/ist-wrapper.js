/*jshint browser:true */
/*global define */

define(["ist", "ajax", "dom"], function(ist, ajax, dom) {
	"use strict";


	ist.helper("svg", function(context, value, tmpl, fragment) {
		var data = typeof value === "string" ? { src: value } : value,
			container = fragment.firstChild;

		if (!container) {
			container = context.createElement("span");
			fragment.appendChild(container);
		}

		ajax.cachedXML(data.src).then(function(xml) {
			var svg = context.importNode(xml.querySelector("svg"), true);

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