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

import time

from .errors import ObjectError, ObjectCacheMiss, ImplementationError
from .socketinterface import SIPacket, SIStringTag, SIUInt32Tag
from .socketinterfacecodes import SIC


class OCriterion:

    def __init__(self, prop, oper, val):
        self.prop = prop
        self.oper = oper
        self.val = val
        
    def dump(self):
        return "[%s %s %r]" % (self.prop, self.oper, self.val)
        
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
        elif self.oper in ('<~', '~', '~>'):
            sval = self.val.lower()
            val = val.lower()    
            if self.oper == '<~':
                return val.startswith(sval)
            elif self.oper == '~>':
                return val.endswith(sval)
            elif self.oper == '~':
                return val.find(sval) != -1
            
    def get_matching(self, objset):
        yes = []
        no = []
        for obj in objset:
            if self.is_true(obj):
                yes.append(obj)
            else:
                no.append(obj)
        return yes, no
    
    def to_sqlwhere(self, prop_map):
        """Translate criterion into SQL WHERE condition
        
        prop_map is a dict that maps object property names to SQL fields names.
        Return a tuple containing:
        - the WHERE expression with '?' placeholders for values
        - a list of values in the right order according to the WHERE expr.
        
        Note: field names can also contain single-field SELECT statements.
        """
        
        oper_map = {
            '==': ['%s = ?', lambda x:x],
            '!=': ['%s != ?', lambda x:x],
            '>':  ['%s > ?', lambda x:x],
            '>=': ['%s >= ?', lambda x:x],
            '<':  ['%s < ?', lambda x:x],
            '<=': ['%s <= ?', lambda x:x],
            '<~': ['%s LIKE ?', lambda x:"%s%%" % x],
            '~>': ['%s LIKE ?', lambda x:"%%%s" % x],
            '~':  ['%s LIKE ?', lambda x:"%%%s%%" % x]
        }[self.oper]
        
        return oper_map[0] % prop_map[self.prop], [oper_map[1](self.val)]
        
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
        
    def dump(self):
        if self.oper == '':
            if self.crit_a:
                return self.crit_a.dump()
            else:
                return "empty"
        else:
            return "(%s %s %s)" % (self.crit_a.dump(), self.oper,
                self.crit_b.dump())
        
    def is_true(self, obj):
        yes, no = self.get_matching([obj])
        return len(yes) > 0
            
    def get_matching(self, objset):
        if self.crit_a is None:
            # Empty expression is always true
            return objset, []
    
        yes_a, no_a = self.crit_a.get_matching(objset)
        
        if self.oper == 'and':
            # Only check the right expr on objects matching the left expr
            yes_b, no_b = self.crit_b.get_matching(yes_a)
            return yes_b, no_a + no_b
        elif self.oper == 'or':
            # Only check the right expr on objects not matching the left expr
            yes_b, no_b = self.crit_b.get_matching(no_a)
            return yes_a + yes_b, no_b
        elif self.oper == '':
            return yes_a, no_a
            
    def to_sqlwhere(self, prop_map):
        """Translate expression into a SQL WHERE condition
        
        prop_map is a dict that maps object property names to SQL fields names.
        Return a tuple containing:
        - the WHERE expression with '?' placeholders for values
        - a list of values in the right order according to the WHERE expr.
        
        Note: field names can also contain single-field SELECT statements.
        """
        if self.crit_a is None:
            return "(1=?)", [1]
        if self.oper == 'and':
            where_a, data_a = self.crit_a.to_sqlwhere(prop_map)
            where_b, data_b = self.crit_b.to_sqlwhere(prop_map)
            return "(%s AND %s)" % (where_a, where_b), data_a + data_b
        elif self.oper == 'or':
            where_a, data_a = self.crit_a.to_sqlwhere(prop_map)
            where_b, data_b = self.crit_b.to_sqlwhere(prop_map)
            return "(%s OR %s)" % (where_a, where_b), data_a + data_b
        elif self.oper == '':
            where, data = self.crit_a.to_sqlwhere(prop_map)
            return "(%s)" % where, data
            
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


class ObjectWrapper:
    """Base class for objects.
    
    'types' is the list of types known by the application for the object. Its
    only use is to filter objects returned by a search query.
    
    'props' is a dict of properties for the objects.
    
    'prop_desc' is a dict describing how to transmit those properties.  Keys are
    property names (*) and values are dicts with the following properties:
    
        - lod: minimal query level-of-detail for the property to be transmitted
        - type: 'uint32', 'string' or 'dict'
        - conv (optional): function to convert the value before transmission
    
        Type 'dict' is used to transmit properties whose values are dicts.  In
        this case, there should also be a second-level description dict as key
        'desc' to describe how to transmit the values.
        
        (*) The special property '*' can be used to specify transmission info
        for all other properties, but it can only be used in level 2+
        descriptions (ie. for type 'dict') as ObjectWrappers do not have a
        keys() method.
    
    """
    
    def __init__(self, domserver, provider, oid):
        self.domserver = domserver
        self.provider = provider
        self.owner = provider.name
        self.oid = oid
        self.objref = "%s:%s" % (self.owner, self.oid)
        
        self.types = []
        self.props = {}
        self.prop_desc = {}
        
        self.last_access = 0
        self.access_count = 0
        self._update(True)
        
    def _prop_to_sitags(self, lod, prop, value, d):
        """Create SITag for a property"""
        if d.has_key('conv'):
            conv = d['conv']
        else:
            conv = lambda x:x
            
        if d['type'] == 'dict':
            tag = SIStringTag(prop, SIC.TAG_OBJ_ARRAY)
            subtags = self._desc_to_sitags(lod, value, d['desc'])
            tag.subtags.extend(subtags)
        else:
            tag = SIStringTag(prop, SIC.TAG_OBJ_PROPERTY)
            if d['type'] == 'string':
                cls = SIStringTag
            elif d['type'] == 'uint32':
                cls = SIUInt32Tag
            tag.subtags.append(cls(conv(value), SIC.TAG_OBJ_VALUE))
            
        return tag
        
    def _desc_to_sitags(self, lod, item, desc):
        """Create object properties SITags"""
        
        tags = []
        for p in desc:
            if p == '*':
                continue
            if lod >= desc[p]['lod']:
                tags.append(self._prop_to_sitags(lod, p, item[p], desc[p]))
            
        if desc.has_key('*') and lod >= desc['*']['lod']:
            for p in item.keys():
                tags.append(self._prop_to_sitags(lod, p, item[p], desc['*']))
        return tags
        
    def to_sitag(self, lod):
        """Create object description SITag"""
        
        tag = SIStringTag(self.objref, SIC.TAG_OBJ_REFERENCE)
        tag.subtags.extend(self._desc_to_sitags(lod, self, self.prop_desc))
        typetag = SIStringTag(','.join(self.types), SIC.TAG_OBJ_TYPE)
        tag.subtags.append(typetag)
        return tag
        
    def _update(self, first=False):
        """Update object properties and access statistics"""
        
        if first:
            self.describe()
        else:
            self.update()
        self.last_access = time.time()
        self.access_count += 1
        
    def __getitem__(self, key):
        """Return object property 'key'"""
        
        try:
            return self.props[key]
        except KeyError:
            raise KeyError("Object '%s' has no property '%s'" % (self.objref,
                key))
        
    def __setitem__(self, key, value):
        """Set object property 'key' to 'value'"""
        
        self.set_value(key, value)
        
    def is_a(self, typ):
        return typ in self.types
        
    def is_oneof(self, types):
        if not types:
            return True
        for t in types:
            if self.is_a(t):
                return True
        return False
    
    def describe(self):
        """Describe the object.
        
        This function must be overriden to fill self.types, self.props and
        self.prop_desc.
        """
        
        raise ImplementationError("ObjectWrapper.describe() was not overriden")
    
    def update(self):
        """Update the object.
        
        This function must be overriden to update the values in self.types and 
        self.props.  For best performance, it should only update values that
        have changed since self.last_access.
        """
        
        raise ImplementationError("ObjectWrapper.update() was not overriden")
    
    def set_value(self, key, value):
        """Set a property value.
        
        This function can be overriden to prevent some properties from being
        written to, or to implement special behaviour when writing some
        properties.
        """
        
        if key in self.props:
            self.props[key] = value
        else:
            raise KeyError("Object '%s' has no property '%s'" % (self.objref,
                key))
            

class ActionWrapper:
    
    def __init__(self, processor, owner, name, obj):
        self.processor = processor
        self.owner = owner
        self.name = name
        self.obj = obj
        self.params = {}
        
    def add_param(self, name, typ='uint32', optional=False, default=None):
        self.params[name] = {
            'type': typ,
            'optional': optional,
            'value': default
        }
        
    def __getitem__(self, key):
        return self.params[key]['value']
                
    def to_sitag(self):
        actiontag = SIStringTag(self.name, SIC.TAG_ACTION_ID)
        for name in self.params:
            p = self.params[name]
            tag = SIStringTag(name, SIC.TAG_ACTION_PARAM)
            
            flags = 0
            if p['type'] == 'uint32':
                flags |= SIC.APFLAG_TYPE_NUMBER
                cls = SIUInt32Tag
            elif p['type'] == 'string':
                flags |= SIC.APFLAG_TYPE_STRING
                cls = SIStringTag
            elif p['type'] == 'objref':
                flags |= SIC.APFLAG_TYPE_OBJREF
                cls = SIStringTag
            elif p['type'] == 'bool':
                flags |= SIC.APFLAG_TYPE_BOOL
                cls = SIUInt8Tag
            
            tag.subtags.append(
                SIUInt32Tag(flags, SIC.TAG_ACTION_PARAM_FLAGS)
            )
            if p['value'] is not None:
                tag.subtags.append(cls(p['value'], SIC.TAG_ACTION_PARAM_VALUE))
            actiontag.subtags.append(tag)
        return actiontag
        
    def execute(self, tag):
        vals = {}
        for t in tag.subtags:
            if t.name == SIC.TAG_ACTION_PARAM:
                st = t.get_subtag(SIC.TAG_ACTION_PARAM_VALUE)
                if st is None:
                    raise ObjectError("missing-param-value:%s" % t.value)
                vals[t.value] = st.value
        for name in self.params.keys():
            if vals.has_key(name):
                self.params[name]["value"] = vals[name]
            elif self.params[name]['flags'] & SIC.APFLAG_OPTION_OPTIONAL == 0:
                raise ObjectError("missing-param:%s" % name)
        return self.processor._execute(self)
            
            
class ObjectCache:

    def __init__(self, domserver):
        self.domserver = domserver
        self.store = {}
        self.size = 0
        
    def get(self, objref):
        """Get ObjectWrapper with reference 'objref' from cache, or raise
        ObjectCacheMiss on cache miss"""
        
        owner, oid = objref.split(':', 1)
        if not owner in self.store or not oid in self.store[owner]:
            raise ObjectCacheMiss("Object '%s' not in cache" % objref)
        else:
            obj = self.store[owner][oid]
            obj._update()
            return obj
            
    def put(self, obj):
        """Put ObjectWrapper obj in cache"""
        
        if not obj.owner in self.store:
            self.store[obj.owner] = {}
        self.store[obj.owner][obj.oid] = obj
        self.size += 1
        
        if self.size % 100 == 0:
            self.domserver.debug("Object cache size above %d" % self.size)
            
    def invalidate(self, obj):
        """Remove ObjectWrapper 'obj' and all its other oids from cache, do not
        fail on cache miss."""
        
        for oid in obj.provider.infer_oids(obj):
            self.remove("%s:%s" % (obj.owner, oid))
        
    def remove(self, objref):
        """Remove ObjectWrapper with reference 'objref' from cache, do not fail
        on cache miss."""
        
        owner, oid = objref.split(':', 1)
        if owner in self.store and oid in self.store[owner]:
            del self.store[owner][oid]
            self.size -= 1
            if self.size % 100 == 0:
                self.domserver.debug("Object cache size below %d" % self.size)
        
           
class ObjectProvider:
    """Base class for object providers
    
    Provides some utility methods to help storing and retrieving object
    properties, and defines methods that must be overriden (see those methods
    for more details):
    - get_object(oid)
    - get_oids()
      
    The following methods can also be overriden, but they have a default
    implementation:
    - matching_oids(expr, types)
    - infer_oids()
    
    """
    
    def __init__(self, domserver, name, logger=None):
        self.name = name
        self.domserver = domserver
        self.log = logger or domserver
        
        self.obj = None
        self.cache = None
        
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
        
    def get(self, oid):
        try:
            return self.cache.get("%s:%s" % (self.name, oid))
        except ObjectCacheMiss:
            obj = self.get_object(oid)
            if obj:
                self.cache.put(obj)
                return obj
            else:
                raise ObjectErrpr("object-not-found:%s" % oid)
        
    def get_object(self, oid):
        """Return an ObjectWrapper corresponding to object oid.
        
        Must raise ObjectError when oid is not valid.
        """
        
        raise ImplementationError("ObjectProvider.get_object() not overriden")
        
    def get_oids(self):
        """Should return a list of all object ids known by the provider.
        
        It may always return an empty or partial list (when returning the whole
        list would be too expensive), in which case matching_oids() should be
        overriden to make the object list searchable.
        """
        
        raise ImplementationError("ObjectProvider.get_oids() not overriden")
        
    def match_oids(self, expr, types):
        """Should return a list of objects matching expr and, if types is not
        None or an empty list, of a type in types.
        
        This can be used for object providers that cannot reasonably return the
        whole list of their objects using get_oids(), in order to give access to
        subsets of the object list.  If not overriden, a default matching is
        performed on the result of get_oids().
        """
        
        objects = [self.get(oid) for oid in self.get_oids()]
        yes, no = expr.get_matching(objects)
        return [o.oid for o in yes if o.is_oneof(types)]
        
    def infer_oids(self, obj):
        """Return all known object ids for object obj
        
        This method should be overriden if either:
        - several object ids can identify the same object
        - some foreign objects are known by this provider
        
        "all known object ids" must include the original object id if it comes
        from this provider.
        """
    
        if obj.owner == self.name:
            return [obj.oid]
        else:
            return []
            
    def on_query_start(self):
        pass
        
    def on_query_end(self):
        pass
        
        
class ObjectProcessor:
    """Base class for object processors.
    
    Methods to override:
    - get_actions must return a list of executable action names applicable to a
      given object.
    - describe must call add_params on the actionwrapper passed to complete its
      description.
    - execute must execute the actionwrapper passed, and may only raise
      ObjectError when something goes wrong.  If it succeeds, it must return
      None, or a action_progress ID (integer) when one has been created.
    
    """

    def __init__(self, domserver, name):
        self.domserver = domserver
        self.name = name
        
    def get_actions(self, obj):
        raise ImplementationError("ObjectProcessor.get_actions() not overriden")
        
    def describe(self, actwrapper):
        raise ImplementationError("ObjectProcessor.describe() not overriden")
        
    def execute(self, actwrapper):
        raise ImplementationError("ObjectProcessor.execute() not overriden")
        
    def _describe(self, actwrapper):
        if actwrapper.name not in self.get_actions(actwrapper.obj):
            raise ObjectError("invalid-action-spec")
            
        return self.describe(actwrapper)
        
    def _execute(self, actwrapper):
        if actwrapper.name not in self.get_actions(actwrapper.obj):
            raise ObjectError("invalid-action-spec")
            
        return self.execute(actwrapper)
        

class ObjectAccessor:
    def __init__(self, domserver):
        self.domserver = domserver
        self.providers = {}
        self.processors = {}
        self.domserver.register_packet_handler(SIC.OP_OBJECTS, self.handle_sipacket)
        self.cache = ObjectCache(self.domserver)
        
    def register_interface(self, **kwargs):
        try:
            name = kwargs['name']
        except KeyError:
            raise TypeError("Argument 'name' is mandatory")
        provider = kwargs.get('provider', None)
        processor = kwargs.get('processor', None)
        if provider:
            self.providers[name] = provider
            provider.obj = self
            provider.cache = self.cache
        if processor:
            self.processors[name] = processor 
        
    def get(self, objref):
        """Try to get an ObjectWrapper from an object reference, or raise
        ObjectError.  Return (object, object-provider).
        """
        try:
            owner, oid = objref.split(':', 1)
        except ValueError:
            raise ObjectError("malformed-oid:%s" % objref)
            
        try:
            source = self.providers[owner]
        except KeyError:
            raise ObjectError("invalid-provider:%s" % owner)
            
        obj = source.get(oid)
        return obj, source
        
            
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
            if tag:
                found = tn
                break;
        if tag is None:
            client.answer_failure("no-query")
            return
    
        if found == SIC.TAG_OBJ_MATCHQUERY:
            self.domserver.perf("Starting matchquery")
                
            try:
                lod = tag.get_subtag(SIC.TAG_OBJ_DETAIL_LEVEL).value
            except AttributeError:
                lod = 0
                
            try:
                offset = tag.get_subtag(SIC.TAG_OBJ_LIST_OFFSET).value
            except AttributeError:
                offset = 0
                
            try:
                limit = tag.get_subtag(SIC.TAG_OBJ_LIST_LIMIT).value
            except AttributeError:
                limit = -1
                
            owners = tag.value.split(',')
            oids = []
            for owner in owners:            
                try:
                    if owner not in self.providers:
                        raise ObjectError("invalid-provider:%s" % owner)
                        
                    exprtag = tag.get_subtag(SIC.TAG_OBJ_EXPRESSION)
                    expr = OExpression.from_sitag(exprtag)
                    
                    try:
                        types = tag.get_subtag(SIC.TAG_OBJ_TYPE).value
                    except AttributeError:
                        types = ''
                    if types == '':
                        types = None
                    else:
                        types = types.split(',')
                        
                    self.domserver.perf("Owner %s, types %r, expression %s" %
                            (owner, types, expr.dump()))
                    
                    self.providers[owner].on_query_start()
                    oids.extend([[owner, oid]
                      for oid in self.providers[owner].match_oids(expr, types)])
                except ObjectError, e:
                    client.answer_failure(e)
                    return
                    
            self.domserver.perf("Matching oids retrieved")
            
            if limit == -1:
                oids = oids[offset:]
            else:
                oids = oids[offset:offset + limit]
                
            try:
                objs = [self.providers[owner].get(oid) for owner, oid in oids]
            except ObjectError, e:
                client.answer_failure(e)
                return
                
            self.domserver.perf("Matching objects wrapped")
                
            resp = SIPacket(opcode=SIC.OP_OBJECTS)
            resp.tags.extend([o.to_sitag(lod) for o in objs])
            resp.set_flag(SIC.FLAGS_USE_ZLIB)
            
            self.domserver.perf("Packet built")
            
            client.answer(resp)
            
            self.domserver.perf("Packet sent")
            for owner in owners:
                self.providers[owner].on_query_end()
            return
            
        elif found == SIC.TAG_OBJ_REFERENCE:
            self.domserver.perf("Starting object query (%s)" % tag.value)
            self.providers[tag.value.split(":", 1)[0]].on_query_start()
        
            try:
                obj, source = self.get(tag.value)
            except ObjectError, e:
                client.answer_failure(e)
                return
                
            try:
                lod = tag.get_subtag(SIC.TAG_OBJ_DETAIL_LEVEL).value
            except AttributeError:
                lod = 0
                
            resp = SIPacket(opcode=SIC.OP_OBJECTS)
            resp.tags.append(obj.to_sitag(lod))
            resp.set_flag(SIC.FLAGS_USE_ZLIB)
            client.answer(resp)
            self.providers[tag.value.split(":", 1)[0]].on_query_end()
            self.domserver.perf("Finished object query")
            return
            
        elif found == SIC.TAG_ACTION_QUERY:
            self.domserver.perf("Starting action query (%s)" % tag.value)
            try:
                try:
                    proc = self.processors[tag.value]
                except KeyError:
                    raise ObjectError("invalid-processor:%s" % tag.value)
                
                self.providers[tag.value].on_query_start()
                
                try:
                    objref = tag.get_subtag(SIC.TAG_OBJ_REFERENCE).value
                except AttributeError:
                    raise ObjectError("missing-objref")
                
                obj, source = self.get(objref)
            except ObjectError, e:
                client.answer_failure(e)
                return
                
            actions = [ActionWrapper(proc, tag.value, name, obj)
                for name in proc.get_actions(obj)]
            for a in actions:
                proc.describe(a)
                
            resp = SIPacket(opcode=SIC.OP_OBJECTS)
            resp.tags.extend([a.to_sitag() for a in actions])
            resp.set_flag(SIC.FLAGS_USE_ZLIB)
            client.answer(resp)
            self.providers[tag.value].on_query_end()
            self.domserver.perf("Finished action query")
            return
                
        elif found == SIC.TAG_ACTION_EXECUTE:
            self.domserver.perf("Starting action execute (%s)" % tag.value)
            try:
                try:
                    proc = self.processors[tag.value]
                except KeyError:
                    raise ObjectError("invalid-processor:%s" % tag.value)
                    
                self.providers[tag.value].on_query_start()
                try:
                    actiontag = tag.get_subtag(SIC.TAG_ACTION_ID)
                    action = actiontag.value
                except AttributeError:
                    raise ObjectError("missing-action-id")
                    
                try:
                    objref = tag.get_subtag(SIC.TAG_OBJ_REFERENCE).value
                except AttributeError:
                    raise ObjectError("missing-objref")
                    
                obj, source = self.get(objref)
            except ObjectError, e:
                client.answer_failure(e)
                return
                
            act = ActionWrapper(proc, proc.name, action, obj)
            try:
                proc._describe(act)
                ret = act.execute(actiontag)
            except ObjectError, e:
                client.answer_failure(e)
                return
                
            if ret is not None:
                client.answer_progress(ret)
            else:
                client.answer_success()
            self.providers[tag.value].on_query_end()
            return
            self.domserver.perf("Finished action execute")
            
