/*jshint browser:true*/
/*global define*/
define(["./list-selection-behaviour", "./content-list", "./form"],
function(listSelectionBehaviour, setupContentList, form) {
	"use strict";

	return {
		listSelectionBehaviour: listSelectionBehaviour,
		setupContentList: setupContentList,
		form: form
	};
});