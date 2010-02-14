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

import time

from .errors import ObjectError, ObjectCacheMiss, ImplementationError

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


class ObjectWrapper:
    """Base class for objects.
    
    'types' is the list of types known by the application for the object. Its
    only use is to filter objects returned by a search query.
    
    'props' is a dict of properties for the objects.
    
    """
    
    def __init__(self, nestor, provider, oid):
        self.nestor = nestor
        self.provider = provider
        self.owner = provider.name
        self.oid = oid
        self.objref = "%s:%s" % (self.owner, self.oid)
        
        self.types = []
        self.props = {}
        
        self.last_access = 0
        self.access_count = 0
        self._update(True)
        
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
        
    def getprops(self):
        return self.props.copy()
    
    def describe(self):
        """Describe the object.
        
        This function must be overriden to fill self.types and self.props
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
        
    def add_param(self, name, optional=False, default=None):
        self.params[name] = {
            'optional': optional,
            'value': default
        }
        
    def __getitem__(self, key):
        return self.params[key]['value']
        
    def execute(self, params):
        for name in self.params:
            if name in params:
                self.params[name]["value"] = params[name]
            elif self.params[name]['optional']:
                raise ObjectError("missing-param:%s" % name)
        return self.processor._execute(self)
            
            
class ObjectCache:

    def __init__(self, nestor):
        self.nestor = nestor
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
            self.nestor.debug("Object cache size above %d" % self.size)
            
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
                self.nestor.debug("Object cache size below %d" % self.size)
        
           
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
    
    def __init__(self, nestor, name, logger=None):
        self.name = name
        self.nestor = nestor
        self.log = logger or nestor
        
        self.obj = None
        self.cache = None
        
    def _get_object_id(self, oid, create=False):
        """Retrieve rowid from object database corresponding to object 'oid'.
        When no row is found, return None, except when 'create' is true, in
        which case create the database entry for 'oid' and return the new rowid.
        Internal use only.
        """
        
        db = self.nestor.get_obj_db()
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
        
        db = self.nestor.get_obj_db()
        query = """DELETE FROM objects WHERE NOT EXISTS
                    (SELECT * FROM object_properties
                      WHERE object_id = id)"""
        db.execute(query)
        db.commit()
        db.close()
        
    def save_object_property(self, oid, prop, value):
        """Store object property"""
        
        db = self.nestor.get_obj_db()
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
        db = self.nestor.get_obj_db()
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
        db = self.nestor.get_obj_db()
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
        db = self.nestor.get_obj_db()
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
        db = self.nestor.get_obj_db()
        db.execute("""DELETE FROM object_properties
                       WHERE object_id = ?""", (obj_id,))
        db.commit()
        db.close()
        self._prune_objects()
        
    def list_objects(self):
        """Retrieve all oids with stored properties"""
        
        db = self.nestor.get_obj_db()
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
                raise ObjectError("object-not-found:%s" % oid)
        
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

    def __init__(self, nestor, name):
        self.nestor = nestor
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
    def __init__(self, nestor):
        self.nestor = nestor
        self.providers = {}
        self.processors = {}
        self.cache = ObjectCache(self.nestor)
        
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
        
    def get(self, objref, querystart=False):
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
            
        if querystart:
            source.on_query_start()
        obj = source.get(oid)
        if querystart:
            source.on_query_end()
        return obj, source
        
    def get_object(self, objref):
        """Shortcut to get object only"""
        
        o, s = self.get(objref, True)
        return o
    
    def match_objects(self, owners, expr, types=None, offset=0, limit=-1):
        self.nestor.perf("Starting matchquery")
        oids = []
        for owner in owners:  
            if owner not in self.providers:
                raise ObjectError("invalid-provider:%s" % owner)
                
            self.nestor.perf("Owner %s, types %r, expression %s" %
                    (owner, types, expr.dump()))
            
            self.providers[owner].on_query_start()
            oids.extend([[owner, oid]
                for oid in self.providers[owner].match_oids(expr, types)])
                
        self.nestor.perf("Matching oids retrieved")
        
        if limit == -1:
            oids = oids[offset:]
        else:
            oids = oids[offset:offset + limit]
            
        objs = [self.providers[owner].get(oid) for owner, oid in oids]
            
        self.nestor.perf("Matching objects wrapped, returning")
        
        for owner in owners:
            self.providers[owner].on_query_end()
        
        return objs
    
    def do_action(self, owner, action, objref, params={}):
        self.nestor.perf("Starting action execute (%s.%s on %s)" % (owner, action, objref))
        try:
            proc = self.processors[owner]
        except KeyError:
            raise ObjectError("invalid-processor:%s" % owner)
            
        obj, source = self.get(objref, True)
            
        act = ActionWrapper(proc, proc.name, action, obj)
        proc._describe(act)
        ret = act.execute(params)
        source.on_query_end()
        self.nestor.perf("Finished action execute, returning")
        return ret
    
    def get_actions(self, processor, objref):
        self.nestor.perf("Starting action query (%s > %s)" % (processor, objref))
        try:
            proc = self.processors[processor]
        except KeyError:
            raise ObjectError("invalid-processor:%s" % tag.value)
        
        obj, source = self.get(objref, True)
        
        actions = [ActionWrapper(proc, tag.value, name, obj)
            for name in proc.get_actions(obj)]
        for a in actions:
            proc.describe(a)
        source.on_query_end()
            
        self.nestor.perf("Finished action query, returning")
        return actions

