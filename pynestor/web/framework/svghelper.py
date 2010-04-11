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

import re
import xml.dom.minidom as dom


class SVGHelper:

    ROOT_ELEMENT = 'svg'
    REMOVE_ELEMENTS = ['metadata']
    REMOVE_ATTRS = ['id']
    REMOVE_ROOT_ATTRS = []
    KEEP_NAMESPACES = []

    def __init__(self, filename):
        self.filename = filename
        self.cache = {
            'svg': None,
            'xml': {}
        }
        
    def getxml(self, **kwargs):
        if repr(kwargs) in self.cache['xml']:
            return self.cache['xml'][repr(kwargs)]
        
        svg = self._getsvg().cloneNode(True)
        for attr in kwargs:
            svg.setAttribute(attr, kwargs[attr])

        #xml = re.sub("(?<!\s)/>", " />", svg.toxml())
        xml = re.sub(r"<(([a-zA-Z]+)[^>]*)/>", r"<\1></\2>", svg.toxml())
        self.cache['xml'][repr(kwargs)] = xml
        return self.cache['xml'][repr(kwargs)]

    def getdim(self):
        svg = self._getsvg()
        try:
            return [int(svg.getAttribute("width")), int(svg.getAttribute("height"))]
        except ValueError:
            raise ValueError("<svg> element misses valid dimension attributes in file '%s'" % self.filename)
            
    def _getsvg(self):
        if self.cache['svg']:
            return self.cache['svg']

        doc = dom.parse(self.filename)
        for n in doc.childNodes:
            if n.nodeType == n.ELEMENT_NODE and n.tagName == self.ROOT_ELEMENT:
                self._cleanup(n, True)
                self.cache['svg'] = n
                return self.cache['svg']
        raise ValueError("No <svg> element in file '%s'" % self.filename)

    def _cleanup(self, node, root=False):
        for attr, val in node.attributes.items():
            if attr.find(":") != -1:
                a, b = attr.split(":", 1)
                if a == 'xmlns':
                    if b not in self.KEEP_NAMESPACES:
                        node.removeAttribute(attr)
                elif a not in self.KEEP_NAMESPACES:
                    node.removeAttribute(attr)
            elif attr in self.REMOVE_ATTRS:
                node.removeAttribute(attr)
            elif root and attr in self.REMOVE_ROOT_ATTRS:
                node.removeAttribute(attr)

        cn = []
        for n in node.childNodes:
            cn.append(n)
            
        for n in cn:        
            if n.nodeType == n.TEXT_NODE and n.data.isspace():
                node.removeChild(n)
                continue
            if n.nodeType == n.COMMENT_NODE:
                node.removeChild(n)
                continue
            if n.nodeType == n.ELEMENT_NODE:
                if n.tagName.find(":") != -1:
                    ns, tag = n.tagName.split(":", 1)
                    if ns not in self.KEEP_NAMESPACES:
                        node.removeChild(n)
                        continue
                elif n.tagName in self.REMOVE_ELEMENTS:
                    node.removeChild(n)
                    continue
            self._cleanup(n)
            
