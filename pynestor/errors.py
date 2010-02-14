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


class NestorError(Exception):
    """Generic nestor error"""
    pass
    
class CancelOperation(NestorError):
    """Utility exception raised when something that was not found means that
    related operations should be cancelled"""
    pass
    
class DaemonizeError(NestorError):
    """Raised when nestor fails to daemonize"""
    pass
    
class DBError(NestorError):
    """Raised on database creation/connexion error"""
    pass
    
class ImplementationError(NestorError):
    """Raised when a class is incorrectly subclassed"""
    pass
    
class ObjectError(NestorError):
    """Raised when something bad happens during a query on objects"""
    pass
    
class ObjectCacheMiss(NestorError):
    """Raised when an object is not in cache"""
    pass
    
class SIVersionMismatch(NestorError):
    """Raised when a client tries to connect with an unsupported SI protocol"""
    pass

class UnexpectedStopError(NestorError):
    """Raised when a thread stops unexpectedly"""
    pass
    
