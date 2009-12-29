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


class _SICodes:
    # Protocol version
    VERSION                      = 0x000C

    # Packet flags
    FLAGS_BLANK                  = 0x0000
    FLAGS_USE_ZLIB               = 0x0100

    # Tag types
    TAGTYPE_UINT8                = 0x01
    TAGTYPE_UINT16               = 0x02
    TAGTYPE_UINT32               = 0x03
    TAGTYPE_STRING               = 0x05

    # Packet opcodes
    OP_NOOP                      = 0x00
    OP_ACTIONS                   = 0x01
    OP_OBJECTS                   = 0x70
    OP_SUCCESS                   = 0x80
    OP_PROCESSING                = 0x81
    OP_FAILURE                   = 0x82

    # Tag names
    TAG_ACTION_TYPE              = 0x0001
    TAG_ACTION_CONFIG_KEY        = 0x0100
    TAG_ACTION_CONFIG_VAL        = 0x0101
    TAG_ACTION_FILE_OP           = 0x0110
    TAG_ACTION_FILE_FROM         = 0x0111
    TAG_ACTION_FILE_TO           = 0x0113
    TAG_ACTION_PROGRESS_ID       = 0x0120
    TAG_ACTION_INFO_KEY          = 0x0130
    TAG_ACTION_INFO_VALUE        = 0x0131
    TAG_ACTION_DISK_DEVICE       = 0x0140
    TAG_ACTION_DISK_MOUNTPOINT   = 0x0141
    TAG_ACTION_DISK_TOTAL        = 0x0142
    TAG_ACTION_DISK_FREE         = 0x0143
    
    TAG_FAILURE_REASON           = 0x00FF
    
    TAG_OBJ_REFERENCE            = 0x0700
    TAG_OBJ_MATCHQUERY           = 0x0701
    TAG_OBJ_DETAIL_LEVEL         = 0x0702
    TAG_OBJ_EXPRESSION           = 0x0703
    TAG_OBJ_CRITERION            = 0x0704
    TAG_OBJ_CRIT_PROPERTY        = 0x0705
    TAG_OBJ_CRIT_VALUE           = 0x0706
    TAG_OBJ_PROPERTY             = 0x0707
    TAG_OBJ_VALUE                = 0x0708
    TAG_OBJ_ARRAY                = 0x0709
    TAG_OBJ_TYPE                 = 0x070A
    TAG_ACTION_QUERY             = 0x0710
    TAG_ACTION_EXECUTE           = 0x0711
    TAG_ACTION_ID                = 0x0712
    TAG_ACTION_PARAM             = 0x0713
    TAG_ACTION_PARAM_FLAGS       = 0x0714
    TAG_ACTION_PARAM_VALUE       = 0x0715
    
    # Action parameter flags
    APFLAG_MASK_TYPE             = 0x000000FF
    APFLAG_TYPE_STRING           = 0x00000001
    APFLAG_TYPE_NUMBER           = 0x00000002
    APFLAG_TYPE_OBJREF           = 0x00000003
    APFLAG_TYPE_BOOL             = 0x00000004
    APFLAG_MASK_OPTION           = 0x0000FF00
    APFLAG_OPTION_OPTIONAL       = 0x00000100

SIC = _SICodes()

