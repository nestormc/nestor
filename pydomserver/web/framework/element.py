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

class UIElement:
    
    tagname = "div"
    
    def __init__(self, om, id):
        self.renew(om)
        
        self.id = id
        self.appid = "DOMSERVER"        
        
        self.output.register_element(self)
        self.init()
        
    def renew(self, om):
        self.output = om
        self.rh = om.rh
        self.ui = om.ui
        self.skin = om.ui.skin
        
        self.config = self.rh.context('config')
        self.obj = self.rh.context('obj')
        
    def create(self, cls, id, *args):
        return cls(self.output, id, *args)
        
    def render_html(self, id, classes, content):
        if len(classes):
            classes = ' class="%s"' % ' '.join(classes)
        else:
            classes = "";
            
        return '<%s id="%s"%s>%s</%s>' % (self.tagname, id, classes, content,
            self.tagname)
        
    def add_child(self, child):
        self.output.add_op("child", [self, child])
        child.render()
        
    def remove_child(self, child):
        self.output.add_op("unchild", [self, child])
        
    def swap_with(self, sibling):
        self.output.add_op("swap", [self, sibling])
        
    def set_content(self, html):
        """Set element HTML content.
        
        Warning: removes all previously added children !
        """
        
        if not isinstance(html, (str, unicode)):
            html = str(html)
        self.output.add_op("content", [self, html])
        
    def set_dom(self, prop, value):
        self.output.add_op("dom", [self, prop, value])
        
    def set_css(self, props, pseudoclass=None):
        for p in props:
            self.output.add_op("style", [self, p, props[p], pseudoclass])
        
    def set_class(self, cls):
        self.output.add_op("class", [self, cls])
        
    def unset_class(self, cls):
        self.output.add_op("unclass", [self, cls])
        
    def schedule_update(self, delay_ms):
        self.output.add_op("sched_update", [self, delay_ms])
        
    def set_handler(self, event, handler, arg):
        """Set DOM event handler
        
        'event' is the name of a DOM event (eg. "onclick").  When that event is
        triggered, handler(arg) will be called.
        """
        
        self.output.add_op("event", [self, event, handler, arg])
        
    def set_jshandler(self, event, handler):
        """Set JS function 'handler' as DOM event 'event' handler"""
        
        self.output.add_op("jsevent", [self, event, handler])
        
    def add_jscode(self, code):
        """Execute arbitrary JS code
        
        In 'code', the substrings '{id}' and '{this}' will be replaced by resp.
        the element DOM id and a reference to the element DOM node
        """
        
        self.output.add_op("jscode", [self, code])
        
    def make_draggable(self, objref, label):
        """Make element draggable
        
        Dragging the element will show a tooltip containing label; dropping
        it on a target will send that target the object objref.
        """
        
        self.output.add_op("drag_src", [self, objref, label])
        
    def make_drop_target(self, handler):
        """Make element a drop target
        
        When receiving a draggable element with object 'objref', will call:
            'handler'(self, 'objref')
        """
        
        self.output.add_op("drop_target", [self, handler])
        
    def _block_layout(self, blocks, cols=True, overflow="auto"):
        total = 0.0
        for b in blocks:
            total += b['weight']
            
        rem = 100.0
        cnt = len(blocks)
        for b in blocks:
            element = b['element']
            weight = b['weight']
            cnt -= 1
            
            element.set_css({"position": "absolute"})
            element.set_css({"overflow": overflow})
            element.set_css({"top" if cols else "left": 0})
            element.set_css({"bottom" if cols else "right": 0})
            used = 100.0 - rem
            element.set_css({"left" if cols else "top": "%f%%" % used})
            
            if cnt == 0:
                rem = 0
            else:
                size = 100.0 * weight / total
                rem -= size
                
            element.set_css({"right" if cols else "bottom": "%f%%" % rem})
    
    def column_layout(self, cols, overflow="auto"):
        """Generate CSS for a flexible column layout
    
        'cols' is an array of column specifications which are dicts with keys
            'element' and 'weight'.
            
        Columns will take full height/width of parent element, with relative
        widths computed using column weights (eg. if a column has twice the
        weight of an other, it will be twice as wide).
        """
        
        self._block_layout(cols, True, overflow)
        
    def row_layout(self, rows, overflow="auto"):
        """Generate CSS for a flexible row layout
        
        Works exactly like column_layout(), but horizontally.
        """
        
        self._block_layout(rows, False, overflow)
        
    def debug(self, message):
        self.output.debug(self, message)
        
    def save(self, key, value):
        self.rh.set_client_data("%s/%s/%s" % (self.appid, self.id, key), value)
        
    def load(self, key, default):
        return self.rh.get_client_data(
            "%s/%s/%s" % (self.appid, self.id, key),
            default
        )
            
    def init(self):
        pass
        
    def update(self):
        pass
        
    def render(self):
        raise ImplementationError("UIElement.render() not overriden")
        
        
class UIImageElement(UIElement):
    tagname = "img"
    
    def __init__(self, om, id, src):
        UIElement.__init__(self, om, id)
        self.src = src
        
    def render_html(self, id, classes, cnt):
        if len(classes):
            classes = ' class="%s"' % ' '.join(classes)
        else:
            classes = ''
            
        return '<img id="%s" src="%s"%s>' % (id, self.src, classes)
        
    def render(self):
        self.set_dom("src", self.src)
        
    def set_src(self, src):
        self.src = src
        self.set_dom("src", self.src)
        
