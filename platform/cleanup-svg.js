/*jshint node:true*/

var dom = require("minidom");
var path = require("path");
var glob = require("glob");
var fs = require("fs");

var src = path.normalize(path.join(__dirname, "svg"));
var dest = path.normalize(path.join(__dirname, "../client/public/images"));

glob("*.svg", { cwd: src }, function(err, files) {
	if (err) {
		return console.log("Glob error: " + err.message);
	}

	files.forEach(function(file) {
		if (file === "nestor.svg") {
			return;
		}

		var doc = dom(fs.readFileSync(path.join(src, file)).toString());


		// Remove unneeded tags
		["sodipodi:namedview", "metadata", "defs"].forEach(function(tag) {
			var tags = doc.getElementsByTagName(tag);
			for (var i = 0; i < tags.length; i++) {
				tags[i].parentNode.removeChild(tags[i]);
			}
		});


		// Rename root group
		var svg = doc.getElementsByTagName("svg")[0];
		var elems = [].slice.call(svg.childNodes).filter(function(n) { return n.nodeType === n.ELEMENT_NODE; });
		if (elems.length === 1 && elems[0].tagName === "G") {

		} else {
			console.log("WARNING: " + file + " has no root group");
		}

		// Remove all text and comment nodes
		function removeText(node) {
			[].slice.call(node.childNodes).forEach(function(child) {
				if (child.nodeType === child.TEXT_NODE) {
					node.removeChild(child);
				} else if (child.nodeType === child.ELEMENT_NODE) {
					removeText(child);
				} else if (child.nodeType === child.COMMENT_NODE && !child.textContent.match(/^\?xml/)) {
					node.removeChild(child);
				}
			});
		}

		removeText(doc);


		var docstr = doc.outerHTML
			// Turn back ?xml comment into ?xml node
			.replace(/<!--\?xml([^\?]*)\?-->/, "<?xml$1?>\n")

			// Remove minidom-generated HTML tags
			.replace("<html><head></head><body>", "")
			.replace("</body></html>", "")

			// Remove unneeded namespaces and corresponding attributes
			.replace(/ xmlns:(dc|cc|dc|rdf|sodipodi|inkscape)="[^"]*"/g, "")
			.replace(/ (dc|cc|dc|rdf|sodipodi|inkscape):[a-z-]+="[^"]*"/g, "")

			// Remove fill style
			.replace(/fill:#[0-9a-f]{6};/g, "");

		fs.writeFileSync(path.join(dest, file), docstr);
	});
});