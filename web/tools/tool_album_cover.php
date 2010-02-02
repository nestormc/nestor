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

class AlbumCover extends Tool
{
    function no_cover()
    {
        header("Content-type: image/png");
        header("Location: tools/no-cover.png");
    }

    function work($arg)
    {
        if (strpos($arg, "/../") !== FALSE || strpos($arg, "../") === 0) return $this->no_cover();
        
        $img = $this->config["media.music_dir"] . DIRECTORY_SEPARATOR . $arg . DIRECTORY_SEPARATOR . "cover.jpg";
        if (!file_exists($img)) return $this->no_cover();
        
        $im = imagecreatefromjpeg($img);
        if ($im)
        {
            header("Content-type: image/png");
            imagepng($im);
        }
        else $this->no_cover();
    }
}

$this->_add_tool('AlbumCover');

?>
