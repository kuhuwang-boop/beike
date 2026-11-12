<?php
// 从 config/.env 读取配置（KEY=VALUE 每行一条）
$env = [];
$file = __DIR__ . '/.env';
$lines = is_readable($file) ? file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) : false;
if ($lines === false && is_file($file)) {
    error_log('beike: config/.env 无法读取，请检查文件权限');
}
if (is_array($lines)) {
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
            continue;
        }
        list($k, $v) = explode('=', $line, 2);
        $env[trim($k)] = trim(trim($v), "\"'");
    }
}

return array_merge([
    'APP_NAME' => '备课工作台',
    'APP_DEBUG' => '0',
    'DB_HOST' => '127.0.0.1',
    'DB_PORT' => '3306',
    'DB_NAME' => 'beike',
    'DB_USER' => 'beike',
    'DB_PASS' => '',
    'DEEPSEEK_API_KEY' => '',
    'DEEPSEEK_BASE' => 'https://api.deepseek.com',
], $env);
