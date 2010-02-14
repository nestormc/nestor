# This file is part of nestor.
#
# nestor is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# nestor is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with nestor.  If not, see <http://www.gnu.org/licenses/>.

import math
import os.path

from pynestor.web.framework.app import WebApp
import pynestor.web.framework.app_element as e
import pynestor.web.framework.app_objlist as ol
import pynestor.utils as u
        
        
class MusicStatusText(e.AppElement):
    
    def __init__(self, app, om, id, player, prop, xform=lambda x:x, song=True):
        e.AppElement.__init__(self, app, om, id)
        self.player = player
        self.prop = prop
        self.xform = xform
        self.song = song
        
    def render(self):
        pass
        
    def update(self):
        source = self.player.cur_song if self.song else self.player.mpd
        oldsource = self.player.oldsong if self.song else self.player.oldmpd
        val = source.get(self.prop, '-')
        oldval = oldsource.get(self.prop, '-')
        if val != oldval:
            self.set_content(self.xform(val))
        

class MusicSeekbar(e.ProgressBarElement):

    def __init__(self, app, om, id, player):
        e.ProgressBarElement.__init__(self, app, om, id)
        self.player = player
        
    def update(self):
        total = self.player.cur_song.get('len', 0)
        time = self.player.mpd.get('time', 0)
        percent = 100.0 * time / total if total else 0
        
        ototal = self.player.oldsong.get('len', 0)
        otime = self.player.oldmpd.get('time', 0)
        opercent = 100.0 * otime / ototal if ototal else 0
        
        if percent != opercent:
            self.set_percent(percent)
        

class MusicVolumebar(e.AppElement):

    VOLUME_GAMMA = 1.5;
    
    def __init__(self, app, om, id, player):
        e.AppElement.__init__(self, app, om, id)
        self.player = player
        
    def init(self):
        self.vol = self.create(
            e.ImageElement,
            "%s_V" % self.id, 
            self.skin.image("volume_full")
        )
        self.setvol_hid = self.output.handler_id(self.set_volume)
        
    def render(self):
        # FIXME remove constant AND px dimensions
        self.set_css({
            "width": "61px",
            "height": "15px", 
            "background-image": "url('%s')" % self.skin.image("volume_empty")
        })
        self.set_jshandler("onclick", "music_setvolume")
        self.add_jscode("music_setvolume_hid=%d" % self.setvol_hid)
        
        self.add_child(self.vol)
        self.vol.set_css({"position": "absolute"})
    
    def gamma(self, vol, invert=False):
        gamma = 1.0 / self.VOLUME_GAMMA if invert else self.VOLUME_GAMMA
        return ((float(vol) / 100.0) ** gamma) * 100.0
        
    def set_volume(self, percent):
        params = {'volume': int(math.ceil(self.gamma(100.0 * float(percent), True)))}
        self.obj.do_action("media", "mpd-player-volume", "media:mpd", params)
        self.player.update()
        
    def update(self):
        vol = math.floor(1 + self.gamma(self.player.mpd["volume"]) * 59 / 100)
        oldvol = math.floor(1 + self.gamma(self.player.oldmpd.get("volume", 100)) * 59 / 100)
        
        if vol != oldvol:
            self.vol.set_css({"clip": "rect(auto,%dpx,auto,auto)" % vol})


class MusicSummary(e.AppElement):

    def __init__(self, app, om, id, musicui):
        self.musicui = musicui
        self.mpd = {}
        self.cur_song = {}
        e.AppElement.__init__(self, app, om, id)
        
    def update_status(self):
        mpd = self.obj.get_object("media:mpd")
        self.oldmpd = self.mpd
        self.oldsong = self.cur_song
        self.mpd = mpd.getprops()
                
        self.cur_song = {}
        if self.mpd["song"] != -1:
            cursong = self.obj.get_object("media:mpd-item|%d" % self.mpd["song"])
            if cursong:
                self.cur_song = cursong.getprops()

    def renew(self, outputmgr):
        e.AppElement.renew(self, outputmgr)

    def init(self):        
        self.title = self.create(e.DivElement, "%s_title" % self.id)
                
        self.elems = {
            "title": self.create(
                MusicStatusText,
                "%s_tit" % self.id,
                self,
                "title"
            ),
            "artist": self.create(
                MusicStatusText,
                "%s_art" % self.id,
                self,
                "artist"
            ),
            "seek": self.create(
                MusicSeekbar,
                "%s_seek" % self.id,
                self
            )
        }
        
        self.icons = {
            "play": self.create(e.IconElement, "%s_play" % self.id, "play"),
            "pause": self.create(e.IconElement, "%s_pause" % self.id, "pause"),
            "prev": self.create(e.IconElement, "%s_prev" % self.id, "rew"),
            "next": self.create(e.IconElement, "%s_next" % self.id, "fwd")
        }
        
        self.volume = self.create(MusicVolumebar, "%s_vol" % self.id, self)
        self.seek_hid = self.output.handler_id(self.player_seek)
    
    def render(self):
        self.mpd = {}
        self.cur_song = {}
        
        self.add_child(self.title)
        self.title.set_content("Music")
        self.title.set_class("app_summary_title")
        
        for e in ('title', 'artist', 'seek'):
            self.add_child(self.elems[e])
        self.elems["seek"].set_jshandler("onclick", "music_playerseek")
        self.add_jscode("music_playerseek_hid=%d" % self.seek_hid)
        
        for action in ('play', 'pause', 'prev', 'next'):
            icon = self.icons[action]
            self.add_child(icon)
            icon.set_css({"cursor": "hand"})
            icon.set_handler("onclick", self.icon_handler, action)
            
        self.add_child(self.volume)
        self.volume.set_css({"float": "right"})
        self.update()
        
    def update(self):
        self.update_status()
    
        for e in self.elems:
            self.elems[e].update()
            
        for action in self.icons:
            display = "inline"
            if action == "pause" and self.mpd["state"] != "play":
                display = "none"
            if action == "play" and self.mpd["state"] == "play":
                display = "none"
            self.icons[action].set_css({"display": display})
            
        self.volume.update()
        self.schedule_update(1000)
    
    def player_seek(self, arg):
        if self.mpd["state"] in ("play", "pause"):
            pos = int(float(self.cur_song["len"]) * float(arg))
            params = {"position": pos}
            self.obj.do_action("media", "mpd-player-seek", "media:mpd", params)
            self.update()
    
    def icon_handler(self, action):
        self.obj.do_action("media", "mpd-player-%s" % action, "media:mpd")
        self.update()
        

class MusicCover(e.ImageElement):
    
    def __init__(self, app, om, id, player):
        self.player = player
        e.ImageElement.__init__(self, app, om, id, self._get_url(app.skin))
        
    def _get_url(self, skin):
        return os.path.join(
            "/cover",
            skin.name,
            self.player.cur_song.get("artist", '-'),
            self.player.cur_song.get("album", '-')
        )
        
    def update(self):
        self.set_src(self._get_url(self.skin))
    

class MusicCoverBlock(e.AppElement):

    mpd = {}
    cur_song = {}

    def update_status(self):
        self.oldmpd = self.mpd
        self.oldsong = self.cur_song
    
        mpd = self.obj.get_object("media:mpd")
        self.mpd = mpd.getprops()
        
        self.cur_song = {}
        if self.mpd["song"] != -1:
            cursong = self.obj.get_object("media:mpd-item|%d" % self.mpd["song"])
            if cursong:
                self.cur_song = cursong.getprops()

    def init(self):
        self.update_status()
        self.cover = self.create(MusicCover, "%s_cover" % self.id, self)
        
    def render(self):
        self.add_child(self.cover)
        self.set_css({"text-align": "center"})
        self.cover.set_css({"height": "18em", "width": "18em"})
        
        self.update_status()
        self.cover.update()
        self.schedule_update(1000)
        
    def update(self):   
        # FIXME find a way to trigger updates from player
        self.update_status()
        self.cover.update()
        
        # FIXME make this cleaner
        if self.cur_song != self.oldsong:
            self.output.elements["music_playlistcol_playlist"].reload()
        
        self.schedule_update(1000)
        
        
class MusicPlaylistItem(ol.ObjectListItem):

    def init(self):
        self.artist = self.create(e.SpanElement, "%s_A" % self.id)
        self.sep = self.create(e.SpanElement, "%s_S" % self.id)
        self.title = self.create(e.SpanElement, "%s_T" % self.id)
        
    def update_label(self):
        self.set_label("%s - %s" % (self.data["artist"], self.data["title"]))
        
    def update_artist(self):
        self.update_label()
        self.artist.set_content(self.data["artist"])
        
    def update_title(self):
        self.update_label()
        self.title.set_content(self.data["title"])
        
    def update_playing(self):
        if self.data["mpd-playing"]:
            self.set_class("playing")
        else:
            self.unset_class("playing")

    def render(self):
        self.set_class("playlist_item")
        
        self.add_child(self.artist)
        self.artist.set_class("artist")
        
        self.add_child(self.sep)
        self.sep.set_content(" -\n")
        self.sep.set_class("separator")
        
        self.add_child(self.title)
        self.title.set_class("title")
        
        self.update_artist()
        self.update_title()
        self.update_playing()
    
    def update_data(self, updated):
        ol.ObjectListItem.update_data(self, updated)
        if "artist" in updated:
            self.update_artist()
        if "title" in updated:
            self.update_title()
        if "mpd-playing" in updated:
            self.update_playing()
        
        
class MusicPlaylistColumn(e.AppElement):

    player_height = "18.4em"

    def init(self):
        plsetup = {
            "title": "Playlist",
            "apps": ["media"],
            "otype": ["mpd-item"],
            "limit": 50,
            
            "custom_item": MusicPlaylistItem,
            
            "fields": {
                "artist": {"weight": 1},
                "title": {"weight": 1},
                "mpd-playing": {"weight": 1}
            },
            "unique_field": "mpd-position",
            "main_field": "title",
            "field_order": ["artist", "title", "mpd-playing"],
            
            "item_drop_handler": self.playlist_drop_handler,
            "drop_handler": self.playlist_drop_handler,
            "item_events": {"ondblclick": self.playlist_dblclick_handler}
        }
    
        self.cover = self.create(MusicCoverBlock, "%s_cover" % self.id)
        self.playlist = self.create(
            ol.FixedObjectList,
            "%s_playlist" % self.id,
            plsetup
        )
        
    def render(self):
        self.set_css({"overflow": "hidden"})
        
        self.add_child(self.cover)
        self.cover.set_css({"height": self.player_height})
        
        self.add_child(self.playlist)
        self.playlist.set_css({
            "position": "absolute",
            "overflow": "auto",
            "top": self.player_height,
            "bottom": 0,
            "left": 0,
            "right": 0
        })
        
    def playlist_remove_handler(self, action, objref):
        self.obj.do_action("media", "mpd-item-remove", objref)
        self.playlist.reload()
        
    def playlist_dblclick_handler(self, element):
        if isinstance(element, ol.ObjectListItem):
            self.obj.do_action("media", "mpd-item-play", element.objref)
            self.playlist.reload()
            
    def playlist_drop_handler(self, tgt, objref):    
        pl_changed = False
        tgt_pos = -1
        obj = self.obj.get_object(objref)
        props = obj.getprops()
        objpos = props.get("mpd-position", -1)
        
        if isinstance(tgt, ol.ObjectListItem):
            tgt_pos = tgt.data["mpd-position"]
            if objref.startswith("media:mpd-item|") and tgt_pos > objpos:
                tgt_pos -= 1
        else:
            if objref.startswith("media:mpd-item|"):
                tgt_pos = tgt.count - 1
            else:
                tgt_pos = tgt.count
                
        if obj and tgt_pos != -1:
            params = {"position": tgt_pos}
            if objref.startswith("media:mpd-item|"):
                if props["mpd-position"] != tgt_pos:
                    self.obj.do_action("media", "mpd-item-move", objref, params)
                    pl_changed = True
            else:
                self.obj.do_action("media", "mpd-enqueue", objref, params);
                pl_changed = True
                
        if pl_changed:
            self.playlist.reload()
      

class MusicAlbumTracksColumn(e.AppElement):

    def _minusone_xform(self, value):
        return "&nbsp;" if value == -1 else value
        
    def __init__(self, app, om, id, musicws):
        self.musicws = musicws
        e.AppElement.__init__(self, app, om, id)

    def init(self):
        trksetup = {
            "title": "Tracks",
            "apps": ["media"],
            "otype": ["music-track"],
            "limit": 50,
            
            "fields": {
                "num": {
                    "weight": 1,
                    "xform": self._minusone_xform,
                    "style": {"text-align": "right", "padding-right": "0.5em"}
                },
                "title": {"weight": 4},
                "len": {
                    "weight": 1,
                    "xform": u.human_seconds,
                    "style": {"text-align": "right"}
                },
            },
            "unique_field": "track_id",
            "main_field": "title",
            "field_order": ["num", "title", "len"],
            
            "item_events": {"ondblclick": self.musicws.medialib_dblclick_handler},
            "filter": ["artist", "album"]
        }
        self.tracks = self.create(
            ol.FixedObjectList,
            "tracks",
            trksetup
        )
        
        albsetup = {
            "title": "Albums",
            "apps": ["media"],
            "otype": ["music-album"],
            "limit": 50,
            
            "fields": {
                "year": {
                    "weight": 1,
                    "xform": self._minusone_xform
                },
                "album": {"weight": 4}
            },
            "unique_field": "album_id",
            "main_field": "album",
            "field_order": ["year", "album"],
            
            "item_events": {"ondblclick": self.musicws.medialib_dblclick_handler},
            
            "filter": ["artist"],
            "link": self.tracks,
            "link_fields": ["artist", "album"]
        }
        self.albums = self.create(
            ol.FixedObjectList,
            "albums",
            albsetup
        )
        
    def render(self):
        self.add_child(self.albums)
        self.add_child(self.tracks)
        
        self.row_layout([
            {"element": self.albums, "weight": 1},
            {"element": self.tracks, "weight": 1},
        ])
    
              
class MusicWorkspace(e.AppElement):
    
    def init(self):
        self.albtrk = self.create(
            MusicAlbumTracksColumn,
            'albtrk',
            self
        )
    
        artsetup = {
            "title": "Artists",
            "apps": ["media"],
            "otype": ["music-artist"],
            "limit": 30,
            
            "fields": {"artist": {"weight": 1}},
            "unique_field": "artist_id",
            "main_field": "artist",
            "field_order": ["artist"],
            
            "item_events": {"ondblclick": self.medialib_dblclick_handler},
            
            "link": self.albtrk.albums,
            "link_fields": ["artist"]
        }
        self.artists = self.create(
            ol.FixedObjectList,
            "artists",
            artsetup
        )
        
        self.playlist= self.create(MusicPlaylistColumn, "playlistcol")

    def render(self):
        self.add_child(self.artists)
        self.add_child(self.albtrk)
        self.add_child(self.playlist)
        
        self.column_layout([
            {"element": self.artists, "weight": 1},
            {"element": self.albtrk, "weight": 1},
            {"element": self.playlist, "weight": 1}
        ])
        
    def medialib_dblclick_handler(self, element):
        if isinstance(element, ol.ObjectListItem):
            self.obj.do_action("media", "mpd-play", element.objref)
            self.playlist.playlist.reload()
            
                
class WebMusicApp(WebApp):
    
    def __init__(self, ui):
        WebApp.__init__(self, ui, 'music', 'Music')
        self.workspace = None
        
    def renew(self, om):
        WebApp.renew(self, om)
        self.om.add_js("web/apps/music.js")
        
    def get_summary_element(self):
        return self.create(MusicSummary, 'summary', self)
        
    def get_workspace_element(self):
        self.workspace = self.create(MusicWorkspace, 'workspace')
        return self.workspace
        
    
