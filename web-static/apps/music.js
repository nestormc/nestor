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

var music_playerseek_hid = undefined;
var music_setvolume_hid = undefined;

function music_playerseek(e)
{
    if (typeof music_playerseek_hid == 'undefined') return;
    var percent = e.offsetX / this.offsetWidth;
    $method(music_playerseek_hid, percent);
    e.stopPropagation();
}

function music_setvolume(e)
{
    if (typeof music_setvolume_hid == 'undefined') return;
    var percent = e.offsetX / this.offsetWidth;
    $method(music_setvolume_hid, percent);
    e.stopPropagation();
}
