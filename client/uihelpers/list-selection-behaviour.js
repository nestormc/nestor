/*jshint browser:true*/
/*global define*/
define(["dom"], function(dom) {
	"use strict";

	var $$ = dom.$$;
	var $P = dom.$P;

	return function listSelectionBehaviour(parent, itemSelector, listSelector, onDblclick) {
		var behaviour = {};

		behaviour[itemSelector] = {
			/* Prevent text selection when shift-clicking items */
			"mousedown": function(e) {
				if (e.shiftKey || e.ctrlKey || e.target.contentEditable !== "true") {
					e.preventDefault();
				}
				return false;
			},

			/* Handle episodes selection with click, ctrl+click, shift+click */
			"click": (function() {
				var firstClicked;

				return function(e) {
					e.preventDefault();

					if (!e.ctrlKey) {
						$$(parent, ".selected").forEach(function(sel) {
							sel.classList.remove("selected");
						});
					}

					if (e.shiftKey && firstClicked) {
						var items = $$(parent, itemSelector),
							idx1 = items.indexOf(firstClicked),
							idx2 = items.indexOf(this);

						items.slice(Math.min(idx1, idx2), Math.max(idx1, idx2) + 1).forEach(function(item) {
							item.classList.add("selected");
						});

						return false;
					}

					if (e.ctrlKey) {
						this.classList.add("selected");
						firstClicked = this;
						return false;
					}

					this.classList.add("selected");
					firstClicked = this;

					return false;
				};
			}()),

			"dblclick": function(e) {
				e.preventDefault();

				var items = $$(parent, ".selected"),
					index = items.indexOf(this);

				if (items.length === 1) {
					// Put whole list in playlist
					var selectedItem = items[0];
					var selectionParent = $P(selectedItem, listSelector, true);

					if (selectionParent === selectedItem) {
						items = [selectedItem];
					} else {
						items = $$(selectionParent, itemSelector);
					}

					index = items.indexOf(selectedItem);
				}

				onDblclick(items, index);

				return false;
			}
		};

		return behaviour;
	};
});