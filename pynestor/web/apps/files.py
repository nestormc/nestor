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


class FilesSummary(e.AppElement):

    def init(self):
        self.title = self.create(e.DivElement, "%s_title" % self.id)
        
    def render(self):
        self.add_child(self.title)
        self.title.set_content("Files")
        self.title.set_class("app_summary_title")
        
    def drop_callback(self, tgt, objref):
        self.debug("[FilesSummary] %s_%s received %s" % (tgt.app_id, tgt.id, objref))


class PlacesItem(ol.ObjectListItem):

    def init(self):
        self.bar = self.create(e.DivElement, "%s_B" % self.id)
        self.ctn = self.create(e.DivElement, "%s_C" % self.id)
        self.details = {
            "name": self.create(e.DivElement, "%s_name" % self.id)
        }
        
    def update_size(self):
        percent = 100.0 * self.data["free"] / self.data["size"]
        self.bar.set_css({"right": "%F%%" % percent})
        
    def update_name(self):
        self.details["name"].set_content(self.data["name"])
        
    def update_mounted(self):
        if self.data["mounted"]:
            self.set_class("mounted")
        else:
            self.unset_class("mounted")
    
    def render(self):
        self.set_class("places_item")
    
        self.add_child(self.bar)
        self.bar.set_class("places_bar")
        self.add_child(self.ctn)
        self.ctn.set_class("places_ctn")
        
        self.ctn.add_child(self.details["name"])
        self.details["name"].set_class("name")
        
        self.update_size()
        self.update_name()
        self.update_mounted()
        
    def update_data(self, updated):
        ol.ObjectListItem.update_data(self, updated)
        if "size" in updated or "free" in updated:
            self.update_size()
        if "name" in updated:
            self.update_name()
        if "mounted" in updated:
            self.update_mounted()

class FilesWorkspace(e.AppElement):

    def init(self):
        dlsetup = {
            "title": "Places",
            "apps": ["file"],
            "otype": ["device"],
            "refresh": 1000,
            
            "title_bound": "round",
            "custom_item": PlacesItem,
            
            "fields": {
                "name": {"weight": 1}    
            },
            
            "field_order": ["name"],
            
            "unique_field": "uuid",
            "main_field": "name"
        }
        self.places = self.create(ol.RefreshObjectList, "list", dlsetup)
        self.right = self.create(e.DivElement, "right")
    
    def render(self):
        self.add_child(self.places)
        self.add_child(self.right)
        self.right.set_content("right")
        self.column_layout([
            {'element': self.places, 'weight': 1},
            {'element': self.right, 'weight': 5}
        ])


class WebFilesApp(WebApp):
    
    def __init__(self, ui):
        WebApp.__init__(self, ui, 'files', 'Files')
        
    def renew(self, om):
        WebApp.renew(self, om)
        self.om.add_css("web/apps/files.css")
        
    def get_summary_element(self):
        return self.create(FilesSummary, 'summary')
        
    def get_workspace_element(self):
        return self.create(FilesWorkspace, 'workspace')
        
