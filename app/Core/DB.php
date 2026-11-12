<?php
namespace App\Core;

use PDO;

class DB
{
    /** @var PDO|null */
    private static $pdo = null;

    public static function pdo()
    {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                config('DB_HOST', '127.0.0.1'),
                config('DB_PORT', '3306'),
                config('DB_NAME', 'beike')
            );
            self::$pdo = new PDO($dsn, config('DB_USER'), config('DB_PASS'), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            // 让数据库的 NOW() 与 PHP 的 date() 使用同一时区
            self::$pdo->exec("SET time_zone = '" . date('P') . "'");
        }
        return self::$pdo;
    }

    public static function query($sql, array $params = [])
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        return $st;
    }

    public static function all($sql, array $params = [])
    {
        return self::query($sql, $params)->fetchAll();
    }

    public static function one($sql, array $params = [])
    {
        $r = self::query($sql, $params)->fetch();
        return $r === false ? null : $r;
    }

    public static function val($sql, array $params = [])
    {
        $r = self::query($sql, $params)->fetchColumn();
        return $r === false ? null : $r;
    }

    public static function exec($sql, array $params = [])
    {
        return self::query($sql, $params)->rowCount();
    }

    public static function insert($table, array $data)
    {
        $cols = array_keys($data);
        $sql = sprintf(
            'INSERT INTO `%s` (`%s`) VALUES (%s)',
            $table,
            implode('`,`', $cols),
            implode(',', array_fill(0, count($cols), '?'))
        );
        self::query($sql, array_values($data));
        return (int)self::pdo()->lastInsertId();
    }

    public static function update($table, array $data, $where, array $whereParams = [])
    {
        $sets = [];
        foreach (array_keys($data) as $c) {
            $sets[] = "`$c`=?";
        }
        $sql = sprintf('UPDATE `%s` SET %s WHERE %s', $table, implode(',', $sets), $where);
        return self::exec($sql, array_merge(array_values($data), $whereParams));
    }

    public static function tx(callable $fn)
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $r = $fn();
            $pdo->commit();
            return $r;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
}
