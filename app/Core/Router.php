<?php
namespace App\Core;

class Router
{
    private $routes = [];

    public function get($pattern, $handler, $opts = [])
    {
        $this->add('GET', $pattern, $handler, $opts);
    }

    public function post($pattern, $handler, $opts = [])
    {
        $this->add('POST', $pattern, $handler, $opts);
    }

    public function add($method, $pattern, $handler, $opts = [])
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[0-9]+)', rtrim($pattern, '/')) . '/?$#';
        $this->routes[] = [$method, $regex, $handler, $opts];
    }

    public function dispatch($method, $path)
    {
        $path = '/' . trim(parse_url($path, PHP_URL_PATH), '/');
        foreach ($this->routes as $r) {
            list($m, $regex, $handler, $opts) = $r;
            if ($m !== $method || !preg_match($regex, $path, $mm)) {
                continue;
            }
            $params = [];
            foreach ($mm as $k => $v) {
                if (!is_int($k)) {
                    $params[] = (int)$v;
                }
            }
            if (empty($opts['guest']) && !Auth::check()) {
                if (!empty($opts['json'])) {
                    json_out(['error' => '登录已过期，请刷新页面重新登录'], 401);
                }
                redirect('login');
            }
            if (!empty($opts['admin']) && !Auth::isAdmin()) {
                http_response_code(403);
                exit('无权限');
            }
            if ($method === 'POST') {
                $tok = $_POST['_csrf'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
                if (!hash_equals(csrf_token(), (string)$tok)) {
                    if (!empty($opts['json'])) {
                        json_out(['error' => '页面已过期，请刷新后重试'], 419);
                    }
                    http_response_code(419);
                    exit('页面已过期，请返回刷新后重试');
                }
            }
            list($cls, $fn) = $handler;
            $ctrl = new $cls();
            return call_user_func_array([$ctrl, $fn], $params);
        }
        http_response_code(404);
        View::render('layout/404', [], 'layout/main');
    }
}
