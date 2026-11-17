<?php
// 全局辅助函数（兼容 PHP 7.4+）

function config($key, $default = null)
{
    static $cfg = null;
    if ($cfg === null) {
        $cfg = require BASE_PATH . '/config/config.php';
    }
    return array_key_exists($key, $cfg) ? $cfg[$key] : $default;
}

function e($s)
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

/** 多行文本安全输出 */
function nl($s)
{
    return nl2br(e($s));
}

function url($path = '')
{
    return '/' . ltrim($path, '/');
}

function redirect($path)
{
    header('Location: ' . url($path));
    exit;
}

function back()
{
    $ref = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '/';
    $host = parse_url($ref, PHP_URL_HOST);
    if ($host && $host !== ($_SERVER['HTTP_HOST'] ?? '')) {
        $ref = '/';
    }
    header('Location: ' . $ref);
    exit;
}

function flash($msg = null, $type = 'ok')
{
    if ($msg === null) {
        $f = $_SESSION['flash'] ?? null;
        unset($_SESSION['flash']);
        return $f;
    }
    $_SESSION['flash'] = ['msg' => $msg, 'type' => $type];
}

function input($key, $default = '')
{
    if (isset($_POST[$key])) {
        return is_string($_POST[$key]) ? trim($_POST[$key]) : $_POST[$key];
    }
    if (isset($_GET[$key])) {
        return is_string($_GET[$key]) ? trim($_GET[$key]) : $_GET[$key];
    }
    return $default;
}

function json_out($data, $code = 200)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_body()
{
    $raw = file_get_contents('php://input');
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

function csrf_token()
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}

function csrf_field()
{
    return '<input type="hidden" name="_csrf" value="' . e(csrf_token()) . '">';
}

function bloom_levels()
{
    return [1 => '记忆', 2 => '理解', 3 => '应用', 4 => '分析', 5 => '评价', 6 => '创造'];
}

function bloom_name($n)
{
    $b = bloom_levels();
    return $b[(int)$n] ?? '?';
}

function phases()
{
    return [
        'B' => ['导入 Bridge-in', '引起兴趣、建立与旧知/现实的联系'],
        'O' => ['目标 Objective', '向学生说明本节学完能做到什么'],
        'P1' => ['前测 Pre-assessment', '摸清学生已有基础'],
        'P2' => ['参与式学习 Participatory', '讲授+学生主动参与的活动'],
        'P3' => ['后测 Post-assessment', '检验目标是否达成'],
        'S' => ['总结 Summary', '归纳要点、布置后续任务'],
    ];
}

function phase_name($p)
{
    $ph = phases();
    return isset($ph[$p]) ? $ph[$p][0] : $p;
}

function qtypes()
{
    return ['单选', '多选', '判断', '填空', '简答', '计算', '论述', '案例分析', '设计'];
}

function setting($k, $default = '')
{
    static $cache = [];
    if (!array_key_exists($k, $cache)) {
        $row = \App\Core\DB::one('SELECT v FROM settings WHERE k=?', [$k]);
        $cache[$k] = $row ? $row['v'] : null;
    }
    return $cache[$k] === null ? $default : $cache[$k];
}

function set_setting($k, $v)
{
    \App\Core\DB::exec('REPLACE INTO settings (k, v) VALUES (?, ?)', [$k, $v]);
}

/** 文本归一化：用于核对 AI 引用的原文是否真实存在 */
function norm_text($s)
{
    $s = preg_replace('/[\s\x{3000}]+/u', '', (string)$s);
    $s = str_replace(['，', '。', '；', '：', '、', '“', '”', '（', '）', ',', '.', ';', ':', '"', '(', ')'], '', $s);
    return mb_strtolower($s, 'UTF-8');
}

function evidence_in($quote, $source)
{
    $q = norm_text($quote);
    if (mb_strlen($q, 'UTF-8') < 4) {
        return false;
    }
    return mb_strpos(norm_text($source), $q, 0, 'UTF-8') !== false;
}

/** 长时间的 AI 请求前释放会话锁，避免同一用户的其他页面被卡住 */
function release_session()
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
}

/** 线性图标（Tabler Icons 精简集，见 public/assets/icons.svg） */
function ico($name, $cls = '')
{
    return '<svg class="ico' . ($cls ? ' ' . $cls : '') . '" aria-hidden="true"><use href="/assets/icons.svg?v=27#i-' . $name . '"></use></svg>';
}
