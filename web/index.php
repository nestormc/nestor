<?
    require_once "domserver.php";
    $ds = new Domserver();
    $ds->render();
    unset($ds);
?>
