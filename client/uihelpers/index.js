/*jshint browser:true*/
/*global define*/
define(["./list-selection-behaviour", "./content-list"],
function(listSelectionBehaviour, setupContentList) {
	"use strict";
	
	return {
		listSelectionBehaviour: listSelectionBehaviour,
		setupContentList: setupContentList
	};
});