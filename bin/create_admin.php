<?php
// 用法: php bin/create_admin.php 邮箱 密码 [姓名]
// 若邮箱已存在则重置其密码并设为管理员
if (PHP_SAPI !== 'cli') {
    exit;
}
define('BASE_PATH', dirname(__DIR__));
spl_autoload_register(function ($cls) {
    $f = BASE_PATH . '/app/' . str_replace('\\', '/', substr($cls, 4)) . '.php';
    if (is_file($f)) {
        require $f;
    }
});
require BASE_PATH . '/app/Core/helpers.php';
date_default_timezone_set('Asia/Shanghai');

use App\Core\DB;

list(, $email, $pw) = $argv + [null, null, null];
$name = $argv[3] ?? '管理员';
if (!$email || !$pw) {
    fwrite(STDERR, "用法: php bin/create_admin.php 邮箱 密码 [姓名]\n");
    exit(1);
}
$hash = password_hash($pw, PASSWORD_DEFAULT);
if (DB::val('SELECT id FROM users WHERE email=?', [$email])) {
    DB::exec("UPDATE users SET password_hash=?, role='admin' WHERE email=?", [$hash, $email]);
    echo "已重置管理员 $email 的密码\n";
} else {
    DB::insert('users', ['name' => $name, 'email' => $email, 'password_hash' => $hash, 'role' => 'admin']);
    echo "已创建管理员 $email\n";
}
