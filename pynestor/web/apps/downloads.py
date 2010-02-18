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
        
from pynestor.web.framework.app import WebApp
import pynestor.web.framework.app_element as e
import pynestor.web.framework.app_objlist as ol
import pynestor.utils as u

class DownloadSummary(e.AppElement):

    def init(self):
        self.title = self.create(e.DivElement, "%s_title" % self.id)
        self.files = self.create(e.DivElement, "%s_files" % self.id)
        self.speed = self.create(e.DivElement, "%s_speed" % self.id)
        
    def render(self):
        self.add_child(self.title)
        self.title.set_content("Downloads")
        self.title.set_class("app_summary_title")
        self.add_child(self.files)
        self.add_child(self.speed)
        self.update()
        
    def update(self):
        bt = self.obj.get_object("bt:")
        bt = bt.getprops()
        am = self.obj.get_object("amule:")
        am = am.getprops()
        
        speed = u.human_speed(bt["dl_speed"] + am["dl_speed"])
        num  = bt["dl_files"] + am["dl_files"]
        self.files.set_content("%d files" % num)
        self.speed.set_content(speed)
        self.schedule_update(1000)
        
    def drop_callback(self, tgt, objref):
        self.debug("[DownloadSummary] %s_%s received %s" % (tgt.app_id, tgt.id, objref))
        
        
class DownloadItem(ol.ObjectListItem):

    def init(self):
        self.bar = self.create(e.DivElement, "%s_B" % self.id)
        self.ctn = self.create(e.DivElement, "%s_C" % self.id)
        self.details = {
            "name": self.create(e.DivElement, "%s_name" % self.id),
            "speed": self.create(e.DivElement, "%s_speed" % self.id),
            "seeds": self.create(e.DivElement, "%s_seeds" % self.id),
            "app": self.create(e.DivElement, "%s_app" % self.id),
            "scnt": self.create(e.DivElement, "%s_SC" % self.id),
            "done": self.create(e.DivElement, "%s_done" % self.id),
            "size": self.create(e.DivElement, "%s_size" % self.id),
            "percent": self.create(e.DivElement, "%s_pct" % self.id),
            "pcval": self.create(e.SpanElement, "%s_pcv" % self.id),
            "pcsign": self.create(e.SpanElement, "%s_pcs" % self.id)
        }
        
    def update_progress(self):
        self.bar.set_css({"right": "%F%%" % (100 - self.data["progress"])})
        self.details["pcval"].set_content("%d" % self.data["progress"])

    def update_name(self):
        self.details["name"].set_content(self.data["name"])
        
    def update_app(self):
        self.details["app"].set_content(self.data["0app"])
        
    def update_size(self):
        sz = u.human_size(self.data["size"])
        self.details["size"].set_content(sz)
        
    def update_done(self):
        sz = u.human_size(self.data["done"])
        self.details["done"].set_content(sz)
        
    def update_speed(self):
        spd = u.human_speed(self.data["speed"])
        self.details["speed"].set_content(spd)
    
    def update_seeds(self):
        self.details["seeds"].set_content(self.data["seeds"])
        
    def update_status(self):
        sclasses = {0: "stopped", 2: "paused", 6: "finished"}
        for s in sclasses:
            if self.data["status"] == s:
                self.set_class(sclasses[s])
            else:
                self.unset_class(sclasses[s])

    def render(self):
        self.set_class("download_item")
    
        self.add_child(self.bar)
        self.bar.set_class("download_bar")
        self.add_child(self.ctn)
        self.ctn.set_class("download_ctn")
        
        self.ctn.add_child(self.details["name"])
        self.details["name"].set_class("name")
        self.ctn.add_child(self.details["speed"])
        self.details["speed"].set_class("speed")
        self.ctn.add_child(self.details["seeds"])
        self.details["seeds"].set_class("seeds")
        self.ctn.add_child(self.details["app"])
        self.details["app"].set_class("app")
        self.ctn.add_child(self.details["scnt"])
        self.ctn.add_child(self.details["percent"])
        self.details["percent"].set_class("percent")
        
        self.ctn.column_layout([
            {"element": self.details["name"], "weight": 6},
            {"element": self.details["speed"], "weight": 1},
            {"element": self.details["seeds"], "weight": 1},
            {"element": self.details["app"], "weight": 1},
            {"element": self.details["scnt"], "weight": 1},
            {"element": self.details["percent"], "weight": 1}
        ], "hidden")
        
        self.details["scnt"].add_child(self.details["done"])
        self.details["done"].set_class("done")
        self.details["scnt"].add_child(self.details["size"])
        self.details["size"].set_class("size")
        self.details["scnt"].row_layout([
            {"element": self.details["done"], "weight": 1},
            {"element": self.details["size"], "weight": 1}
        ], "hidden")
        
        self.details["percent"].add_child(self.details["pcval"])
        self.details["pcval"].set_class("percent_value")
        self.details["percent"].add_child(self.details["pcsign"])
        self.details["pcsign"].set_content("%")
        self.details["pcsign"].set_class("percent_sign")
        
        self.update_progress()
        self.update_name()
        self.update_app()
        self.update_size()
        self.update_done()
        self.update_speed()
        self.update_seeds()
        self.update_status()
    
    def update_data(self, updated):
        ol.ObjectListItem.update_data(self, updated)
        if "progress" in updated:
            self.update_progress()
        if "name" in updated:
            self.update_name()
        if "0app" in updated:
            self.update_app()
        if "size" in updated:
            self.update_size()
        if "done" in updated:
            self.update_done()
        if "speed" in updated:
            self.update_speed()
        if "seeds" in updated:
            self.update_seeds()
        if "status" in updated:
            self.update_status()
        
        
class DownloadWorkspace(e.AppElement):

    def _status_xform(self, status):
        return {
            0: "Stopped",
            1: "Initializing",
            2: "Paused",
            3: "Downloading",
            4: "Seeding",
            5: "Finishing",
            6: "Finished"
        }.get(status, "Unknown")

    def init(self):
        dlsetup = {
            "title": "Downloads",
            "apps": ["bt", "amule"],
            "otype": ["download"],
            "refresh": 1000,
            "sort_field": "progress",
            "sort_reverse": True,
            
            "title_bound": "up",
            "custom_item": DownloadItem,
            
            "fields": {
                "0app": {
                    "weight": 1,
                    "style": {"text-align": "center"}
                },
                "name": {"weight": 6},
                "size": {
                    "weight": 1,
                    "xform": u.human_size,
                    "style": {"text-align": "center"}
                },
                "status": {
                    "weight": 2,
                    "xform": self._status_xform,
                    "style": {"text-align": "center"}
                },
                "progress": {
                    "weight": 2,
                    "display": "progress"
                },
                "speed": {
                    "weight": 1,
                    "xform": u.human_speed,
                    "style": {"text-align": "center"}
                },
                "seeds": {
                    "weight": 1,
                    "style": {"text-align": "center"}
                },
                "0act": {
                    "weight": 1,
                    "style": {"text-align": "center"}
                },
            },
            "unique_field": "hash",
            "main_field": "name",
            "field_order": ["0app", "name", "size", "status", "progress",
                "speed", "seeds", "0act"],
            
            "actions": {
                "torrent-pause": {
                    "title": "Pause",
                    "handler": self.action_execute
                },
                "torrent-resume": {
                    "title": "Resume",
                    "handler": self.action_execute
                },
                "torrent-cancel": {
                	"title": "Cancel",
                	"handler": self.action_execute
                },
                "torrent-clear": {
                	"title": "Clear",
                	"handler": self.action_execute
                },
                "partfile-pause": {
                    "title": "Pause",
                    "handler": self.action_execute
                },
                "partfile-resume": {
                    "title": "Resume",
                    "handler": self.action_execute
                },
                "partfile-cancel": {
                	"title": "Cancel",
                	"handler": self.action_execute
                },
                "partfile-clear": {
                	"title": "Clear",
                	"handler": self.action_execute
                },
            },
            "action_filter": self.action_filter
        }
        self.list = self.create(ol.RefreshObjectList, "list", dlsetup)
        
    def action_filter(self, action, objref, data):
        amule  = ["partfile-pause", "partfile-resume", "partfile-cancel",
            "partfile-clear"]
        bt = ["torrent-pause", "torrent-resume", "torrent-seed",
            "torrent-unseed", "torrent-cancel", "torrent-clear"]
        
        if objref.startswith("amule:"):
            if action not in amule: return False
            if action == "partfile-resume" and data["status"] != 2: return False
            if action == "partfile-pause" and data["status"] in (0, 2, 6): return False
            if action == "partfile-cancel" and data["status"] > 4: return False
            if action == "partfile-clear" and data["status"] != 6: return False
            
        elif objref.startswith("bt:"):
            if action not in bt: return False
            if action == "torrent-resume" and data["status"] != 2: return False
            if action == "torrent-pause" and data["status"] in (0, 2, 6): return False
            if action == "torrent-cancel" and data["status"] > 4: return False
            if action == "torrent-clear" and data["status"] != 6: return False
            
        return True
    
    def action_execute(self, action, objref):
        if action.startswith("torrent-"):
            self.obj.do_action("bt", action, objref)
        elif action.startswith("partfile-"):
            self.obj.do_action("amule", action, objref)

    def render(self):
        self.add_child(self.list)
        self.column_layout([{"element": self.list, "weight": 1}])

                
class WebDownloadsApp(WebApp):
    
    def __init__(self, ui):
        WebApp.__init__(self, ui, 'dl', 'Downloads')
        
    def renew(self, om):
        WebApp.renew(self, om)
        
    def get_summary_element(self):
        return self.create(DownloadSummary, 'summary')
        
    def get_workspace_element(self):
        return self.create(DownloadWorkspace, 'workspace')
        
    
