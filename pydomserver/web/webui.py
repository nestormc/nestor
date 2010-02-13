# This file is part of domserver.
#
# domserver is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# domserver is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with domserver.  If not, see <http://www.gnu.org/licenses/>.

from .framework.element import UIElement, UIImageElement
from .apps import WEB_APPS


class WebNestor(UIElement):
    
    def init(self):
        self.icon = self.create(
            UIImageElement,
            "%s_I" % self.id,
            self.skin.image("nestor")
        )
        
    def render(self):
        self.set_class("nestor_app")
        self.add_child(self.icon)
        

class WebAppSummaryContainer(UIElement):
    
    def __init__(self, om, id, boundary, element):
        self.boundary = boundary
        self.element = element
        UIElement.__init__(self, om, id)
        
    def init(self):
        self.lbound = self.create(
            UIImageElement,
            "%s_LB" % self.id,
            self.skin.image("%s_left" % self.boundary)
        )
        self.rbound = self.create(
            UIImageElement,
            "%s_RB" % self.id,
            self.skin.image("%s_right" % self.boundary)
        )
        
    def render(self):
        self.add_child(self.lbound)
        self.lbound.set_class("applist_boundary")
        self.lbound.set_class("left")
        self.add_child(self.element)
        self.element.set_class("app_summary")
        self.add_child(self.rbound)
        self.rbound.set_class("applist_boundary")
        self.rbound.set_class("right")
        
        
class WebApplist(UIElement):

    workspace = None
    app_order = ['music', 'dl']
    
    def init(self):
        self.nestor = self.create(WebNestor, "%s_N" % self.id)
        self.nestor_bound = self.create(
            UIImageElement,
            "%s_NB" % self.id,
            self.skin.image("round_right")
        )
        
        self.appcs = {}
        apps = self.ui.app_summaries()
        for appid in apps:
            boundary = {
                'music': 'round',
                'dl': 'up'
            }[appid]
            self.appcs[appid] = self.create(
                WebAppSummaryContainer,
                "%s_C%s" % (self.id, appid),
                boundary,
                apps[appid]
            )   
            
    def set_workspace(self, ws):
        self.workspace = ws
        
    def render(self):
        self.add_child(self.nestor)
        self.add_child(self.nestor_bound)
        self.nestor_bound.set_class("nestor_boundary")
    
        active = self.workspace.load("app", None)
        for appid in self.app_order:
            appc = self.appcs[appid]
            self.add_child(appc)
                
            appc.set_handler("onclick", self.set_active_app, appid)
            
            if appid == active:
                appc.set_class("active")
            else:
                appc.unset_class("active")
                
    def set_active_app(self, appid):
        for id in self.appcs:
            appc = self.appcs[id]
            if appid == id:
                appc.set_class("active")
            else:
                appc.unset_class("active")
            
        self.workspace.set_active_app(appid)
        
        
class WebWorkspace(UIElement):

    def _get_app_workspace(self):
        appid = self.load("app", None)
        if appid:
            self.ws = self.ui.app_workspace(appid)
        else:
            self.ws = None
            
    def _display_app(self):
        if self.ws:
            self.set_content("")
            self.add_child(self.ws)
            self.ws.set_class("app_workspace")
        else:
            self.set_content("no app selected")
            
    def init(self):
        self._get_app_workspace()
        
    def render(self):
        self._display_app()
        
    def set_active_app(self, appid):
        if appid != self.load("app", None):
            self.save("app", appid)
            self._get_app_workspace()
            self._display_app()
        

class WebRoot(UIElement):

    def init(self):
        self.applist = self.create(WebApplist, 'AL')
        self.wkspace = self.create(WebWorkspace, 'WS')
        self.applist.set_workspace(self.wkspace)
        
    def render(self):
        self.add_child(self.applist)
        self.add_child(self.wkspace)
        
        
class WebSkin:

    def __init__(self, skinname):
        self.name = skinname
        self.dir = "/web/skins/%s" % skinname
        
    def icon(self, name, active=False):
        act = "_active" if active else ""
        return "%s/icons/%s%s.svg" % (self.dir, name, act)
        
    def app_icon(self, name, active=False):
        act = "_active" if active else ""
        return "%s/apps/%s%s.svg" % (self.dir, name, act)
        
    def image(self, name):
        return "%s/images/%s.svg" % (self.dir, name)
        

class WebUI:
    
    def __init__(self, outputmgr):
        self.om = outputmgr
        self.rh = self.om.rh
        self.skin = WebSkin('default')
        
    def init(self):
        self.apps = {}
        for appcls in WEB_APPS:
            app = appcls(self)
            app.renew(self.om)
            self.apps[app.id] = app
            
        self.root = WebRoot(self.om, 'ROOT')
        
    def renew(self, outputmgr):
        self.om = outputmgr
        self.rh = self.om.rh
        for appid in self.apps:
            self.apps[appid].renew(outputmgr)
        
    def app_workspace(self, appid):
        if appid in self.apps:
            return self.apps[appid].get_workspace_element()
            
    def app_summaries(self):
        ret = {}
        for appid in self.apps:
            ret[appid] = self.apps[appid].get_summary_element()
        return ret
            
        

