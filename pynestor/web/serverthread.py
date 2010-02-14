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
from ..objects import ObjectError
from ..thread import Thread


class RequestHandler(BaseHTTPServer.BaseHTTPRequestHandler):

    def context(self, key):
        ds = self.server.nestor
        
        if key == 'ds':
            return ds
        elif key == 'obj':
            return ds._obj
        elif key == 'config':
            return ds.config
        elif key == 'output':
            return self.om
        
    def set_client_data(self, key, value):
        db = self.ds.get_main_db()
        query = """INSERT OR REPLACE INTO web_values(session_name, key, value)
                    VALUES(?, ?, ?)"""
        db.execute(query, (self.sid, key, repr(value)))
        db.commit()
        db.close()
        
    def get_client_data(self, key, default):
        db = self.ds.get_main_db()
        query = "SELECT value FROM web_values WHERE session_name=? AND key=?"
        ret = db.execute(query, (self.sid, key)).fetchall()
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
        """Send a local file"""
        
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
        
        ds = self.server.nestor
        
        split = self.path.lstrip('/').split('/')
        req = split[0]
        parm = split[1:]
        
        for i in range(len(parm)):
            parm[i] = urllib.unquote(parm[i])
        
        try:
            if req == 'obj':
                self._do_obj(parm, head)
            elif req == 'web':
                self._do_web(parm, head)
            elif req == 'ui' or self.path == '/':
                self._do_ui(req, parm, head)
            elif req == 'cover':
                self._do_cover(parm, head)
            else:
                self._404()
        except Exception, e:
            if not self.headers_done:
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self._end_headers()
            self.server.thread.info("Exception in web handler thread :")
            self.server.thread.log_exception(e)
            if not head:
                self.wfile.write("<pre>")
                self.wfile.write(traceback.format_exc())
                self.wfile.write("</pre>")
                
    def _do_cover(self, parm, head):
        """Cover URL: /cover/<skin name>/<artist>/<album>"""
        mdir = self.server.nestor.config['media.music_dir']
        skinname = parm[0]
        parm.append('cover.jpg')
        path = os.path.abspath(os.path.join(mdir, *parm[1:]))
        if not path.startswith("%s/" % mdir) or not os.path.isfile(path):
            staticpath = self.server.nestor.config["web.static_dir"]
            path = os.path.join(staticpath, "skins/%s/images/no_cover.svg" % skinname)
        self._proxy_file(path, head)
            
    def _do_obj(self, parm, head):
        """Respond to object request
            
        Available URLs:
            obj/<objref>
                displays object types and properties
            obj/notify/<name>[/<objref>[/<details]]
                publish a notification
            obj/action/<app>/<action>/<objref>[/<param>=<value>,...]
                do action on object
        """
        
        if not parm:
            self._404()
            return
            
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self._end_headers()
        if head: return
        
        ns = self.server.nestor
        
        if parm[0] == 'notify':
            for p in range(len(parm)):
                parm[p] = urllib.unquote(parm[p])
            ns.notify(*parm[1:])
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
        else:
            try:
                o, s = ns._obj.get(urllib.unquote('/'.join(parm)), True)
            except ObjectError, e:
                self.wfile.write("ObjectError: %s" % e)
                return
                
            self.wfile.write("<pre><b>Object %s</b> types=%r<br><br>" % (o.objref,
                o.types))
            for p in o.props:
                self.wfile.write("%s = %r<br>" % (p, o.props[p]))
            self.wfile.write("</pre>")
        
    def _do_web(self, parm, head):
        """Respond to web file request"""
        
        web_dir = self.server.nestor.config["web.static_dir"]
        path = os.path.abspath(os.path.join(web_dir, '/'.join(parm)))
        if path.startswith("%s/" % web_dir) and os.path.isfile(path):
            # FIXME find out if a different buffer size would be useful
            # (maybe with respect to its mimetype/size ?)
            self._proxy_file(path, head)
        else:
            self._404()
        
    def _session_exists(self, sid):
        db = self.ds.get_main_db()
        query = "DELETE FROM web_sessions WHERE expires <= ?"
        db.execute(query, (time.time(),))
        db.commit()
        query = "SELECT COUNT(*) AS C FROM web_sessions WHERE name = ?"
        ret = db.execute(query, (sid,)).fetchone()[0]
        db.close()
        return ret
        
    def _start_session(self):
        C = Cookie.SimpleCookie()
        if self.headers.has_key("cookie"):
            C.load(self.headers['cookie'])
            
        sid = C.get('nestor_sid', None)
        if sid:
            sid = sid.value
        if sid and not self._session_exists(sid):
            sid = None    
            
        expires = int(self.server.nestor.config["web.session_expires"])
        db = self.ds.get_main_db()
        if not sid:
            chost, cport = self.client_address
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
                self.send_header("Set-Cookie", cookie[len(cprefix):])
        
        return sid
            
    def _do_ui(self, req, parm, head):        
        self.ds = self.server.nestor
        
        # Start session and send headers
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.sid = self._start_session()
        self._end_headers()
        if head:
            return
            
        # Retrieve or create UI
        self.om = self.server.get_om(self.sid)
        if not self.om:
            self.om = WebOutputManager(self)
            self.server.set_om(self.sid, self.om)
        else:
            self.om.renew(self)
            
        # Render request
        if req == '':
            out = self.om.render_page()
        elif req == 'ui':        
            if parm[0] == 'update':
                out = self.om.update_elements(parm[1].split(','))
            elif parm[0] == 'handler':
                out = self.om.call_handler(*parm[1:3])
            elif parm[0] == 'drop':
                out = self.om.call_drop_handler(*parm[1:4])
        self.wfile.write(out.encode("utf-8"))
        
            
class NestorHTTPServer(BaseHTTPServer.HTTPServer):

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
        
        self.nestor.info("Starting web server, listening on %s:%d" % (host,
            port))
        
        self.https = NestorHTTPServer((host, port), RequestHandler,
            self.nestor, self)
        
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
        

