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


import re

from ..webui import WebUI

DEBUG = False
DEBUG_OPCODES = []


class WebOutputManager:
    
    def __init__(self, resphandler):
        self.ops = []
        self.debug_msgs = []
        self.fatal = False
        self.scripts = []
        self.cssheets = []
        self.elements = {}
        self.el_children = {}
        
        self.add_js("web/domserver.js")
        self.add_css("web/domserver.css")
        
        self.rh = resphandler
        self.ui = WebUI(self)
        self.ui.init()
        
    def renew(self, resphandler):
        self.rh = resphandler
        self.ui.renew(self)
        for e in self.elements:
            self.elements[e].renew(self)
        
    def _indent(self, code):
        """Indent all non-blank lines in code with 4 spaces"""
        inlines = code.split("\n")
        outlines = []
        
        for line in inlines:
            if re.match("/^\s*$/", line):
                outlines.append("")
            else:
                outlines.append("    %s" % line)
        return "\n".join(outlines)
        
    def _dom_id(self, element):
        """Get element DOM id"""
        return "%s_%s" % (element.appid, element.id)
        
    def _json_iarray(self, arr):
        """Get array JSON string"""
        defs = [self._json_value(v) for v in arr]
        return "[%s]" % ','.join(defs)
        
    def _json_aarray(self, arr):
        """Get dict JSON string"""
        defs = ["%s:%s" % (k, self._json_value(arr[k])) for k in arr]
        return "{%s}" % ','.join(defs)
        
    def _json_value(self, val):
        """Get value JSON string"""
        if isinstance(val, bool):
            return "true" if val else "false"
        if isinstance(val, int):
            return "%d" % val
        if isinstance(val, float):
            return "%f" % val
        if isinstance(val, str) or isinstance(val, unicode):
            return '"%s"' % val.replace('"', '\\"')
        if isinstance(val, list):
            return self._json_iarray(val)
        if isinstance(val, dict):
            return self._json_aarray(val)
            
        return "undefined"
        
    def _js_cssprop(self, prop):
        """Get JS style property name"""
        sp = prop.split("-")
        return "%s%s" % (sp[0], ''.join([s.capitalize() for s in sp[1:]]))
        
    def register_element(self, element):
        self.elements[self._dom_id(element)] = element
        self.el_children[self._dom_id(element)] = []
        
    def unregister_children(self, element):
        eid = self._dom_id(element)
        for cid in self.el_children[eid]:
            self.unregister_element(self.elements[cid])
        
    def unregister_element(self, element):
        self.unregister_children(element)
        eid = self._dom_id(element)
        del self.elements[eid]
        del self.el_children[eid]
        
    def add_js(self, script):
        if script not in self.scripts:
            self.scripts.append(script)
        
    def add_css(self, sheet):
        if sheet not in self.cssheets:
            self.cssheets.append(sheet)
        
    def add_op(self, opcode, params):
        self.ops.append([opcode, params])
        if DEBUG and (opcode in DEBUG_OPCODES or '*' in DEBUG_OPCODES):
            dparams = []
            for p in params:
                if isinstance(p, UIElement):
                    dparams.append("&lt;%s&gt;" % self._dom_id(p))
                else:
                    dparams.append(self._json_value(p))
            self.debug_msgs.append("%s: %s" % (opcode, ', '.join(dparams)))
    
    def debug(self, element, message):
        if DEBUG:
            self.debug_msgs.append("&lt;%s&gt; %s" % (self._dom_id(element),message))
            
    def render_json_opcodes(self):
        """Render all pending opcodes into a JSON-wrapped JS function """
        
        ops = []
        prev_id = None
        
        for opcode, params in self.ops:
            id = self._dom_id(params[0])
            if id != prev_id:
                if prev_id: ops.append("}")
                ops.append('if($("%s")){' % id)
                prev_id = id
                
            if opcode == 'style':
                prop = self._js_cssprop(params[1])
                val = self._json_value(params[2])
                pseudo = params[3]
                if pseudo:
                    ops.append('$cssrule("#%s:%s","%s",%s);' % (id, pseudo, prop, val))
                else:
                    ops.append('$("%s").style.%s=%s;' % (id, prop, val))
                    
            elif opcode in ('content', 'dom'):
                if opcode == 'content':
                    params.append(params[1])
                    params[1] = 'innerHTML'
                    self.unregister_children(params[0])
                prop = params[1]
                val = self._json_value(params[2])
                ops.append('$("%s").%s=%s;' % (id, prop, val))
                
            elif opcode == 'child':
                child = params[1]
                self.register_element(child)
                cid = self._dom_id(child)
                ops.extend([
                    'var c=document.createElement("%s");' % child.tagname,
                    'c.id="%s";' % cid,
                    '$("%s").appendChild(c);' % id
                ])
                
            elif opcode == 'unchild':
                child = params[1]
                cid = self._dom_id(child)
                self.unregister_element(child)
                ops.append('if($("%s"))$("%s").removeChild($("%s"));' % (cid, id, cid))
                
            elif opcode == 'swap':
                sibling = params[1]
                sid = self._dom_id(sibling)
                ops.append('$swap($("%s"),$("%s"));' % (id, sid))
                
            elif opcode == 'sched_update':
                interval = params[1]
                ops.append('$scheduler.schedule(%d,"%s");' % (interval, id))
                
            elif opcode == 'class':
                cls = params[1]
                ops.append('$addC($("%s"),"%s");' % (id, cls))
                
            elif opcode == 'unclass':
                cls = params[1]
                ops.append('$remC($("%s"),"%s");' % (id, cls))
                
            elif opcode == 'event':
                event = params[1]
                tid = self._dom_id(params[2])
                meth = self._json_value(params[3])
                arg = self._json_value(params[4])
                ops.append('$("%s").%s=function(e){$method("%s",%s,%s);'
                    'e.stopPropagation();};' % (id, event, tid, meth, arg))
                    
            elif opcode == 'jsevent':
                event = params[1]
                handler = params[2]
                ops.append('$("%s").%s=%s;' % (id, event, handler))
                
            elif opcode == 'jscode':
                code = params[1].replace('{id}', '"%s"' % id)
                code = code.replace('{this}', '$("%s")' % id)
                ops.append("%s;" % code)
                
            elif opcode == 'drag_src':
                info = self._json_value({'objref': params[1], 'label': params[2]})
                ops.extend([
                    '$drag.init($("%s"));' % id,
                    '$drag_src["%s"]=%s;' % (id, info)
                ])
                
            elif opcode == 'drop_target':
                handler = self._dom_id(params[1])
                method = self._json_value(params[2])
                ops.extend('$drop_targets["%s"]={handler:"%s",method:%s};' % (id, handler, method))
                
        if ops:
            ops.append("}")
        
        if self.fatal:
            ops.append("$fatal(%s);" % self._json_value(self.fatal))
            
        if DEBUG:
            for d in self.debug_msgs:
                ops.append("$debug(%s);" % self._json_value(d))
        
        self.ops = []
        return "{op:function(){%s}}" % ''.join(ops)
        
    def update_elements(self, eids):
        for id in eids:
            if DEBUG:   
                self.debug_msgs.append("*** UPDATE %s ***" % id)
            
            self.elements[id].update()
        
        return self.render_json_opcodes()
        
    def call_element_method(self, id, method, arg):
        if DEBUG:
            self.debug_msgs.append("*** METHOD %s.%s(%s) ***" % (id, method, arg))
            
        try:
            meth = eval("self.elements[id].%s" % method)
        except AttributeError:
            self.debug_msgs.append("no such method")
        else:
            if not callable(meth):
                self.debug_msgs.append("no such method")
            else:
                meth(arg)
                
        return self.render_json_opcodes()
        
    def call_drop_handler(self, hid, method, tid, objref):
        if DEBUG:
            self.debug_msgs.append("*** DROPPED %s on %s, calling %s.%s ***" % (objref, tid, hid, method))
            
        handler = self.elements[hid]
        target = self.elements[tid]
        
        try:
            meth = eval("handler.%s" % method)
        except AttributeError:  
            self.debug_msgs.append("no such method")
        else:
            if not callable(meth):
                self.debug_msgs.append("no such method")
            else:
                meth(target, objref)
                
        return self.render_json_opcodes()
        
    def _render_htmltree(self, root, elems):    
        html = ''
        if len(elems[root]['content']):
            html = elems[root]['content']
           
        children = ''
        for cid in elems[root]['children']:
            children += self._render_htmltree(cid, elems)
            
        if re.match('/^(\s|\n)*$', children):
            return elems[root]['obj'].render_html(root, elems[root]['classes'], html)
        else:
            return elems[root]['obj'].render_html(root, elems[root]['classes'], self._indent("%s\n%s" % (html, children)))
            
    def render_page(self):
        root = self.elements['DOMSERVER_ROOT']
    
        if DEBUG:
            self.debug_msgs.append("*** PAGE %s ***" % self._dom_id(root))
            
        elems = {
            self._dom_id(root): {
                "children": [],
                "content": "",
                "classes": [],
                "obj": root
            }
        }
        
        css = {}
        js = []
        drag_src = {}
        drop_tgt = {}
        
        if DEBUG:
            js.append("$debug_enable();")
            
        root.render()
        for opcode, params in self.ops:
            id = self._dom_id(params[0])
            
            if opcode == 'style':
                pseudo = params[3]
                if pseudo:
                    selector = "#%s:%s" % (id, pseudo)
                else:
                    selector = "#%s" % id
                    
                if selector not in css:
                    css[selector] = []
                css[selector].append("%s: %s;" % (params[1], params[2]))
                
            elif opcode == 'dom':
                val = self._json_value(params[2])
                js.append('if ($("%s")) $("%s").%s = %s;' % (id, id, params[1], val))
                
            elif opcode == 'content':
                elems[id]["children"] = []
                elems[id]["content"] = params[1]
                self.unregister_children(params[0])
            
            elif opcode == "child":
                child = params[1]
                self.register_element(child)
                cid = self._dom_id(child)
                elems[cid] = {
                    "children": [],
                    "content": "",
                    "classes": [],
                    "obj": child
                }
                elems[id]['children'].append(cid)
                
            elif opcode == 'unchild':
                child = params[1]
                cid = self._dom_id(child)
                self.unregister_element(child)
                js.append('if ($("%s")) $("%s").removeChild($("%s"));' % (cid, id, cid))
                
            elif opcode == 'swap':
                sibling = params[1]
                sid = self._dom_id(sibling)
                js.append('$swap($("%s"), $("%s"));' % (id, sid))
                
            elif opcode == 'sched_update':
                interval = params[1]
                js.append('$scheduler.schedule(%d, "%s");' % (interval, id))
                
            elif opcode == 'class':
                cls = params[1]
                if cls not in elems[id]["classes"]:
                    elems[id]["classes"].append(cls)
                    
            elif opcode == 'unclass':
                cls = params[1]
                if cls in elems[id]["classes"]:
                    elems[id]["classes"].remove(cls)
                    
            elif opcode == 'event':
                event = params[1]
                tid = self._dom_id(params[2])
                method = self._json_value(params[3])
                arg = self._json_value(params[4])
                js.append('if ($("%s")) $("%s").%s = function (e) { '
                    '$method("%s", %s, %s); e.stopPropagation(); };' %
                        (id, id, event, tid, method, arg))
                        
            elif opcode == 'jsevent':
                event = params[1]
                handler = params[2]
                js.append('if ($("%s")) $("%s").%s = %s;' % (id, id, event, handler))
                
            elif opcode == 'jscode':
                code = params[1].replace("{id}", '"%s"' % id)
                code = code.replace("{this}", '$("%s")' % id)
                js.append("%s;" % code)
                
            elif opcode == 'drag_src':
                drag_src[id] = {'objref': params[1], 'label': params[2]}
                js.append('if ($("%s")) $drag.init($("%s"));' % (id, id))
                
            elif opcode == 'drop_target':
                handler = self._dom_id(params[1])
                method = params[2]
                drop_tgt[id] = {'handler': handler, 'method': method}
                
        if self.fatal:
            js.append('$fatal(%s);' % self._json_value(self.fatal))
            
        if DEBUG:
            for d in self.debug_msgs:
                js.append('$debug(%s);' % self._json_value(d))
                
        # JS block
        js.extend([
            '$drag_src = %s;' % self._json_value(drag_src),
            '$drop_targets = %s;' % self._json_value(drop_tgt)
        ]);
        
        js_out = ''
        for src in self.scripts:
            js_out += '<script type="text/javascript" src="%s"></script>\n' % src
            
        js_out += ('<script type="text/javascript">\n'
            'window.onload=function() {\n%s\n}\n</script>\n'
                % (self._indent("\n".join(js))))
        js_block = self._indent(js_out)
        
        # CSS block
        css_out = ''
        for href in self.cssheets:
            css_out += '<link rel="stylesheet" type="text/css" href="%s">\n' % href
            
        css_out += '<style type="text/css">\n';
        for selector in css:
            css_out += "%s {\n" % selector
            css_out += self._indent("\n".join(css[selector]))
            css_out += "\n}\n"
        css_out += '</style>\n'
        css_block = self._indent(css_out)
        
        # HTML block
        html_block = self._indent(self._render_htmltree(self._dom_id(root), elems))
        
        self.ops = []
        return """<html>
<head>
    <title>domserver</title>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    
%s
%s
</head>
<body>
%s</body>
</html>
""" % (css_block, js_block, html_block)

        

