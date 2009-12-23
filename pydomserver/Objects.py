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

import sqlite3

from .Errors import ObjectError, ImplementationError
from .SocketInterface import SIPacket, SIStringTag, SIUInt32Tag
from .SocketInterfaceCodes import SIC


class OCriterion:
    def __init__(self, prop, oper, val):
        self.prop = prop
        self.oper = oper
        self.val = val
        
    def is_true(self, obj):
        if self.prop == 'oid':
            val = obj.oid
        else:
            try:
                val = obj.get_value(self.prop)
            except KeyError:
                return False
            
        if self.oper in ('==','!=','>','>=','<','<='):
            return eval('%s %s %s' % (repr(val), self.oper, repr(self.val)))
        elif self.oper == '<~':
            return val.startswith(self.val)
        elif self.oper == '~>':
            return val.endswith(self.val)
        elif self.oper == '~':
            return val.find(self.val) != -1
            
    def get_matching(self, objset):
        newset = objset.copy()
        for obj in objset:
            if not self.is_true(obj):
                newset.discard(obj)
        return newset
        
    def to_sitag(self):
        tag = SIStringTag(self.oper, SIC.TAG_OBJ_CRITERION)
        tag.subtags.extend([
            SIStringTag(self.prop, SIC.TAG_OBJ_CRIT_PROPERTY),
            SIStringTag(self.val, SIC.TAG_OBJ_CRIT_VALUE)
        ])
        return tag
        
        
class OExpression:
    def __init__(self, oper, crit_a, crit_b=None):
        self.oper = oper
        self.crit_a = crit_a
        self.crit_b = crit_b
        
    def is_true(self, obj):
        return len(self.get_matching(set([obj]))) > 0
            
    def get_matching(self, objset):
        if self.crit_a is None:
            # Empty expression is always true
            return objset
    
        set_a = self.crit_a.get_matching(objset)
        
        if self.oper == 'and':
            # Only check the right expr on objects matching the left expr
            return self.crit_b.get_matching(set_a)
        elif self.oper == 'or':
            # Only check the right expr on objects not matching the left expr
            set_b = objset - set_a        
            return set_a | self.crit_b.get_matching(set_b)
        elif self.oper == '':
            return set_a
            
    def to_sitag(self):
        tag = SIStringTag(self.oper, SIC.TAG_OBJ_EXPRESSION)
        tag.subtags.append(self.crit_a.to_sitag())
        if self.crit_b is not None:
            tag.subtags.append(self.crit_b.to_sitag())
        return tag
        
    @classmethod
    def from_sitag(cls, tag):
        if tag.name == SIC.TAG_OBJ_CRITERION:
            prop = tag.get_subtag(SIC.TAG_OBJ_CRIT_PROPERTY).value
            val = tag.get_subtag(SIC.TAG_OBJ_CRIT_VALUE).value
            return OCriterion(prop, tag.value, val)
        elif tag.name == SIC.TAG_OBJ_EXPRESSION:
            if len(tag.subtags) == 0:
                return cls(tag.value, None)
            elif len(tag.subtags) == 1:
                crit = cls.from_sitag(tag.subtags[0])
                return cls(tag.value, crit)
            elif len(tag.subtags) == 2:
                crit_a = cls.from_sitag(tag.subtags[0])
                crit_b = cls.from_sitag(tag.subtags[1])
                return cls(tag.value, crit_a, crit_b)
            else:
                return None
        else:
            return None
        
        
class ObjectProvider:
    """Base class for object providers
    
    Provides some utility methods to help storing and retrieving object
    properties, and defines exception-raising methods that must be overriden
    (see those methods for more details):
    - get_oids()
    - valid_oid(oid)
    - get_types(oid)
    - get_value(oid, prop)
    - set_value(oid, prop, val)
    - describe_props(oid, detail_level) 
      
    The following methods can also be overriden, but they have a default
    implementation:
    - matching_oids(expr, types)
    
    """
    
    def __init__(self, domserver, name):
        self.domserver = domserver
        self.name = name
        
    def _get_object_id(self, oid, create=False):
        """Retrieve rowid from object database corresponding to object 'oid'.
        When no row is found, return None, except when 'create' is true, in
        which case create the database entry for 'oid' and return the new rowid.
        Internal use only.
        """
        
        db = self.domserver.get_obj_db()
        objref = "%s:%s" % (self.name, oid)
        query = "SELECT id FROM objects WHERE objref = ?"
        try:
            obj_id = db.execute(query, (objref,)).fetchone()[0]
        except TypeError:
            if create:
                query = "INSERT INTO objects(objref) VALUES(?)"
                obj_id = db.execute(query, (objref,)).lastrowid
                db.commit()
            else:
                obj_id = None
        db.close()
        return obj_id
        
    def _prune_objects(self):
        """Remove objects with no stored properties.  Internal use only."""
        
        db = self.domserver.get_obj_db()
        query = """DELETE FROM objects WHERE NOT EXISTS
                    (SELECT * FROM object_properties
                      WHERE object_id = id)"""
        db.execute(query)
        db.commit()
        db.close()
        
    def save_object_property(self, oid, prop, value):
        """Store object property"""
        
        db = self.domserver.get_obj_db()
        obj_id = self._get_object_id(oid, True)
        query = """INSERT OR REPLACE INTO object_properties(object_id, property,
                     value) VALUES(?,?,?)"""
        db.execute(query, (obj_id, prop, repr(value)))
        db.commit()
        db.close()
        
    def load_object_property(self, oid, prop):
        """Retrieve object property or raise KeyError if not found"""
    
        kerr = "Object '%s:%s' has no '%s' property" % (self.name, oid, prop)
        obj_id = self._get_object_id(oid)
        if obj_id is None:
            raise KeyError(kerr)
        db = self.domserver.get_obj_db()
        query = """SELECT value FROM object_properties
                    WHERE object_id = ? AND property = ?"""
        try:
            val = db.execute(query, (obj_id, prop)).fetchone()[0]
        except TypeError:
            db.close()
            raise KeyError(kerr)
        db.close()
        return eval(val)
        
    def remove_object_property(self, oid, prop):
        """Remove object property"""
        
        obj_id = self._get_object_id(oid)
        if obj_id is None:
            return
        db = self.domserver.get_obj_db()
        query = """DELETE FROM object_properties
                    WHERE object_id = ? AND property = ?"""
        db.execute(query, (obj_id, prop))
        db.commit()
        db.close()
        self._prune_objects()
        
    def list_object_properties(self, oid):
        """Retrieve object property names"""
        
        obj_id = self._get_object_id(oid)
        if obj_id is None:
            return []
        db = self.domserver.get_obj_db()
        query = """SELECT property FROM object_properties
                    WHERE object_id = ?"""
        props = [r[0] for r in db.execute(query, (obj_id,)).fetchall()]
        db.close()
        return props
        
    def save_object(self, oid, properties):
        """Store several properties at once"""
        
        for k in properties.keys():
            self.save_object_property(oid, k, properties[k])
            
    def load_object(self, oid):
        """Load all object properties for oid"""
        
        props = {}
        for k in self.list_object_properties(oid):
            props[k] = self.load_object_property(oid, k)
        return props
            
    def remove_object(self, oid):
        """Remove all stored properties for oid at once"""
        
        obj_id = self._get_object_id(oid)
        if obj_id is None:
            return
        db = self.domserver.get_obj_db()
        db.execute("""DELETE FROM object_properties
                       WHERE object_id = ?""", (obj_id,))
        db.commit()
        db.close()
        self._prune_objects()
        
    def list_objects(self):
        """Retrieve all oids with stored properties"""
        
        db = self.domserver.get_obj_db()
        query = """SELECT objref FROM objects
                    WHERE objref LIKE ?"""
        oids = [
            r[0].split(':', 1)[1]
            for r in db.execute(query, ("%s:%%" % self.name,)).fetchall()
        ]
        db.close()
        return oids
        
    def _prop_to_sitags(self, prop, value, d):
        if d.has_key('conv'):
            conv = d['conv']
        else:
            conv = lambda x:x
            
        if d['type'] == 'dict':
            tag = SIStringTag(prop, SIC.TAG_OBJ_ARRAY)
            subtags = self._desc_to_sitags(value, d['desc'])
            tag.subtags.extend(subtags)
        else:
            tag = SIStringTag(prop, SIC.TAG_OBJ_PROPERTY)
            if d['type'] == 'string':
                cls = SIStringTag
            elif d['type'] == 'uint32':
                cls = SIUInt32Tag
            tag.subtags.append(cls(conv(value), SIC.TAG_OBJ_VALUE))
            
        return tag
        
    def _desc_to_sitags(self, item, desc):
        tags = []
        for prop in desc.keys():
            if prop == '*':
                continue
            tags.append(self._prop_to_sitags(prop, item[prop], desc[prop]))
            
        if desc.has_key('*'):
            for prop in item.keys():
                tags.append(self._prop_to_sitags(prop, item[prop], desc['*']))
        return tags
        
    def to_sitags(self, oid, detail_level):
        desc = self.describe_props(oid, detail_level)
        item = {}
        for prop in desc.keys():
            item[prop] = self.get_value(oid, prop)
        return self._desc_to_sitags(item, desc)
                
    def get_oids(self):
        """Should return a list of all object ids known by the provider.
        
        It may always return an empty or partial list (when returning the whole
        list would be too expensive), in which case matching_oids() should be
        overriden to make the object list searchable."""
        raise ImplementationError("get_oids not overriden")
        
    def valid_oid(self, oid):
        """Must return True is oid is known by the provider, False otherwise"""
        raise ImplementationError("valid_oid not overriden")
        
    def get_types(self, oid):
        """Must return the types of object oid.  This is used by other apps to
        choose what they can do with this object."""
        raise ImplementationError("get_types not overriden")
        
    def get_value(self, oid, prop):
        """Must return the value of property prop for object oid, or raise
        KeyError if it has no such property."""
        raise ImplementationError("get_value not overriden")
        
    def set_value(self, oid, prop, val):
        """Must set the value of property prop for object oid, or raise KeyError
        if it has no such property or if it is not writable."""
        raise ImplementationError("set_value not overriden")
        
    def describe_props(self, oid, detail_level):
        """Describe how to transmit object property values
                
        Must return a dict with properties to transmit as keys (*) and a dicts
        values, with the following keys:
        - 'type': mandatory; 'uint32', 'string' or 'dict'
        - 'conv': optional; callable to convert object property values before
          transmitting.
               
        Type 'dict' is used to transmit properties whose values are dicts.  In
        this case, there should also be a second-level description dict as key
        'desc' to describe how to transmit the values.
        
        (*) The special property '*' can be used to specify transmission info
        for all other properties, but it can only be used in level 2+
        descriptions (ie. for type 'dict') as ObjectWrappers do not have a
        keys() method.
        
        """
        raise ImplementationError("describe_props not overriden")
        
    def matching_oids(self, expr, types):
        """Should return a list of object ids matching
        expr and, if types is not None or an empty list, of a type in types.
        This can be used for object providers that cannot reasonably return the
        whole list of their objects using get_oids(), in order to give access to
        subsets of the object list.  If not overriden, a default matching is
        performed on the result of get_oids()."""
        
        oids = self.get_oids()
        objects = [self.domserver._obj.obj("%s:%s" % (self.name, oid))
                    for oid in oids]
        mobjects = expr.get_matching(set(objects))
        return [o.oid for o in mobjects if o.is_oneof(types)]
        
        
class ObjectProcessor:
    """Base class for object processors.
    
    Methods to override:
    - get_action_names must return a list of executable action names, either
      applicable to obj if not None, or void otherwise.
    - describe_action must call add_params on the actionwrapper passed to
      complete its description.  It should access the actionwrapper name and obj
      properties.
    - execute_action must execute the actionwrapper passed, and may only raise
      ObjectError when something goes wrong.  If it succeeds, it must return
      None, or a action_progress ID (integer) when one has been created.
    
    """

    def __init__(self, domserver, name):
        self.domserver = domserver
        self.name = name
        
    def get_action_names(self, obj=None):
        raise ImplementationError("get_action_names not overriden")
        
    def describe_action(self, actwrapper):
        raise ImplementationError("describe_action not overriden")
        
    def execute_action(self, actwrapper):
        raise ImplementationError("execute_action not overriden")
        
        

class ObjectAccessor:
    def __init__(self, domserver):
        self.domserver = domserver
        self.providers = {}
        self.processors = {}
        self.domserver.register_packet_handler(SIC.OP_OBJECTS, self.handle_sipacket)
        
    def register_interface(self, **kwargs):
        try:
            name = kwargs['name']
        except KeyError:
            raise TypeError("Argument 'name' is mandatory")
        provider = kwargs.get('provider', None)
        processor = kwargs.get('processor', None)
        if provider:
            self.providers[name] = provider
        if processor:
            self.processors[name] = processor
        
    def obj(self, objref):
        try:
            owner, oid = objref.split(':', 1)
        except ValueError:
            raise ObjectError("Invalid object reference '%s'" % objref)
        try:
            source = self.providers[owner]
        except KeyError:
            raise ObjectError("'%s' provides no objects" % owner)
        return ObjectWrapper(owner, oid, source)
        
    def act(self, actref, objref=None):
        try:
            owner, aid = actref.split(':', 1)
        except ValueError:
            raise ObjectError("Invalid action reference '%s'" % actref)
        try:
            source = self.processors[owner]
        except KeyError:
            raise ObjectError("'%s' cannot process actions" % owner)
        return ActionWrapper(self, owner, aid, objref)
        
    def __getitem__(self, key):
        try:
            return self.obj(key)
        except ObjectError, e:
            raise KeyError(e)
        
    def match(self, owner, expr, types=None):
        oids = self.providers[owner].matching_oids(expr, types)
        return [self.obj("%s:%s" % (owner, oid)) for oid in oids]
        
    def match_searchtag(self, tag):
        owner = tag.value
        
        if owner not in self.providers.keys():
            msg = "Invalid object owner '%s'" % owner
            self.domserver.verbose(msg)
            raise ObjectError(msg)
                    
        exprtag = tag.get_subtag(SIC.TAG_OBJ_EXPRESSION)
        expr = OExpression.from_sitag(exprtag)
        return self.match(owner, expr)
            
    def handle_sipacket(self, client, packet):
        tagnames = [
            SIC.TAG_OBJ_MATCHQUERY,
            SIC.TAG_OBJ_REFERENCE,
            SIC.TAG_ACTION_QUERY,
            SIC.TAG_ACTION_EXECUTE
        ]
        
        tag = None
        found = None
        for tn in tagnames:
            tag = packet.get_tag(tn)
            if tag is not None:
                found = tn
                break;
        if tag is None:
            return False
    
        if found == SIC.TAG_OBJ_MATCHQUERY:
            try:
                objs = self.match_searchtag(tag)
            except ObjectError:
                return False
                
            try:
                detail_level = tag.get_subtag(SIC.TAG_OBJ_DETAIL_LEVEL).value
            except AttributeError:
                detail_level = 0
                
            resp = SIPacket(opcode=SIC.OP_OBJECTS)
            for o in objs:
                tag = SIStringTag("%s:%s" % (o.owner, o.oid), SIC.TAG_OBJ_REFERENCE)
                tag.subtags.extend(o.to_sitags(detail_level))
                resp.tags.append(tag)
            client.answer(resp)
            return True
            
        elif found == SIC.TAG_OBJ_REFERENCE:
            try:
                o = self.obj(tag.value)
            except ObjectError:
                return False
                
            try:
                detail_level = tag.get_subtag(SIC.TAG_OBJ_DETAIL_LEVEL).value
            except AttributeError:
                detail_level = 0
                
            resp = SIPacket(opcode=SIC.OP_OBJECTS)
            tag = SIStringTag("%s:%s" % (o.owner, o.oid), SIC.TAG_OBJ_REFERENCE)
            tag.subtags.extend(o.to_sitags(detail_level))
            resp.tags.append(tag)
            client.answer(resp)
            return True
            
        elif found == SIC.TAG_ACTION_QUERY:
            try:
                objref = tag.get_subtag(SIC.TAG_OBJ_REFERENCE).value
                o = self.obj(objref)
            except AttributeError:
                o = None
            except ObjectError:
                return False
                
            try:
                proc = self.processors[tag.value]
            except KeyError:
                self.domserver.verbose("Invalid object processor '%s'" % tag.value)
                return False
                
            names = proc.get_action_names(o)
            acts = [ActionWrapper(self, proc.name, n, o) for n in names]
            for a in acts:
                proc.describe_action(a)
            
            resp = SIPacket(opcode=SIC.OP_OBJECTS)
            resp.tags.extend([a.to_sitag() for a in acts])
            client.answer(resp)
            return True
                
        elif found == SIC.TAG_ACTION_EXECUTE:
            try:
                actiontag = tag.get_subtag(SIC.TAG_ACTION_ID)
                action = actiontag.value
            except AttributeError:
                return False
            
            try:
                objref = tag.get_subtag(SIC.TAG_OBJ_REFERENCE).value
                o = self.obj(objref)
            except AttributeError:
                o = None
            except ObjectError:
                return False
                
            try:
                proc = self.processors[tag.value]
            except KeyError:
                self.domserver.verbose("Invalid object processor '%s'" % tag.value)
                return False
                
            act = ActionWrapper(self, proc.name, action, o)
            proc.describe_action(act)
            try:
                ret = act.execute(actiontag)
            except ObjectError:
                return False
                
            if ret is not None:
                client.answer_progress(ret)
            else:
                client.answer_success()
            return True
            
            
class ObjectWrapper:
    """Wrapper class for objects to access provider functions.
    
    Provides dictionnary-like interfaces to read/write object properties and
    method to check object types."""

    def __init__(self, owner, oid, provider):
        self.owner = owner
        self.oid = oid
        self.provider = provider
        
        if not self.provider.valid_oid(oid):
            raise ObjectError("Object '%s:%s' is unknown" % (owner, oid))
                
    def to_sitags(self, detail_level):
        return self.provider.to_sitags(self.oid, detail_level)
        
    def is_a(self, typ):
        return typ in self.provider.get_types(self.oid)
        
    def is_oneof(self, types):
        if types is None or len(types) == 0:
            return True
        else:
            for t in types:
                if self.is_a(t):
                    return True
            return False
        
    def get_value(self, prop):
        return self.provider.get_value(self.oid, prop)
        
    def set_value(self, prop, val):
        self.provider.set_value(self.oid, prop, val)
        
    def __setitem__(self, key, value):
        self.set_value(key, value)
        
    def __getitem__(self, key):
        return self.get_value(key)
        
        
class ActionWrapper:
    
    def __init__(self, accessor, owner, name, objref=None):
        self.accessor = accessor
        self.owner = owner
        self.name = name
        self.obj = accessor.obj(objref) if objref else None
        self.params = {}
        try:
            self.processor = accessor.processors[owner]
        except KeyError:
            raise ObjectError("'%s' cannot process actions" % owner)
        
    def add_param(self, name, flags=0, default=None):
        self.params[name] = {
            'flags': flags,
            'value': default
        }
                
    def to_sitag(self):
        actiontag = SIStringTag(self.name, SIC.TAG_ACTION_ID)
        subtags = []
        for name in self.params.keys():
            p = self.params[name]
            tag = SIStringTag(name, SIC.TAG_ACTION_PARAM)
            tag.subtags.append(
                SIUInt32Tag(p['flags'], SIC.TAG_ACTION_PARAM_FLAGS)
            )
            if p['value'] is not None:
                if p['flags'] & SIC.APFLAG_TYPE_STRING:
                    cls = SIStringTag
                elif p['flags'] & SIC.APFLAG_TYPE_NUMBER:
                    cls = SIUInt32Tag
                elif p['flags'] & SIC.APFLAG_TYPE_OBJREF:
                    cls = SIStringTag
                elif p['flags'] & SIC.APFLAG_TYPE_BOOL:
                    cls = SIUInt8Tag
                tag.subtags.append(cls(p['value'], SIC.TAG_ACTION_PARAM_VALUE))
            subtags.append(tag)
        actiontag.subtags.extend(subtags)
        return actiontag
        
    def execute(self, tag):
        vals = {}
        for t in tag.subtags:
            if t.name == SIC.TAG_ACTION_PARAM:
                st = t.get_subtag(SIC.TAG_ACTION_PARAM_VALUE)
                if st is None:
                    raise ObjectError("Param '%s' has no value" % t.value)
                vals[t.value] = st.value
        for name in self.params.keys():
            if vals.has_key(name):
                self.params[name]["value"] = vals[name]
            elif self.params[name]['flags'] & SIC.APFLAG_OPTION_OPTIONAL == 0:
                raise ObjectError("Mandatory param '%s' missing" % name)
        return self.processor.execute_action(self)
        

