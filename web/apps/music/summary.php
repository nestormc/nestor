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

class MusicStatusText extends AppElement
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
        $val = isset($source[$this->prop]) ? $source[$this->prop] : '-';
        $this->set_content($this->xform ? call_user_func($this->xform, $val) : $val);
    }
}

class MusicSeekbar extends ProgressBarElement
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

class MusicVolumebar extends AppElement
{
    const VOLUME_GAMMA = 1.5;
    
    private function gamma($vol, $invert=FALSE)
    {
        $gamma = $invert ? 1.0 / MusicVolumebar::VOLUME_GAMMA : MusicVolumebar::VOLUME_GAMMA;
        return pow(floatval($vol) / 100.0, $gamma) * 100.0;
    }

    function __construct($app, $id, $player)
    {
        parent::__construct($app, $id);
        $this->player = $player;
    }

    function init()
    {
        $this->vol = new ImageElement($this->app, "{$this->id}_V", $this->skin->image("volume_full"));
    }
    
    function render()
    {
        /* FIXME remove those ugly PX dimensions */
        $this->set_css("width", "61px");
        $this->set_css("height", "15px");
        $this->set_css("background-image", "url(" . $this->skin->image("volume_empty") . ")");
        $this->set_jshandler("onclick", "music_setvolume");
        
        $this->add_child($this->vol);
        $this->vol->set_css("position", "absolute");
    }
    
    function set_volume($percent)
    {
        $params = array(
            "volume" => array(
                "type" => "num",
                "value" => ceil($this->gamma(100.0 * $percent, TRUE))
            )
        );
        $this->obj->do_action("media", "mpd-player-volume", "media:mpd", $params);
    }
    
    function update()
    {
        $vol = floor(1 + ($this->gamma($this->player->mpd["volume"]) * 59 / 100));
        $this->vol->set_css("clip", "rect(auto,{$vol}px,auto,auto)");
    }
}

class MusicSummary extends AppElement
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
        	"title" => new MusicStatusText($this->app, "{$this->id}_tit", $this, "title"),
        	"artist" => new MusicStatusText($this->app, "{$this->id}_art", $this, "artist"),
        	"seek" => new MusicSeekBar($this->app, "{$this->id}_seek", $this)
        );
        
        $this->icons = array(
            "play" => new IconElement($this->app, "{$this->id}_play", "play"),
            "pause" => new IconElement($this->app, "{$this->id}_pause", "pause"),
            "prev" => new IconElement($this->app, "{$this->id}_prev", "rew"),
            "next" => new IconElement($this->app, "{$this->id}_next", "fwd")
        );  
        
        $this->volume = new MusicVolumebar($this->app, "{$this->id}_vol", $this);
	}
	
    function render()
    {
        foreach ($this->elems as $e) $this->add_child($e);
        $this->elems["seek"]->set_jshandler("onclick", "music_playerseek");
        
        foreach ($this->icons as $action => $i)
        {
            $this->add_child($i);
            $i->set_css("cursor", "hand");
            $i->set_handler("onclick", $this, "icon_handler", $action);
        }
        
        $this->add_child($this->volume);
        $this->volume->set_css("float", "right");
        
        $this->update();
    }
    
    function update()
    {
        foreach ($this->elems as $e) $e->update();
        
        foreach ($this->icons as $action => $i)
        {
            $display = "inline";
            
            if ($action == "pause")
                $display = $this->mpd["state"] == "play" ? "inline" : "none";
            if ($action == "play")
                $display = $this->mpd["state"] == "play" ? "none" : "inline";
            
            $i->set_css("display", $display);
        }
        
        $this->volume->update();
        
        $this->schedule_update(1000);
    }
    
    function player_seek($arg)
    {
        if (in_array($this->mpd["state"], array("play", "pause")))
        {
            $pos = floatval($this->cur_song["len"]) * floatval($arg);
            $params = array(
                "position" => array(
                    "type" => "num",
                    "value" => $pos
                )
            );
            $this->obj->do_action("media", "mpd-player-seek", "media:mpd", $params);
        }
    }
    
    function icon_handler($action)
    {
        try {
            $this->obj->do_action("media", "mpd-player-$action", "media:mpd");
        } catch (ObjectError $e) {
            $this->debug("could not execute 'mpd-player-$action' : " . $e->getMessage());
        }
    }
    
    function drop_callback($target, $objref)
    {
        $this->debug("[MusicSummary] {$target->appid}_{$target->id} received '$objref'");
    }
}

?>
