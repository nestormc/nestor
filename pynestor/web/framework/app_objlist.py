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

import pynestor.web.framework.app_element as e
import pynestor.objects as o


class ObjectListActionMenu(e.AppElement):
    
    def __init__(self, app, om, id, settings):
        self.s = settings
        e.AppElement.__init__(self, app, om, id)
        
    def init(self):
        self.actions = {}
        for action in self.s.get("actions", {}):
            aid = action.replace("-", "")
            self.actions[action] = self.create(
                e.DivElement,
                "%s_%s" % (self.id, aid)
            )
    
    def render(self):
        self.set_class("object_list_menu")
        hid = self.output.handler_id(self.click_handler)
        
        for action in self.actions:
            self.add_child(self.actions[action])
            self.actions[action].set_content(self.s["actions"][action]["title"])
            self.actions[action].set_class("object_list_menuitem")
            self.actions[action].set_jshandler(
                "onclick",
                "function(){$popup_click('%s',%d);return false;}" % (action,hid)
            )
            if "confirm" in self.s["actions"][action]:
                msg = self.s["actions"][action]["confirm"]
                jsmsg = self.output._json_value(msg)
                self.add_jscode("$popup_confirm[\"%s\"]=%s" % (action, jsmsg))
            
    def click_handler(self, arg):
        action, objref = arg.split(" ", 1)
        self.s["actions"][action]["handler"](action, objref)
        

class ObjectListCell(e.SpanElement):
    
    def __init__(self, app, om, id, label):
        self.label = label
        e.AppElement.__init__(self, app, om, id)
        
    def render(self):
        # FIXME htmlspecialchars on label (cgi.escape?)
        self.set_content(self.label)
        self.set_class("cell")
        

class ObjectListItem(e.AppElement):
    """Abstract list item class"""
    
    def __init__(self, app, om, id, data, objref, settings):
        self.data = data
        self.objref = objref
        self.s = settings
        self.label = self.data[self.s["main_field"]]
        e.AppElement.__init__(self, app, om, id)
        
    def set_label(self, label):
        if label != self.label:
            self.label = label
            self.make_draggable(self.objref, self.label)
            
    def update_data(self, updated):
        # FIXME make valid action list update incremental
        if "actions" in self.s:
            actions = self.s["actions"].keys()
            if "action_filter" in self.s:
                for a in self.s["actions"].keys():
                    if not self.s["action_filter"](a, self.objref, self.data):
                        actions.remove(a)
            self.add_jscode('$popup_menuitems["%s"]=%s' % (
                self.output._dom_id(self),
                self.output._json_value([a.replace('-','') for a in actions])
            ))
    
        for f in updated:
            v = updated[f]
            self.data[f] = v
            if f == self.s["main_field"]:
                self.label = v


class CellsObjectListItem(ObjectListItem):
    """List item with pseudo-table-cells for each field"""
        
    def init(self):
        # Expander forces height to 1 line
        self.expander = self.create(e.SpanElement, "%s_X" % self.id)
        self.cells = {}
        
        for f in self.s["fields"]:
            fs = self.s["fields"][f]
            
            value = self.data.get(f, None)
            if "xform" in fs:
                value = fs["xform"](value)
                
            fid = f.replace("-", "")
            
            if fs.get("display", None) == "progress":
                cell = self.create(
                    e.ProgressBarElement,
                    "%s_%s" % (self.id, fid)
                )
            else:
                cell = self.create(
                    ObjectListCell,
                    "%s_%s" % (self.id, fid),
                    value
                )
                
            self.cells[f] = {"element": cell, "weight": fs["weight"]}
            
    def render(self):
        self.add_child(self.expander)
        self.expander.set_content("&nbsp;")
        
        ordered_cells = []
        for f in self.s["field_order"]:
            ordered_cells.append(self.cells[f])
            cell = self.cells[f]["element"]
            fs = self.s["fields"][f]
            self.add_child(cell)
            
            if "style" in fs:
                cell.set_css(fs["style"])
                    
            if fs.get("display", None) == "progress":
                cell.set_percent(float(self.data[f]))
                
        self.set_class("list_item")
        self.set_dom("title", self.label)
        self.column_layout(ordered_cells, "hidden")
            
    def set_cell_value(self, field, value):
        fs = self.s["fields"][field]
        if "xform" in fs:
            value = fs["xform"](value)
            
        if fs.get("display", None) == "progress":
            self.cells[field]["element"].set_percent(float(value))
        else:
            self.cells[field]["element"].set_content(value)
            
    def update_data(self, updated):
        ObjectListItem.update_data(self, updated)
    
        for f in updated:
            v = updated[f]
            if f in self.s["fields"]:
                self.set_cell_value(f, v)
                

class ObjectListBody(e.AppElement):

    count = 0
    
    children_data = {}
    children_ids = []
    children = {}
    selected_id = ''
    
    def __init__(self, app, om, id, settings):
        self.s = settings
        self.itemclass = self.s.get("custom_item", CellsObjectListItem)
        e.AppElement.__init__(self, app, om, id)
        
    def init(self):    
        # Load previously created children
        self.children_data = self.load("children", {})
        self.children_ids = self.load("children_ids", [])
        for id in self.children_ids:
            data = self.children_data[id]
            self.children[id] = self.create(
                self.itemclass,
                "%s_I%s" % (self.id, id),
                data,
                data["0ref"],
                self.s
            )
        self.selected_id = self.load("selected_id", '')
        self.count = len(self.children)
        self.closer = self.create(e.DivElement, "%s_END" % self.id)
        self.menu = self.create(ObjectListActionMenu, "%s_M" % self.id, self.s)
        
    def set_scroll_container(self, scroll):
        self.scroll = scroll
        
    def item_event(self, arg):
        ev, id = arg.split(" ")
        if ev in self.s["item_events"]:
            self.s["item_events"][ev](self.children[id])
            
    def render(self):
        self.count = 0;
        self.children = {}
        self.children_ids = []
        self.children_data = {}
        
        self.set_content("")
        self.add_popup(self.menu)
        self.add_child(self.closer)
        self.update()
            
    def update(self):
        expr = self._get_filter_expr()
        
        if (expr):
            self.fetch(expr)
        else:
            self.set_content("no filter...")
            
        self.save("children", self.children_data)
        self.save("children_ids", self.children_ids)
        
        # Move closer to the bottom
        self.remove_child(self.closer)
        self.add_child(self.closer)
        
        # Refresh scrollbar
        self.scroll.refresh_scrollbar()
        
    def fetch(self, expr):
        raise ImplementationError("ObjectListBody.fetch not overriden")
        
    def set_filter(self, filter):
        if "filter" in self.s and filter != self.load("filter", None):
            self.save("filter", filter)
            self.render()
            
    def set_link(self, id):    
        if "link" in self.s:
            data = {}
            for field in self.s["link_fields"]:
                data[field] = self.children_data[id][field]
            self.s["link"].set_filter(data)
            
        if self.selected_id in self.children:
            self.children[self.selected_id].unset_class("selected")
        self.children[id].set_class("selected")
        
        self.selected_id = id
        self.save("selected_id", id)
        
    def _get_filter_expr(self):
        if "filter" in self.s:
            filter = self.load("filter", None)
            if not filter:
                return None
                
            expr = None
            for field in self.s["filter"]:
                if expr:
                    expr = o.OExpression(
                        'and',
                        expr,
                        o.OCriterion(field, '==', filter[field])
                    )
                else:
                    expr = o.OCriterion(field, '==', filter[field])
                    
            if isinstance(expr, o.OExpression):
                return expr
            else:
                return o.OExpression('', expr)
                    
        return o.OExpression('', None)
        
    def add_item(self, child, id, data):
        self.children[id] = child
        self.children_ids.append(id)
        self.children_data[id] = data
        self.count += 1
        
        self.add_child(child)
        child.make_draggable(child.objref, child.label)
        if "item_drop_handler" in self.s:
            child.make_drop_target(self.s["item_drop_handler"])
            if "item_drop_confirm" in self.s:
                jsmsg = self.output._json_value(self.s["item_drop_confirm"])
                child.add_jscode(
                    "$drop_targets[{id}][\"confirm\"]=%s" % jsmsg
                )
        
        if id == self.selected_id:
            child.set_class("selected")
        if self.count % 2:
            child.set_class("odd")
        else:
            child.unset_class("odd")
            
        if "link" in self.s:
            child.set_handler("onclick", self.set_link, id)
            
        if "item_events" in self.s:
            for ev in self.s["item_events"]:
                child.set_handler(ev, self.item_event, "%s %s" % (ev, id))
                
        if "actions" in self.s:
            self.add_jscode('$popup_menus["%s"]="%s"' % (
                self.output._dom_id(child),
                self.output._dom_id(self.menu)
            ))
            
            actions = self.s["actions"].keys()
            if "action_filter" in self.s:
                for a in self.s["actions"].keys():
                    if not self.s["action_filter"](a, child.objref, data):
                        actions.remove(a)
            self.add_jscode('$popup_menuitems["%s"]=%s' % (
                self.output._dom_id(child),
                self.output._json_value([a.replace('-','') for a in actions])
            ))
                
                
    def remove_item(self, id):
        if id in self.children:
            self.remove_child(self.children[id])
            del self.children[id]
            self.children_ids.remove(id)
            del self.children_data[id]
            self.count -+ 1
        self.refresh_odd_items()
            
    def change_item_positions(self, positions):
        """Change item positions to match 'positions', which is a mapping of
        positions to item ids"""
        
        for pos in positions:
            id = positions[pos]
            cur_pos = self.children_ids.index(id)
            if cur_pos > pos:
                swap_id = self.children_ids[pos]
                self.children[id].swap_with(self.children[swap_id])
                self.children_ids[cur_pos] = swap_id
                self.children_ids[pos] = id
        self.refresh_odd_items()
                
    def refresh_odd_items(self):
        n = 0
        for id in self.children_ids:
            n += 1
            if n % 2:
                self.children[id].set_class("odd")
            else:
                self.children[id].unset_class("odd")
        

class RefreshObjectListBody(ObjectListBody):

    def fetch(self, expr):
        sortfield = self.s.get("sort_field", None)
        sortrev = self.s.get("sort_reverse", False)
        objs = self.obj.match_objects(self.s["apps"], expr, types=self.s["otype"], sortfield=sortfield, sortrev=sortrev)
        
        removed_ids = self.children.keys()
        positions = {}
        for o in objs:
            objref = o.objref
            props = o.getprops()
            props["0ref"] = objref
            props["0app"] = o.owner
            
            id = str(props[self.s["unique_field"]])
            positions[len(positions)] = id
            
            if id in self.children:
                # Existing item: update properties
                oldprops = self.children_data[id]
                newprops = {}
                for p in props:
                    v = props[p]
                    if p != "0ref" and v != oldprops[p]:
                        newprops[p] = v
                self.children[id].update_data(newprops)
                removed_ids.remove(id)
            else:
                # New item : create new child
                child = self.create(
                    self.itemclass,
                    "%s_I%s" % (self.id, id),
                    props,
                    objref,
                    self.s
                )
                self.add_item(child, id, props)
        
        # Removed items
        for id in removed_ids:
            self.remove_item(id)
            
        # Move to new positions
        self.change_item_positions(positions)
        if "refresh" in self.s:
            self.schedule_update(self.s["refresh"])
        

class FixedObjectListBody(RefreshObjectListBody):

    def reload(self):
        expr = self._get_filter_expr()
        self.debug("reload")
        RefreshObjectListBody.fetch(self, expr)

    def fetch(self, expr):
        if self.first and "delay_fetch" in self.s:
            self.schedule_update(0)
        else:
            offset = self.count
            limit = self.s.get("limit", -1)
            sortfield = self.s.get("sort_field", None)
            sortrev = self.s.get("sort_reverse", False)
            objs = self.obj.match_objects(self.s["apps"], expr, types=self.s["otype"], offset=offset, limit=limit, sortfield=sortfield, sortrev=sortrev)
            
            for o in objs:
                objref = o.objref
                props = o.getprops()
                props["0ref"] = objref
                props["0app"] = o.owner
                id = str(props[self.s["unique_field"]])
                
                child = self.create(
                    self.itemclass,
                    "%s_I%s" % (self.id, id),
                    props,
                    objref,
                    self.s
                )
                self.add_item(child, id, props)
                
            if "limit" in self.s:
                if self.s["limit"] > 0 and len(objs) == self.s["limit"]:
                    self.schedule_update(0)
                    
    def render(self):
        self.first = True
        ObjectListBody.render(self)
                    
    def update(self):
        self.first = False
        ObjectListBody.update(self)
        

class ObjectListTitle(e.AppElement):

    def __init__(self, app, om, id, settings):
        self.s = settings
        e.AppElement.__init__(self, app, om, id)

    def init(self):
        self.boundtype = self.s.get("title_bound", "round")
    
        self.lbound = self.create(
            e.ImageElement,
            "%s_L" % self.id,
            self.skin.image("%sb_left" % self.boundtype)
        )
        self.title = self.create(e.SpanElement, "%s_S" % self.id)
        self.rbound = self.create(
            e.ImageElement,
            "%s_R" % self.id,
            self.skin.image("%sb_right" % self.boundtype)
        )

    def render(self):
        self.set_class("list_title")
        self.add_child(self.lbound)
        self.add_child(self.title)
        self.title.set_class("list_title_span")
        self.add_child(self.rbound)
        
    def set_content(self, content):
        self.title.set_content(content)
        

class ObjectList(e.AppElement):
    """ObjectList element
    
    Generic object list element with many features :
    - multi-column display with optional column title and CSS
    - DOM events on objects
    - draggable objects
    - links between lists (ie. what B displays depends on what is selected in A)
    - objects and the list itself can be made drop targets
    - actions in a contextual drop-down menu
    
    The constructor settings parameter is a dict with the following keys (keys
    marked with * are optional):
    
      "title": displayed list title
      "apps" : list of source apps for objects
      "otype": list of object types to display
      
    * "custom_item": class used to display list items; must derive from
                     ObjectListItem. If unspecified, CellsObjectListItem is used.
      
      "fields": {
          "fieldname": {
              "title" : displayed field title (1)
              "weight": field column weight
    *         "xform" : callback to transform the field value before displaying
    *         "style": {
                  "style-property": "style-value"
                  ...
              }
          ...
          }
      }
      
      "field_order": ordered list of fieldnames
        
      "unique_field": name of a field used to identify each object (should be a
                      valid DOM id)
      "main_field": name of a field used to describe objects when dragging
      
    * "item_events": {
          "on<eventname>": callback (will be passed the e.AppElement on which the
                           event happened)
          ...
      }
      
    * "filter": {"fieldname", ...) fields used for filtering
      
    * "link": linked ObjectList
    * "link-fields": {"fieldname", ...) fields passed to linked ObjectList (2)
    
    * "item_drop_handler": callback
      Enables dropping objects on list items. The callback will receive 3 args:
      - 'above' or 'below' (ie. on which half of the item something was dropped)
      - the item AppElement
      - the dropped object objref
      
    * "item_drop_confirm": confirmation message ({label} will be replaced by the
      dropped element label and {tlabel} by the target item label)
      
    * "drop_handler": callback
      Same as "item_drop_handler", except it is called when an object is dropped
      on the list itself and only 2 args are passed:
      - the ObjectList element
      - the dropped object objref
      
    * "drop_confirm": confirmation message ({label} will be replaced by the
      dropped element label)
      
    * "actions": {
          "action-name": {
              "title": readable action description
              "handler": callback to launch the action, receives (action-name,
                         objref) as parameters
              "confirm": confirmation message ({label} will be replaced by 
                         the element label)
              "icon": action icon name
          }
          ...
      }
      Enable actions for each items. Actions will be available in a popup menu.
      
    * "action_filter": callback receving (action-name, objref, object-props),
                       must return a boolean telling if the action must be
                       displayed or not.
    
    (1) field titles will only be displayed if the "main_field" has a "title"
        attribute
    (2) "link-fields" is mandatory when "link" is specified; the specified
        fields values are matched against the linked ObjectList "filter" fields,
        in the same order
        
    The following special fields are available for all objects:
        "0app": name of owner application
        "0ref": complete object reference
    """

    def __init__(self, app, om, id, settings):
        self.s = settings
        e.AppElement.__init__(self, app, om, id)
        
    def get_list_body(self):
        raise ImplementationError("ObjectList.get_list_body not overriden")
        
    def init(self):
        self.ctn = self.create(e.DivElement, "%s_C" % self.id)
        self.scroll = self.create(e.ScrollContainerElement, "%s_S" % self.id)
        self.lst = self.get_list_body()
        self.lst.set_scroll_container(self.scroll)
        self.title = self.create(ObjectListTitle, "%s_T" % self.id, self.s)
        
    def set_filter(self, filter):
        self.lst.set_filter(filter)
        
    def render(self):
        self.set_class("object_list")
        self.add_child(self.ctn)
        self.ctn.set_class("object_list_inside")
        
        # FIXME put constant sizes in WebSkin
        self.ctn.add_child(self.title);
        self.title.set_css({"height": "1.2em"})
        self.title.set_content(self.s["title"])
        
        self.ctn.add_child(self.scroll)
        self.scroll.set_css({
            "position": "absolute",
            "top": "1.4em",
            "left": "1em",
            "right": "1em",
            "bottom": "1em"
        })
        self.scroll.add_child(self.lst)
        
        if "drop_handler" in self.s:
            self.scroll.make_drop_target(self.list_drop_handler)
            if "drop_confirm" in self.s:
                jsmsg = self.output._json_value(self.s["drop_confirm"])
                self.scroll.add_jscode(
                    "$drop_targets[{id}][\"confirm\"]=%s" % jsmsg
                )
            
        # Only enable autoscroll if items are drop targets
        if "item_drop_handler" in self.s:
            self.scroll.add_jscode("$drop_lists.push({id})")
        
        self.lst.set_css({"width": "100%"})
        
    def list_drop_handler(self, where, target, objref):
        dh = self.s["drop_handler"]
        dh(self.lst, objref)
        
    
class RefreshObjectList(ObjectList):
    """Auto-refreshed ObjectList element.
    
    Can be used for lists with objects that change often.  When the list is
    created, all objects are fetched, and updates are then incremental.  The
    "refresh" settings key specifies the refresh rate in milliseconds.
    """
    
    def get_list_body(self):
        return self.create(RefreshObjectListBody, "%s_BDY" % self.id, self.s)
        
        
class FixedObjectList(ObjectList):
    """Fixed ObjectList element
    
    Can be used for lists of objects that don't change very often.  Adds an
    optional "limit" key to settings: when specified, objects will be fetched in
    chunks of size "limit", which prevents huge loading times for lists with a
    lot of objects.  Also adds an optional "delay_fetch" settings key; when
    present and set to 1, objects will not be fetched on initial rendering but
    on next update.
    
    Also implements an additional reload() method to reload the entire list.
    """
    
    def get_list_body(self):
        return self.create(FixedObjectListBody, "%s_BDY" % self.id, self.s)
        
    def reload(self):
        self.lst.reload()
        
