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
    static function _status_xform($v)
    {
        switch ($v)
        {
        case 0: return _("Stopped");
        case 1: return _("Initializing");
        case 2: return _("Paused");
        case 3: return _("Downloading");
        case 4: return _("Seeding");
        case 5: return _("Finishing");
        case 6: return _("Finished");
        default: return "?";
        }
    }

    function init()
    {
        $dlsetup = array(
            "title" => _("Downloads"),
            "apps" => array("bt", "amule"),
            "otype" => "download",
            "lod" => 2,
            "refresh" => 1000,
            
            "fields" => array(
                "0app" => array(
                    "weight" => 1,
                    "style" => array(
                        "text-align" => "center"
                    )
                ),
                "name" => array(
                    /* "title" => "Name", */
                    "weight" => 6
                ),
                "size" => array(
                    "weight" => 1,
                    "xform" => "human_ksize",
                    "style" => array(
                        "text-align" => "center"
                    )
                ),
                "status" => array(
                    "weight" => 2,
                    "xform" => array("DownloadUI", "_status_xform"),
                    "style" => array(
                        "text-align" => "center"
                    )
                ),
                "progress" => array(
                    "weight" => 2,
                    "display" => "progress"
                ),
                "speed" => array(
                    "weight" => 1,
                    "xform" => "human_speed",
                    "style" => array(
                        "text-align" => "center"
                    )
                ),
                "seeds" => array(
                    "weight" => 1,
                    "style" => array(
                        "text-align" => "center"
                    )
                ),
                "0act" => array(
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
                    "title" => _("Pause"),
                    "handler" => array($this, "action_execute"),
                    "icon" => "pause"
                ),
                "torrent-resume" => array(
                    "title" => _("Resume"),
                    "handler" => array($this, "action_execute"),
                    "icon" => "play"
                ),/*
                "torrent-seed" => array(
                    "title" => "Seed",
                    "handler" => array($this, "action_execute"),
                    "icon" => "seed"
                ),
                "torrent-unseed" => array(
                    "title" => "Do not seed",
                    "handler" => array($this, "action_execute"),
                    "icon" => "unseed"
                ),*/
                "torrent-cancel" => array(
                	"title" => _("Cancel"),
                	"handler" => array($this, "action_execute"),
                	"icon" => "delete"
                ),
                "torrent-clear" => array(
                	"title" => _("Clear"),
                	"handler" => array($this, "action_execute"),
                	"icon" => "delete"
                ),
                "partfile-pause" => array(
                    "title" => _("Pause"),
                    "handler" => array($this, "action_execute"),
                    "icon" => "pause"
                ),
                "partfile-resume" => array(
                    "title" => _("Resume"),
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
        $bt = array("torrent-pause", "torrent-resume", "torrent-seed", "torrent-unseed", "torrent-cancel", "torrent-clear");
        
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
            if ($action == "torrent-cancel" && $data["status"] > 4) return FALSE;
            if ($action == "torrent-clear" && $data["status"] != 6) return FALSE; 
            if ($action == "torrent-seed" && ($data["status"] == 6 || $data["seed"] != 0)) return FALSE;
            if ($action == "torrent-unseed" && $data["seed"] != 1) return FALSE;
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
