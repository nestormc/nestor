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

from ...errors import ImplementationError
from .element import UIElement

class AppElement(UIElement):

    def __init__(self, app, om, id):
        self.renew(om)
        
        self.id = id
        self.app = app
        self.appid = self.app.id
        
        self.output.register_element(self)
        self.init()
        
    def create(self, cls, id, *args):
        return cls(self.app, self.output, id, *args)
        

class DivElement(AppElement):

    def render(self):
        pass
        
        
class ImageElement(AppElement):

    tagname = "img"
    
    def __init__(self, app, om, id, src):
        AppElement.__init__(self, app, om, id)
        self.src = src
        
    def render_html(self, id, classes, content):
        if classes:
            classes = ' class="%s"' % " ".join(classes)
        else:
            classes = ''
            
        return '<img id="%s" src="%s"%s>\n' % (id, self.src, classes)
        
    def render(self):
        self.set_dom("src", self.src)
        
    def set_src(self, src):
        self.src = src
        self.set_dom("src", self.src)
        

class IconElement(ImageElement):

    def __init__(self, app, om, id, icon, invert=False):
        self.icon = icon
        self.invert = invert
        ImageElement.__init__(self, app, om, id, app.skin.icon('empty'))
        
    def render(self):
        ImageElement.render(self)
        
        icon = self.skin.icon(self.icon, self.invert)
        hicon = self.skin.icon(self.icon, not self.invert)
        self.set_css({"background-image": "url('%s')" % icon})
        self.set_css({"background-image": "url('%s')" % hicon}, "hover")
        self.set_class("icon")
        
        
class ProgressBarContent(AppElement):
        
    def set_percent(self, pc):
        self.set_css({"width": "%F%%" % pc})
        
    def render(self):
        self.set_content("&nbsp;")
        self.set_class("progress_bar_content")
        
        
class ProgressBarElement(AppElement):
    
    def init(self):
        self.cnt = self.create(ProgressBarContent, "%s_C" % self.id)
        
    def set_percent(self, pc):
        self.cnt.set_percent(pc)
        
    def render(self):
        self.set_class("progress_bar")
        self.add_child(self.cnt)
        

class ScrollContainerElement(AppElement):

    def init(self):
        self.wrap = self.create(DivElement, "%s_W" % self.id)
        self.cnt = self.create(DivElement, "%s_C" % self.id)
        self.bar = self.create(DivElement, "%s_B" % self.id)
            
    def refresh_scrollbar(self):
        self.add_jscode("$scroll_move({id})");
        
    def add_child(self, child, internal=False):
        if internal:
            AppElement.add_child(self, child)
        else:
            self.cnt.add_child(child)
            self.refresh_scrollbar()
        
    def remove_child(self, child):
        self.cnt.remove_child(child)
        
    def set_content(self, cnt):
        self.cnt.set_content(cnt)
        
    def render(self):
        self.set_class("scroll_container")
        self.add_child(self.wrap, True)
        self.wrap.set_class("scroll_container_wrap")
        self.wrap.add_child(self.cnt)
        self.wrap.set_jshandler("onscroll", "$scroll")
        self.cnt.set_class("scroll_container_cnt")
        self.add_child(self.bar, True)
        self.bar.set_class("scroll_container_bar")
        self.add_jscode("$scroll_declare({id})")
        
