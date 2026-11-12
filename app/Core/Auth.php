<?php
namespace App\Core;

class Auth
{
    private static $user = false;
    /** 最近一次登录失败的原因：wrong / disabled / pending */
    public static $reason = '';

    public static function user()
    {
        if (self::$user === false) {
            self::$user = null;
            if (!empty($_SESSION['uid'])) {
                self::$user = DB::one('SELECT id, name, email, role, status, must_change FROM users WHERE id=?', [$_SESSION['uid']]) ?: null;
                if (self::$user && self::$user['status'] !== 'active') {
                    // 账号被停用后，已登录的会话立即失效
                    self::$user = null;
                    unset($_SESSION['uid']);
                }
                $_SESSION['is_admin'] = self::$user && self::$user['role'] === 'admin';
            }
        }
        return self::$user;
    }

    public static function id()
    {
        $u = self::user();
        return $u ? (int)$u['id'] : 0;
    }

    public static function check()
    {
        return self::user() !== null;
    }

    public static function isAdmin()
    {
        $u = self::user();
        return $u && $u['role'] === 'admin';
    }

    public static function attempt($email, $password)
    {
        self::$reason = 'wrong';
        $u = DB::one('SELECT * FROM users WHERE email=?', [$email]);
        if (!$u || !password_verify($password, $u['password_hash'])) {
            return false;
        }
        if ($u['status'] !== 'active') {
            self::$reason = $u['status'];
            return false;
        }
        DB::exec('UPDATE users SET last_login_at=NOW(), login_count=login_count+1 WHERE id=?', [$u['id']]);
        session_regenerate_id(true);
        $_SESSION['uid'] = (int)$u['id'];
        self::$user = false;
        return true;
    }

    public static function logout()
    {
        $_SESSION = [];
        session_destroy();
    }

    /** 取当前用户拥有的课程，否则 404 */
    public static function course($id)
    {
        $c = DB::one('SELECT * FROM courses WHERE id=? AND user_id=?', [$id, self::id()]);
        if (!$c) {
            http_response_code(404);
            exit('课程不存在或无权访问');
        }
        return $c;
    }

    public static function lesson($id)
    {
        $l = DB::one('SELECT l.* FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=? AND c.user_id=?', [$id, self::id()]);
        if (!$l) {
            http_response_code(404);
            exit('课次不存在或无权访问');
        }
        return $l;
    }

    public static function paper($id)
    {
        $p = DB::one('SELECT p.* FROM papers p JOIN courses c ON c.id=p.course_id WHERE p.id=? AND c.user_id=?', [$id, self::id()]);
        if (!$p) {
            http_response_code(404);
            exit('试卷不存在或无权访问');
        }
        return $p;
    }
}
