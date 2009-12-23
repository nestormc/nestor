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


class DomserverError(Exception):
    """Generic domserver error"""
    pass
    
class CancelOperation(DomserverError):
    """Utility exception raised when something that was not found means that
    related operations should be cancelled"""
    pass
    
class DaemonizeError(DomserverError):
    """Raised when domserver fails to daemonize"""
    pass
    
class DBError(DomserverError):
    """Raised on database creation/connexion error"""
    pass
    
class ImplementationError(DomserverError):
    """Raised when a class is incorrectly subclassed"""
    pass
    
class ObjectError(DomserverError):
    """Raised when trying to get an object with a wrong reference (unknown
    provider or malformed object reference)"""
    pass
    
class SIVersionMismatch(DomserverError):
    """Raised when a client tries to connect with an unsupported SI protocol"""
    pass

class UnexpectedStopError(DomserverError):
    """Raised when a thread stops unexpectedly"""
    pass
    
