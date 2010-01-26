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

require_once "apps/music/playlist.php";

class MusicUI extends AppElement
{
    static function _minusone_xform($v)
    {
        return $v == -1 ? "" : $v;
    }
    
    static function _seconds_xform($secs)
    {
        $min = floor($secs / 60);
        $sec = $secs - 60 * $min;
        return sprintf("%d:%02d", $min, $sec);
    }
    
    function init()
    {
        $this->lists = array();
        
        $trksetup = array(
            "title" => "Tracks",
            "app" => "media",
            "otype" => "music-track",
            "lod" => 2,
            
            "fields" => array(
                "num" => array(
                    "weight" => 1,
                    "xform" => array("MusicUI", "_minusone_xform"),
                    "style" => array(
                        "text-align" => "right",
                        "padding-right" => "0.5em"
                    )
                ),
                "title" => array(
                    "weight" => 4
                ),
                "len" => array(
                    "weight" => 1,
                    "xform" => array("MusicUI", "_seconds_xform"),
                    "style" => array(
                        "text-align" => "right"
                    )
                ),
            ),
            "unique_field" => "track_id",
            "main_field" => "title",
            
            "item_events" => array(
                "ondblclick" => array($this, "medialib_dblclick_handler"),
            ),
            
            "filter" => array("artist", "album")
        );
        $this->lists["tracks"] = new FixedObjectList($this->app, "tracks", $trksetup);
        
        $albsetup = array(
            "title" => "Albums",
            "app" => "media",
            "otype" => "music-album",
            "lod" => 2,
            
            "fields" => array(
                "year" => array(
                    "weight" => 1, 
                    "xform" => array("MusicUI", "_minusone_xform")
                ),
                "album" => array(
                    "weight" => 4
                )
            ),
            "unique_field" => "album_id",
            "main_field" => "album",
            
            "item_events" => array(
                "ondblclick" => array($this, "medialib_dblclick_handler"),
            ),
            
            "filter" => array("artist"),
            "link" => $this->lists["tracks"],
            "link_fields" => array("artist", "album")
        );
        $this->lists["albums"] = new FixedObjectList($this->app, "albums", $albsetup);
    
        $artsetup = array(
            "title" => "Artists",
            "app" => "media",
            "otype" => "music-artist",
            "lod" => 2,
            "limit" => 50,
            
            "fields" => array(
                "artist" => array(
                    "weight" => 1
                )
            ),
            "unique_field" => "artist_id",
            "main_field" => "artist",
            
            "item_events" => array(
                "ondblclick" => array($this, "medialib_dblclick_handler"),
            ),
            
            "link" => $this->lists["albums"],
            "link_fields" => array("artist")
        );
        $this->lists["artists"] = new FixedObjectList($this->app, "artists", $artsetup);
        
        $this->lists["player"] = new MusicPlayerColumn($this->app, "player_column");
    }

    function render()
    {
        $this->add_child($this->lists["player"]);
        $this->add_child($this->lists["artists"]);
        $this->add_child($this->lists["albums"]);
        $this->add_child($this->lists["tracks"]);
        
        $this->column_layout(array(
            array($this->lists["player"], 2),
            array($this->lists["artists"], 1),
            array($this->lists["albums"], 1),
            array($this->lists["tracks"], 1)
        ));
    }
    
    function medialib_dblclick_handler($element)
    {
        if ($element instanceof ObjectListItem)
        {
            $this->obj->do_action("media", "mpd-play", $element->objref);
            $this->lists["player"]->playlist->reload();
        }
    }
}

?>
