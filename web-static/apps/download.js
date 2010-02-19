/*
This file is part of nestor.

nestor is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

nestor is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with nestor.  If not, see <http://www.gnu.org/licenses/>.
*/

var dl_searchfield_empty = "Search query, torrent URL, ed2k link or magnet link";
var dl_searchfield_id = undefined;
var dl_searchbtn_id = undefined;
var dl_search_handlerid = undefined;

function dl_searchfield_blur()
{
    var field = $(dl_searchfield_id);
    if (field.value == "")
    {
        field.value = dl_searchfield_empty;
        $addC(field, "blurred")
    }
}

function dl_searchfield_focus()
{
    var field = $(dl_searchfield_id);
    if (field.value == dl_searchfield_empty)
    {
        field.value = "";
        $remC(field, "blurred")
    }
}

function dl_searchfield_change(e)
{
    if (e.keyCode == 13) dl_searchbtn_click();
    
    var value = $(dl_searchfield_id).value;
    var label = "Search";
    
    if (value.match(/^magnet:/)) label = "Download magnet link";
    if (value.match(/^ed2k:/)) label = "Download ed2k link";
    if (value.match(/\.torrent$/)) label = "Download torrent";
    $(dl_searchbtn_id).value = label;
}

function dl_searchbtn_click()
{
    var value = $(dl_searchfield_id).value;
    var action = "search";
    
    if (value == dl_searchfield_empty || value == "") return;
    if (value.match(/^magnet:/)) action = "magnet";
    if (value.match(/^ed2k:/)) action = "ed2k";
    if (value.match(/\.torrent$/)) action = "torrent";
    
    $method(dl_search_handlerid, action + " " + value);
    $(dl_searchfield_id).value = "";
    dl_searchfield_blur();
}
