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

class DownloadUI extends AppElement
{
    static function _speed_xform($v)
    {
        if ($v == 0) return "-";
    
        $suffixes = array(0 => "", 1 => "k", 2 => "M", 3 => "G", 4 => "T");
        $val = floatval($v);
        $mult = 0;
        while ($val > 1000)
        {
            $val /= 1024;
            $mult++;
        }
        
        return sprintf("%.2f %sB/s", $val, $suffixes[$mult]);
    }
    
    static function _size_xform($v)
    {
        $suffixes = array(0 => "", 1 => "k", 2 => "M", 3 => "G", 4 => "T");
        $val = floatval($v);
        $mult = 1;
        while ($val > 1000)
        {
            $val /= 1024;
            $mult++;
        }
        
        return sprintf("%.2f %sB", $val, $suffixes[$mult]);
    }

    static function _status_xform($v)
    {
        switch ($v)
        {
        case 0: return "Stopped";
        case 1: return "Initializing";
        case 2: return "Paused";
        case 3: return "Downloading";
        case 4: return "Seeding";
        case 5: return "Finishing";
        case 6: return "Finished";
        default: return "?";
        }
    }

    function init()
    {
        $dlsetup = array(
            "title" => "Downloads",
            "app" => "bt",
            "otype" => "download",
            "lod" => 2,
            "refresh" => 1000,
            
            "fields" => array(
                "name" => array(
                    "title" => "Name",
                    "weight" => 6
                ),
                "size" => array(
                    "title" => "Size",
                    "weight" => 1,
                    "xform" => array("DownloadUI", "_size_xform"),
                    "style" => array(
                        "text-align" => "center"
                    )
                ),
                "status" => array(
                    "title" => "Status",
                    "weight" => 2,
                    "xform" => array("DownloadUI", "_status_xform"),
                    "style" => array(
                        "text-align" => "center"
                    )
                ),
                "progress" => array(
                    "title" => "Progress",
                    "weight" => 2,
                    "display" => "progress"
                ),
                "speed" => array(
                    "title" => "Speed",
                    "weight" => 1,
                    "xform" => array("DownloadUI", "_speed_xform"),
                    "style" => array(
                        "text-align" => "center"
                    )
                ),
                "seeds" => array(
                    "title" => "Seeds",
                    "weight" => 1,
                    "style" => array(
                        "text-align" => "center"
                    )
                ),
            ),
            "unique_field" => "hash",
            "main_field" => "name"
        );
        $this->list = new RefreshObjectList($this->app, "list", $dlsetup);
    }

    function render()
    {
        $this->add_child($this->list);
        $this->column_layout(array(array($this->list, 1)));
    }
}

?>
