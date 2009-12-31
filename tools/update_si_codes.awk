# This file is part of domserver.
# 
# domserver is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
# 
# domserver is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
# 
# You should have received a copy of the GNU General Public License
# along with domserver.  If not, see <http://www.gnu.org/licenses/>.
BEGIN{
    print "<?"
    print ""
    print "$_sicodes = array();"
}
{
    printf "$_sicodes['%s'] = %s;\n", $1, $3;
}
END{
    print ""
    print "function SIC($key)"
    print "{"
    print "    global $_sicodes;"
    print "    return $_sicodes[$key];"
    print "}"
    print ""
    print "?>"
}
