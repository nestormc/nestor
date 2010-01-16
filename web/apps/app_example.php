<?

class ExampleElement extends AppElement
{
    function render()
    {
        $this->set_contents("example summary");
        $this->schedule_update(1000);
    }

    function update()
    {
        $this->set_css("color", time() % 2 ? "red" : "green");
        $this->set_dom("innerHTML", sprintf("time: %d", time()));
        $this->schedule_update(1000);
    }
}


class ExampleElement2 extends AppElement
{
    function render()
    {
        $this->set_contents("example element");
    }

    function update()
    {
        $this->set_css("color", time() % 2 ? "red" : "green");
        $this->set_dom("innerHTML", sprintf("WoRkSpAce !! time: %d !! /WoRkSpAcE", time()));
    }
}


class Example extends App
{
    function __construct($domserver)
    {
        parent::__construct($domserver, "example", "Example application");
    }
    
    function get_workspace_element()
    {
        return new ExampleElement2($this, "interface");
    }
    
    function get_summary_element()
    {
        return new ExampleElement($this, "summary");
    }
}

$this->_add_app('Example');

?>
