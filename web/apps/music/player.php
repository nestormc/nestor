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

class MusicPlayerText extends AppElement
{
    function __construct($app, $id, $player, $property, $xform=FALSE, $song=TRUE)
    {
        parent::__construct($app, $id);
        $this->player = $player;
        $this->prop = $property;
        $this->xform = $xform;
        $this->song = $song;
    }
    
    function render()
    {
        $this->update();
    }
    
    function update()
    {
        $source = $this->song ? $this->player->cur_song : $this->player->mpd;
        $val = isset($source[$this->prop]) ? $source[$this->prop] : 0;
        $this->set_content($this->xform ? call_user_func($this->xform, $val) : $val);
    }
}

class MusicPlayerSeekbar extends ProgressBarElement
{
    function __construct($app, $id, $player)
    {
        parent::__construct($app, $id);
        $this->player = $player;
    }
    
    function update()
    {
        $total = $this->player->cur_song["len"];
        $time = $this->player->mpd["time"];
        $percent = $total ? 100.0 * $time / $total : 0;
        
        $this->set_percent($percent);
    }
}

class MusicCover extends ImageElement
{
    function __construct($app, $id, $player)
    {
        parent::__construct($app, $id, "tools/no-cover.png");
        $this->player = $player;
    }
    
    function update()
    {
        $path = $this->player->cur_song["artist"] . DIRECTORY_SEPARATOR . $this->player->cur_song["album"];
        $url = $this->ds->tool_url("AlbumCover", $path);
        $this->set_src($url);
    }
}


class MusicPlayerblock extends AppElement
{
    function init()
    {
        $mpd = $this->obj->get_object("media:mpd", 255);
        $this->mpd = $mpd->props;
        
        if ($this->mpd["song"] != -1)
        {
            $cursong = $this->obj->get_object("media:mpd-item|" . $this->mpd["song"], 2);
            if ($cursong) $this->cur_song = $cursong->props;
        }
        
        $this->elems = array(
            "cover" => new MusicCover($this->app, "{$this->id}_cover", $this),
            "title" => new MusicPlayerText($this->app, "{$this->id}_title", $this, "title"),
            "artist" => new MusicPlayerText($this->app, "{$this->id}_artist", $this, "artist"),
            "seekbar" => new MusicPlayerSeekbar($this->app, "{$this->id}_seekbar", $this)
        );
    }

    function render()
    {
        foreach ($this->elems as $e) $this->add_child($e);
        
        $this->elems["cover"]->set_css("float", "left");
        $this->elems["cover"]->set_css("height", "10em");
        $this->elems["cover"]->set_css("width", "10em");
        
        $this->elems["seekbar"]->set_css("position", "absolute");
        $this->elems["seekbar"]->set_css("left", "10em");
        $this->elems["seekbar"]->set_css("right", "0");
        
        $this->update();
    }
    
    function update()
    {
        foreach ($this->elems as $e) $e->update();
        $this->schedule_update(1000);
    }
}

?>
