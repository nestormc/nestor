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


class WebHeader(UIElement):
    
    def render(self):   
        self.set_content("header")
        
        
class WebAppIcon(UIImageElement):
    
    def __init__(self, om, id, appname):
        self.appname = appname
        # Do not use self.skin here as it is not created yet
        UIImageElement.__init__(self, om, id, om.ui.skin.app_icon(appname))
        
    def set_active(self, active=True):
        self.set_src(self.skin.app_icon(self.appname, active))
        
        
class WebAppSummaryContainer(UIElement):

    def __init__(self, om, id, appname, appsummary):
        self.appname = appname
        self.appsummary = appsummary
        UIElement.__init__(self, om, id)
        
    def init(self):
        self.icon = self.create(
            WebAppIcon,
            "%s_I" % self.id,
            self.appname
        )
        
    def render(self):
        self.add_child(self.icon)
        self.icon.set_class("app_icon")
        
        self.add_child(self.appsummary)
        self.appsummary.set_class("app_summary")
        
        try:
            self.appsummary.drop_callback
        except AttributeError:
            pass
        else:
            self.make_drop_target(self.appsummary, "drop_callback")
            
            
class WebApplist(UIElement):

    workspace = None
    
    def init(self):
        self.apps = self.ui.app_summaries()
        self.containers = {}
        for appid in self.apps:
            self.containers[appid] = self.create(
                WebAppSummaryContainer,
                "%s_%s_C" % (self.id, appid),
                appid,
                self.apps[appid]
            )
            
    def set_workspace(self, ws):
        self.workspace = ws
        
    def render(self):
        first = True
        active = self.workspace.load("app", None)
        for appid in self.containers:
            ctn = self.containers[appid]
            self.add_child(ctn)
            if first:
                ctn.set_class("first")
                first = False
                
            ctn.set_class("app_summary_container")
            ctn.set_handler("onclick", self, "set_active_app", appid)
            
            if appid == active:
                ctn.icon.set_active(True)
                ctn.set_class("active")
            else:
                ctn.icon.set_active(False)
                ctn.unset_class("active")
                
    def set_active_app(self, appid):
        for id in self.containers:
            ctn = self.containers[id]
            if appid == id:
                ctn.icon.set_active(True)
                ctn.set_class("active")
            else:
                ctn.icon.set_active(False)
                ctn.unset_class("active")
            
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
        self.header = self.create(WebHeader, 'HD')
        self.applist = self.create(WebApplist, 'AL')
        self.wkspace = self.create(WebWorkspace, 'WS')
        self.applist.set_workspace(self.wkspace)
        
    def render(self):
        self.add_child(self.header)
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
            
        

