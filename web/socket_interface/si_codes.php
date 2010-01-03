<?

$_sicodes = array();
$_sicodes['VERSION'] = 0x000D;
$_sicodes['FLAGS_BLANK'] = 0x0000;
$_sicodes['FLAGS_USE_ZLIB'] = 0x0100;
$_sicodes['TAGTYPE_UINT8'] = 0x01;
$_sicodes['TAGTYPE_UINT16'] = 0x02;
$_sicodes['TAGTYPE_UINT32'] = 0x03;
$_sicodes['TAGTYPE_STRING'] = 0x05;
$_sicodes['OP_NOOP'] = 0x00;
$_sicodes['OP_ACTIONS'] = 0x01;
$_sicodes['OP_DISCONNECT'] = 0x40;
$_sicodes['OP_DISCONNECT_ACK'] = 0x41;
$_sicodes['OP_OBJECTS'] = 0x70;
$_sicodes['OP_SUCCESS'] = 0x80;
$_sicodes['OP_PROCESSING'] = 0x81;
$_sicodes['OP_FAILURE'] = 0x82;
$_sicodes['TAG_ACTION_TYPE'] = 0x0001;
$_sicodes['TAG_ACTION_CONFIG_KEY'] = 0x0100;
$_sicodes['TAG_ACTION_CONFIG_VAL'] = 0x0101;
$_sicodes['TAG_ACTION_FILE_OP'] = 0x0110;
$_sicodes['TAG_ACTION_FILE_FROM'] = 0x0111;
$_sicodes['TAG_ACTION_FILE_TO'] = 0x0113;
$_sicodes['TAG_ACTION_PROGRESS_ID'] = 0x0120;
$_sicodes['TAG_ACTION_INFO_KEY'] = 0x0130;
$_sicodes['TAG_ACTION_INFO_VALUE'] = 0x0131;
$_sicodes['TAG_ACTION_DISK_DEVICE'] = 0x0140;
$_sicodes['TAG_ACTION_DISK_MOUNTPOINT'] = 0x0141;
$_sicodes['TAG_ACTION_DISK_TOTAL'] = 0x0142;
$_sicodes['TAG_ACTION_DISK_FREE'] = 0x0143;
$_sicodes['TAG_FAILURE_REASON'] = 0x00FF;
$_sicodes['TAG_OBJ_REFERENCE'] = 0x0700;
$_sicodes['TAG_OBJ_MATCHQUERY'] = 0x0701;
$_sicodes['TAG_OBJ_DETAIL_LEVEL'] = 0x0702;
$_sicodes['TAG_OBJ_EXPRESSION'] = 0x0703;
$_sicodes['TAG_OBJ_CRITERION'] = 0x0704;
$_sicodes['TAG_OBJ_CRIT_PROPERTY'] = 0x0705;
$_sicodes['TAG_OBJ_CRIT_VALUE'] = 0x0706;
$_sicodes['TAG_OBJ_PROPERTY'] = 0x0707;
$_sicodes['TAG_OBJ_VALUE'] = 0x0708;
$_sicodes['TAG_OBJ_ARRAY'] = 0x0709;
$_sicodes['TAG_OBJ_TYPE'] = 0x070A;
$_sicodes['TAG_ACTION_QUERY'] = 0x0710;
$_sicodes['TAG_ACTION_EXECUTE'] = 0x0711;
$_sicodes['TAG_ACTION_ID'] = 0x0712;
$_sicodes['TAG_ACTION_PARAM'] = 0x0713;
$_sicodes['TAG_ACTION_PARAM_FLAGS'] = 0x0714;
$_sicodes['TAG_ACTION_PARAM_VALUE'] = 0x0715;
$_sicodes['APFLAG_MASK_TYPE'] = 0x000000FF;
$_sicodes['APFLAG_TYPE_STRING'] = 0x00000001;
$_sicodes['APFLAG_TYPE_NUMBER'] = 0x00000002;
$_sicodes['APFLAG_TYPE_OBJREF'] = 0x00000003;
$_sicodes['APFLAG_TYPE_BOOL'] = 0x00000004;
$_sicodes['APFLAG_MASK_OPTION'] = 0x0000FF00;
$_sicodes['APFLAG_OPTION_OPTIONAL'] = 0x00000100;

function SIC($key)
{
    global $_sicodes;
    return $_sicodes[$key];
}

?>