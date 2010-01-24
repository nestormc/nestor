<?

/*
This file is part of domserver.

domserver is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

domserver is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with domserver.  If not, see <http://www.gnu.org/licenses/>.
*/

?>
<html>
<head>
	<title>Debug</title>
	<style type="text/css">
		body { font-family: verdana, arial, sans-serif; font-size: 8pt;}
		pre { display: inline; font-size: 9pt; }
	</style>
	<script type="text/javascript">
    /* getElementById on an other document */
    function $$(doc, id) {
	    if (!doc) return undefined;
	    if (doc.getElementById) return doc.getElementById(id);
	    else if (doc.all) return doc.all[id];
	    else if (doc.layers) return doc.layers[id];
	    else return undefined;
    }

    /* getElementById */
    function $(id) {
	    return $$(document, id);
    }

    function debug_pause()
    {
        var pause = parseInt($("debug_pause").value);
        $("debug_pause").value = 1 - pause;
        $("debug_pause_a").innerHTML = 1 - pause ? "resume" : "pause";
    }
	</script>
</head>
<body>
	<h3>Debug</h3>
	<input type="hidden" id="debug_pause" value="0">
	<div id="debug_data"></div>
	<div id="debug_foot"><br>
		<a href="#" onclick="document.getElementById('debug_data').innerHTML = ''; return false;">clear</a>
		&ndash;
		<a id="debug_pause_a" href="#" onclick="debug_pause(); return false;">pause</a>
	</div>
</body>
</html>
