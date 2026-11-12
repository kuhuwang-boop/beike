<?php
// 数据库升级：创建缺失的表，并为已有的表补齐新版本增加的字段。可重复执行。
// 用法: php bin/migrate.php
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

$sql = file_get_contents(BASE_PATH . '/database/schema.sql');
$sql = preg_replace('/^\s*--.*$/m', '', $sql);
$pdo = DB::pdo();
$db = DB::val('SELECT DATABASE()');
$added = 0;
$created = 0;

foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
    if (!preg_match('/^CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?\s*\((.*)\)\s*ENGINE/si', $stmt, $m)) {
        if ($stmt !== '' && stripos($stmt, 'SET NAMES') === false) {
            $pdo->exec($stmt);
        }
        continue;
    }
    $table = $m[1];
    $exists = DB::val('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [$db, $table]);
    if (!$exists) {
        $pdo->exec($stmt);
        $created++;
        echo "创建表 $table\n";
        continue;
    }
    $cols = array_map('strtolower', array_column(DB::all('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [$db, $table]), 'COLUMN_NAME'));
    $prev = null;
    foreach (preg_split('/,\s*\n/', $m[2]) as $line) {
        $line = trim($line);
        if (!preg_match('/^`?(\w+)`?\s+(INT|TINYINT|DECIMAL|VARCHAR|TEXT|MEDIUMTEXT|DATETIME|DATE|ENUM)/i', $line, $c)) {
            continue; // 索引、外键等约束行
        }
        $col = strtolower($c[1]);
        if (!in_array($col, $cols, true)) {
            $def = preg_replace('/\s+PRIMARY KEY|\s+UNIQUE|\s+AUTO_INCREMENT/i', '', $line);
            $pdo->exec("ALTER TABLE `$table` ADD COLUMN $def" . ($prev ? " AFTER `$prev`" : ''));
            $added++;
            echo "表 $table 增加字段 $col\n";
        }
        $prev = $c[1];
    }
}
$seeded = \App\Services\Skills::seed();
if ($seeded) {
    echo "教学技能库新增 {$seeded} 项\n";
}
echo "数据库检查完成：新建表 {$created} 个，补充字段 {$added} 个\n";
