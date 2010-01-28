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
    static function _byte_xform($v, $start=0, $suffix="")
    {
        if ($v == 0) return "-";
    
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
        
        return sprintf("%.{$prec}F %sB$suffix", $val, $suffixes[$mult]);
    }

    static function _speed_xform($v)
    {
        return DownloadUI::_byte_xform($v, 0, "/s");
    }
    
    static function _size_xform($v)
    {
        return DownloadUI::_byte_xform($v, 1);
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
            "apps" => array("bt", "amule"),
            "otype" => "download",
            "lod" => 2,
            "refresh" => 1000,
            
            "fields" => array(
                "__app__" => array(
                    "title" => "App",
                    "weight" => 1,
                    "style" => array(
                        "text-align" => "center"
                    )
                ),
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
                "__act__" => array(
                    "title" => "-",
                    "weight" => 1,
                    "style" => array(
                        "text-align" => "center"
                    )
                ),
            ),
            "unique_field" => "hash",
            "main_field" => "name",
            
            "actions" => array(
                "torrent-pause" => array(
                    "title" => "Pause",
                    "handler" => array($this, "action_execute"),
                    "icon" => "pause"
                ),
                "torrent-resume" => array(
                    "title" => "Resume",
                    "handler" => array($this, "action_execute"),
                    "icon" => "play"
                ),
                "partfile-pause" => array(
                    "title" => "Pause",
                    "handler" => array($this, "action_execute"),
                    "icon" => "pause"
                ),
                "partfile-resume" => array(
                    "title" => "Resume",
                    "handler" => array($this, "action_execute"),
                    "icon" => "play"
                ),
            ),
            "action_filter" => array($this, "action_filter")
        );
        $this->list = new RefreshObjectList($this->app, "list", $dlsetup);
    }
    
    function action_filter($action, $objref, $data)
    {
        $amule = array("partfile-pause", "partfile-resume");
        $bt = array("torrent-pause", "torrent-resume");
        
        if (strpos($objref, "amule:") === 0)
        {
            if (!in_array($action, $amule)) return FALSE;
            if ($action == "partfile-resume" && $data["status"] != 2) return FALSE;
            if ($action == "partfile-pause" && in_array($data["status"], array(0, 2, 6))) return FALSE;
        }
        elseif (strpos($objref, "bt:") === 0)
        {
            if (!in_array($action, $bt)) return FALSE;
            if ($action == "torrent-resume" && $data["status"] != 2) return FALSE;
            if ($action == "torrent-pause" && in_array($data["status"], array(0, 2, 6))) return FALSE;
        }
        return TRUE;
    }
    
    function action_execute($action, $objref)
    {
        if (strpos($action, "torrent-") === 0)
            $this->obj->do_action("bt", $action, $objref);
        elseif (strpos($action, "partfile-") === 0)
            $this->obj->do_action("amule", $action, $objref);
    }

    function render()
    {
        $this->add_child($this->list);
        $this->column_layout(array(array($this->list, 1)));
    }
}

?>
