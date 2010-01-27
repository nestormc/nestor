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

require_once "apps/music/player.php";

class MusicPlayerColumn extends AppElement
{
    private $player_height = "10em";
    
    static function _plnum_xform($v)
    {
        return $v + 1;
    }

    function init()
    {
        $plsetup = array(
            "title" => "Playlist",
            "apps" => "media",
            "otype" => "mpd-item",
            "lod" => 2,
            "limit" => 50,
            
            "fields" => array(
                "mpd-position" => array(
                    "weight" => 1,
                    "xform" => array("MusicPlayerColumn", "_plnum_xform"),
                    "style" => array(
                        "text-align" => "right",
                        "padding-right" => "0.5em"
                    )
                ),
                "artist" => array(
                    "weight" => 3
                ),
                "title" => array(
                    "weight" => 5
                ),
                "len" => array(
                    "weight" => 1,
                    "xform" => array("MusicUI", "_seconds_xform"),
                    "style" => array(
                        "text-align" => "right",
                        "padding-right" => "0.5em"
                    )
                ),
            ),
            "unique_field" => "mpd-position",
            "main_field" => "title",
            
            "item_drop_handler" => array(
                "handler" => $this,
                "method" => "playlist_drop_handler"
            ),
            "drop_handler" => array(
                "handler" => $this,
                "method" => "playlist_drop_handler"
            ),
            
            "item_events" => array(
                "ondblclick" => array($this, "playlist_dblclick_handler")
            )
        );
    
        $this->player = new MusicPlayerblock($this->app, "player");
        $this->playlist = new FixedObjectList($this->app, "playlist", $plsetup);
    }
    
    function render() {
        $this->add_child($this->player);
        $this->player->set_css("height", $this->player_height);
        
        $this->add_child($this->playlist);
        $this->playlist->set_css("position", "absolute");
        $this->playlist->set_css("overflow", "auto");
        $this->playlist->set_css("top", $this->player_height);
        $this->playlist->set_css("bottom", 0);
        $this->playlist->set_css("left", 0);
        $this->playlist->set_css("right", 0);
    }
    
    function playlist_dblclick_handler($element)
    {
        if ($element instanceof ObjectListItem)
        {
            $this->obj->do_action("media", "mpd-item-play", $element->objref);
        }
    }
    
    function playlist_drop_handler($target, $objref)
    {
        if ($target instanceof ObjectListItem || $target instanceof ObjectListBody)
        {
            $playlist_changed = FALSE;
            $target_pos = -1;
            $obj = $this->obj->get_object($objref, 2);
            
            if ($target instanceof ObjectListItem)
            {
                $target_pos = $target->data["mpd-position"];
                
                if (strstr($objref, "media:mpd-item|") && $target_pos > $obj->props["mpd-position"])
                    $target_pos--;
            }
            elseif ($target instanceof ObjectListBody)
            {
                if (strstr($objref, "media:mpd-item|"))
                    $target_pos = $target->count - 1;
                else
                    $target_pos = $target->count;
            }
        
            
            if ($obj && $target_pos != -1)
            {
                $params = array(
                    "position" => array(
                        "type" => "num",
                        "value" => $target_pos
                    )
                );
                
                if (strstr($objref, "media:mpd-item|"))
                {
                    if ($obj->props["mpd-position"] != $target_pos)
                    {
                        $this->obj->do_action("media", "mpd-item-move", $objref, $params);
                        $playlist_changed = TRUE;
                    }
                }
                else
                {                    
                    $this->obj->do_action("media", "mpd-enqueue", $objref, $params);
                    $playlist_changed = TRUE;
                } 
            }
            
            if ($playlist_changed)
            {
                $this->playlist->reload();
            }
        }
    }
}

?>
