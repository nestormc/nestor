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

class WebApp:

    def __init__(self, ui, id, title):
        self.ui = ui
        self.id = id
        self.title = title
        self.skin = ui.skin
        
    def renew(self, om):
        self.om = om
        
    def create(self, cls, id, *args):
        return cls(self, self.om, id, *args)
        
    def get_summary_element(self):
        raise ImplementationError("WebApp.get_summary_element not overriden")
        
    def get_workspace_element(self):
        raise ImplementationError("WebApp.get_workspace_element not overriden")
    
