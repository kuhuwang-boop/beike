<?php
namespace App\Core;

class View
{
    public static function render($tpl, array $data = [], $layout = 'layout/main')
    {
        $content = self::fetch($tpl, $data);
        if ($layout) {
            $data['content'] = $content;
            echo self::fetch($layout, $data);
        } else {
            echo $content;
        }
    }

    public static function fetch($tpl, array $data = [])
    {
        extract($data, EXTR_SKIP);
        ob_start();
        require BASE_PATH . '/app/Views/' . $tpl . '.php';
        return ob_get_clean();
    }
}
