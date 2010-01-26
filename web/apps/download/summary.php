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

class DownloadSummary extends AppElement
{
    function init()
    {
        $this->state = new LabelElement($this->app, "{$this->id}_state");
    }

    function render()
    {
        $this->update();
    }
    
    function update()
    {
        $bt = $this->obj->get_object("bt:", 2);
        $bt = $bt->props;
        
        $this->set_content("Downloads");
        $this->add_child($this->state);
        
        $speed = DownloadUI::_speed_xform($bt["speed"]);
        $this->state->set_content(sprintf("%d files @ %s", $bt["num"], $speed));
        
        $this->schedule_update(1000);
    }
    
    function drop_callback($target, $objref)
    {
        $this->debug("[DownloadSummary] {$target->appid}_{$target->id} received '$objref'");
    }
}

?>
