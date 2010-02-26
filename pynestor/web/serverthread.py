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

import BaseHTTPServer
import Cookie
import hashlib
import mimetypes
import os
import os.path
import time
import traceback
import urllib

from .framework.outputmanager import WebOutputManager
from .webui import WebUI
from ..objects import ObjectError, OExpression
from ..thread import Thread

def handle_obj(ns, server, rh, parm, head):
    """Respond to object request
        
    Available URLs:
        obj/<objref>
            displays object types and properties
        obj/list/<app>
            list objects from <app> and display their types/properties
        obj/notify/<name>[/<objref>[/<details]]
            publish a notification
        obj/action/<app>/<action>/<objref>[/<param>=<value>,...]
            do action on object
    """
    
    if not parm:
        rh._404()
        return
        
    rh.send_response(200)
    rh.send_header("Content-Type", "text/html")
    rh._end_headers()
    if head: return
    
    if parm[0] == 'notify':
        for p in range(len(parm)):
            parm[p] = urllib.unquote(parm[p])
        notif_name = parm[1]
        notif_obj = '/'.join(parm[2:])
        ns.notify(notif_name, notif_obj)
        
    elif parm[0] == 'action':
        for p in range(len(parm)):
            parm[p] = urllib.unquote(parm[p])
            
        proc = parm[1]
        name = parm[2]
        objref = parm[3]
            
        # Get parameters
        aparams = {}
        if len(parm) > 4:
            for p in parm[4].split(","):
                pname, pval = p.split("=")
                aparams[pname] = pval
        
        # Execute action
        ns._obj.do_action(proc, name, objref, aparams)
        
    elif parm[0] == 'list':
        owner = parm[1]
        try:
            objs = ns._obj.match_objects([owner], OExpression('', None))
        except ObjectError, e:
            rh.wfile.write("ObjectError: %s" % e)
            return
            
        rh.wfile.write("<pre>")
        for o in objs:
            rh.wfile.write("<b>Object %s</b> types=%r<br><br>" % (o.objref,
                o.types))
            for p in o.props:
                rh.wfile.write("%s = %r<br>" % (p, o.props[p]))
            rh.wfile.write("<br><br>")
        rh.wfile.write("</pre>")
            
    else:
        try:
            o, s = ns._obj.get(urllib.unquote('/'.join(parm)), True)
        except ObjectError, e:
            rh.wfile.write("ObjectError: %s" % e)
            return
            
        rh.wfile.write("<pre><b>Object %s</b> types=%r<br><br>" % (o.objref,
            o.types))
        for p in o.props:
            rh.wfile.write("%s = %r<br>" % (p, o.props[p]))
        rh.wfile.write("</pre>")
        
        
def handle_web(ns, server, rh, parm, head):
    """Respond to web file request"""
    
    web_dir = ns.config["web.static_dir"]
    path = os.path.abspath(os.path.join(web_dir, '/'.join(parm)))
    if path.startswith("%s/" % web_dir) and os.path.isfile(path):
        # FIXME find out if a different buffer size would be useful
        # (maybe with respect to its mimetype/size ?)
        rh._proxy_file(path, head)
    else:
        rh._404()
        
        
def _session_exists(ns, sid):
    """Check if SID exists and has not expired"""
    
    db = ns.get_main_db()
    query = "DELETE FROM web_sessions WHERE expires <= ?"
    db.execute(query, (time.time(),))
    db.commit()
    query = "SELECT COUNT(*) AS C FROM web_sessions WHERE name = ?"
    ret = db.execute(query, (sid,)).fetchone()[0]
    db.close()
    return ret
    
    
def _start_session(ns, rh):
    """Start session, looking for SID in cookies, or creating a new one"""

    C = Cookie.SimpleCookie()
    if rh.headers.has_key("cookie"):
        C.load(rh.headers['cookie'])
        
    sid = C.get('nestor_sid', None)
    if sid:
        sid = sid.value
    if sid and not _session_exists(ns, sid):
        sid = None
        
    expires = int(ns.config["web.session_expires"])
    db = ns.get_main_db()
    if not sid:
        chost, cport = rh.client_address
        sid = hashlib.sha256(
            "nestor:%f:%s:%d" % (time.time(), chost, cport)
        ).hexdigest()
        
        query = "INSERT INTO web_sessions(name, expires) VALUES (?, ?)"
        db.execute(query, (sid, time.time() + expires))
    else:
        query = "UPDATE web_sessions SET expires = ? WHERE name = ?"
        db.execute(query, (time.time() + expires, sid))
    db.commit()
    db.close()
    
    C['nestor_sid'] = sid
    C['nestor_sid']['expires'] = time.strftime(
        "%a, %d %b %Y %H:%M:%S +0000",
        time.gmtime(time.time() + expires)
    )
    Cout = C.output().split("\r\n")
    cprefix = "Set-Cookie: "
    for cookie in Cout:
        if cookie.startswith(cprefix):
            rh.send_header("Set-Cookie", cookie[len(cprefix):])
    
    return sid
        
        
def handle_ui(ns, server, rh, parm, head):
    """Respond to UI requests"""
    
    # Start session and send headers
    rh.send_response(200)
    rh.send_header("Content-Type", "text/html")
    sid = _start_session(ns, rh)
    rh._end_headers()
    if head:
        return
        
    # Retrieve or create UI
    om = server.get_om(sid)
    if not om:
        om = WebOutputManager(rh, sid)
        server.set_om(sid, om)
    else:
        om.renew(rh, sid)
        
    # Render request
    if not parm:
        out = om.render_page()
    else:        
        if parm[0] == 'update':
            out = om.update_elements(parm[1].split(','))
        elif parm[0] == 'handler':
            out = om.call_handler(*parm[1:3])
        elif parm[0] == 'drop':
            out = om.call_drop_handler(*parm[1:5])
    rh.wfile.write(out.encode("utf-8"))
    
                
def handle_cover(ns, server, rh, parm, head):
    """Cover URL: /cover/<skin name>/<artist>/<album>"""
    
    mdir = ns.config['media.music_dir']
    skinname = parm[0]
    parm.append('cover.jpg')
    for i in range(len(parm)):
        parm[i] = parm[i].decode("utf-8")
    path = os.path.abspath(os.path.join(mdir, *parm[1:]))
    if not path.startswith("%s/" % mdir) or not os.path.isfile(path):
        staticpath = ns.config["web.static_dir"]
        path = os.path.join(staticpath, "skins/%s/images/no_cover.svg" % skinname)
    rh._proxy_file(path, head)
    
    
def handle_debug(ns, server, rh, parm, head):
    """Debug URL: /debug/<python expression>
    
    HIGHLY insecure; must be disabled (web.enable_debug_url=0) in production.
    """
    
    disabled = not int(ns.config["web.enable_debug_url"])
    if not parm or parm[0] == '' or disabled:
        rh._404()
        return
        
    rh.send_response(200)
    rh.send_header("Content-Type", "text/html")
    rh._end_headers()
    if head: return
    
    varname = parm[0]
    rh.wfile.write("<pre>")
    out = "%r" % eval(varname)
    out = out.replace("&", "&amp;")
    out = out.replace("<", "&lt;")
    out = out.replace(">", "&gt;")
    rh.wfile.write(out)
    rh.wfile.write("</pre>")
    

class RequestHandler(BaseHTTPServer.BaseHTTPRequestHandler):

    def set_client_data(self, sid, key, value):
        db = self.server.nestor.get_main_db()
        query = """INSERT OR REPLACE INTO web_values(session_name, key, value)
                    VALUES(?, ?, ?)"""
        db.execute(query, (sid, key, repr(value)))
        db.commit()
        db.close()
        
    def get_client_data(self, sid, key, default):
        db = self.server.nestor.get_main_db()
        query = "SELECT value FROM web_values WHERE session_name=? AND key=?"
        ret = db.execute(query, (sid, key)).fetchall()
        db.close()
        if ret:
            return eval(ret[0][0])
        else:
            return default

    def do_HEAD(self):
        self.do_GET(True)
        
    def _end_headers(self):
        self.end_headers()
        self.headers_done = True
            
    def _404(self):
        self.send_response(404)
        self._end_headers()
        
    def _proxy_file(self, path, head, bufsize=4096):
        """Send a local file
        
        PLEASE check the path before calling this (ie. deny access to absolute
        paths or paths containing '..').
        
        Set bufsize to None to disable buffering.
        """
        
        mtime = os.stat(path).st_mtime
        if self.headers.has_key("if-modified-since"):
            maxmtime = time.mktime(time.strptime(
                self.headers['if-modified-since'],
                "%a, %d %b %Y %H:%M:%S +0000"
            ))
            if mtime <= maxmtime:
                self.send_response(304)
                self._end_headers()
                return
                
        self.send_response(200)
        type, encoding = mimetypes.guess_type(path)
        if type:
            self.send_header("Content-Type", type)
        if encoding:
            self.send_header("Content-Encoding", encoding)
        self.send_header("Last-Modified",
            time.strftime("%a, %d %b %Y %H:%M:%S +0000", time.gmtime(mtime)))
        self._end_headers()
        if head: return
        
        f = open(path, 'rb')
        if not bufsize:
            self.wfile.write(f.read())
        else:
            cnt = f.read(bufsize)
            while len(cnt):
                self.wfile.write(cnt)
                cnt = f.read(bufsize)
        f.close()
    
    def do_GET(self, head=False):
        self.headers_done = False
        
        split = self.path.lstrip('/').split('/')
        req = split[0]
        parm = split[1:]
        
        for i in range(len(parm)):
            parm[i] = urllib.unquote(parm[i])
            
        if self.path == '/':
            req = ''
            
        handler = self.server.handlers.get(req, None)
        try:
            if handler:
                handler(self.server.nestor, self.server, self, parm, head)
            else:
                self._404()
        except Exception, e:
            if not self.headers_done:
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self._end_headers()
            self.server.thread.info("Web handler exception (%s):" % self.path)
            self.server.thread.log_exception(e)
            if not head:
                self.wfile.write("<pre>")
                self.wfile.write(traceback.format_exc())
                self.wfile.write("</pre>")
                
            
class NestorHTTPServer(BaseHTTPServer.HTTPServer):

    handlers = {}

    def register_url_handler(self, handler, subdir=None):
        """Register URL handler
        
        subdir: URLs starting with /subdir/ will be handed to handler; None or
            empty string means handle root URL.
        handler: URL handler function; will receive the following argument:
            - the Nestor instance
            - this server instance
            - the RequestHandler instance
            - a list of URL elements after /subdir/ (always empty for root URL)
            - a boolean telling if only headers are needed
        """
        
        self.handlers[subdir or ''] = handler

    def __init__(self, host, rqh, nestor, thread):   
        BaseHTTPServer.HTTPServer.__init__(self, host, rqh)
        self.nestor = nestor
        self.thread = thread
        self.om = {}
        self.om_access = {}
    
    def get_om(self, sid):
        expires = int(self.nestor.config["web.output_expires"])
        delete = []
        for k in self.om_access:
            if self.om_access[k] + expires < time.time():
                delete.append(k)
        for k in delete:
            del self.om[k]
            del self.om_access[k]
        if sid in self.om:
            self.om_access[sid] = time.time()
            return self.om[sid]            
        return None
        
    def set_om(self, sid, om):
        self.om[sid] = om
        self.om_access[sid] = time.time()
        

class HTTPServerThread(Thread):

    def nestor_run(self):
        host = self.nestor.config["web.host"]
        port = int(self.nestor.config["web.port"])
        
        self.nestor.info("Web server listening on %s:%d" % (host,
            port))
        
        self.https = NestorHTTPServer((host, port), RequestHandler,
            self.nestor, self)
            
        self.https.register_url_handler(handle_ui)
        self.https.register_url_handler(handle_ui, 'ui')
        self.https.register_url_handler(handle_obj, 'obj')
        self.https.register_url_handler(handle_web, 'web')
        self.https.register_url_handler(handle_cover, 'cover')
        self.https.register_url_handler(handle_debug, 'debug')
        
        self.running = True
        try:
            self.https.serve_forever()
        except:
            if self.running:
                raise
        
        self.nestor.info("Stopped web server")
        
    def stop(self):
        self.running = False
        self.https.server_close()

