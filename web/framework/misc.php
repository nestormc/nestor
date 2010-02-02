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


/* Localization */
function _n($s1, $sm, $n) { return ngettext($s1, $sm, $n); }

/* Size display */
function human_bytes($v, $start=0, $unit="", $suffix="")
{
    $suffixes = array(0 => "", 1 => "k", 2 => "M", 3 => "G", 4 => "T");
    $val = floatval($v);
    $mult = $start;
    while ($val > 1000)
    {
        $val /= 1024;
        $mult++;
    }
    
    if ($val < 10) $prec = 2;
    elseif ($val < 100) $prec = 1;
    else $prec = 0;
    
    return sprintf("%.{$prec}F %s$unit$suffix", $val, $suffixes[$mult]);
}

function human_speed($v)
{
    return human_bytes($v, 0, _("B"), _("/s"));
}

function human_size($v)
{
    return human_bytes($v, 0, _("B"));
}

function human_ksize($v)
{
    return human_bytes($v, 1, _("B"));
}

function human_Msize($v)
{
    return human_bytes($v, 2, _("B"));
}

?>
