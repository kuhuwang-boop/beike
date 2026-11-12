<?php
namespace App\Services;

use App\Core\DB;

/** 用户管理：状态、AI 用量额度、统计 */
class Users
{
    const STATUS = ['active' => '正常', 'pending' => '待审核', 'disabled' => '已停用'];

    public static function monthStart()
    {
        return date('Y-m-01 00:00:00');
    }

    /** 本月成功的 AI 调用次数 */
    public static function monthCalls($uid)
    {
        return (int)DB::val('SELECT COUNT(*) FROM ai_logs WHERE user_id=? AND ok=1 AND created_at>=?', [$uid, self::monthStart()]);
    }

    /** 每月 AI 调用上限：0 表示不限。个人设置优先，否则用系统默认；管理员不限 */
    public static function quotaOf($uid)
    {
        $u = DB::one('SELECT role, ai_quota FROM users WHERE id=?', [$uid]);
        if (!$u || $u['role'] === 'admin') {
            return 0;
        }
        if ($u['ai_quota'] !== null) {
            return max(0, (int)$u['ai_quota']);
        }
        return max(0, (int)setting('ai_quota_default', '0'));
    }

    /** 超出额度时返回给老师看的提示，否则返回空串 */
    public static function quotaError($uid)
    {
        static $checked = [];
        if (!$uid) {
            return '';
        }
        if (!isset($checked[$uid])) {
            $q = self::quotaOf($uid);
            $checked[$uid] = $q > 0 ? [$q, self::monthCalls($uid)] : [0, 0];
        }
        list($q, $used) = $checked[$uid];
        if ($q > 0 && $used >= $q) {
            return "本月的 AI 使用次数已用完（{$used}/{$q} 次），下个月 1 日自动恢复。急需使用请联系管理员提高额度。";
        }
        if ($q > 0) {
            $checked[$uid][1]++;
        }
        return '';
    }

    /** 列表：带课件数、资料数、本月用量 */
    public static function search($q, $role, $status, $page, $per = 30)
    {
        $where = ['1=1'];
        $args = [];
        if ($q !== '') {
            $where[] = '(u.name LIKE ? OR u.email LIKE ? OR u.note LIKE ?)';
            $like = '%' . addcslashes($q, '%_\\') . '%';
            array_push($args, $like, $like, $like);
        }
        if (isset(['admin' => 1, 'teacher' => 1][$role])) {
            $where[] = 'u.role=?';
            $args[] = $role;
        }
        if (isset(self::STATUS[$status])) {
            $where[] = 'u.status=?';
            $args[] = $status;
        }
        $w = implode(' AND ', $where);
        $total = (int)DB::val("SELECT COUNT(*) FROM users u WHERE $w", $args);
        $page = max(1, min((int)$page, max(1, (int)ceil($total / $per))));
        $ms = self::monthStart();
        $rows = DB::all("SELECT u.id, u.name, u.email, u.role, u.status, u.note, u.ai_quota, u.must_change, u.last_login_at, u.login_count, u.created_at,
            (SELECT COUNT(*) FROM courses c WHERE c.user_id=u.id) courses,
            (SELECT COUNT(*) FROM decks d JOIN lessons l ON l.id=d.lesson_id JOIN courses c ON c.id=l.course_id WHERE c.user_id=u.id AND d.slides IS NOT NULL AND d.slides<>'[]') decks,
            (SELECT COUNT(*) FROM library b WHERE b.user_id=u.id) lib,
            (SELECT COUNT(*) FROM ai_logs a WHERE a.user_id=u.id AND a.ok=1 AND a.created_at>='$ms') calls,
            (SELECT COALESCE(SUM(a.prompt_tokens+a.completion_tokens),0) FROM ai_logs a WHERE a.user_id=u.id AND a.created_at>='$ms') tokens
            FROM users u WHERE $w ORDER BY (u.status='pending') DESC, u.id DESC LIMIT $per OFFSET " . (($page - 1) * $per), $args);
        $def = max(0, (int)setting('ai_quota_default', '0'));
        foreach ($rows as &$r) {
            $r['school'] = (string)(Brand::school($r['id'])['name'] ?? '');
            $r['quota'] = $r['role'] === 'admin' ? 0 : ($r['ai_quota'] !== null ? (int)$r['ai_quota'] : $def);
        }
        return ['rows' => $rows, 'total' => $total, 'page' => $page, 'pages' => max(1, (int)ceil($total / $per))];
    }

    public static function counts()
    {
        $c = ['all' => 0, 'active' => 0, 'pending' => 0, 'disabled' => 0, 'admin' => 0];
        foreach (DB::all('SELECT status, role, COUNT(*) n FROM users GROUP BY status, role') as $r) {
            $c['all'] += $r['n'];
            $c[$r['status']] += $r['n'];
            if ($r['role'] === 'admin') {
                $c['admin'] += $r['n'];
            }
        }
        $c['active_month'] = (int)DB::val('SELECT COUNT(DISTINCT user_id) FROM ai_logs WHERE created_at>=?', [self::monthStart()]);
        $c['calls_month'] = (int)DB::val('SELECT COUNT(*) FROM ai_logs WHERE ok=1 AND created_at>=?', [self::monthStart()]);
        return $c;
    }

    public static function genPassword()
    {
        // 去掉易混淆字符，方便老师抄写
        $chars = 'abcdefghjkmnpqrstuvwxyz23456789';
        $s = '';
        for ($i = 0; $i < 10; $i++) {
            $s .= $chars[random_int(0, strlen($chars) - 1)];
        }
        return $s;
    }

    /** 至少保留一个可用的管理员 */
    public static function isLastAdmin($id)
    {
        $u = DB::one('SELECT role, status FROM users WHERE id=?', [$id]);
        if (!$u || $u['role'] !== 'admin') {
            return false;
        }
        return (int)DB::val("SELECT COUNT(*) FROM users WHERE role='admin' AND status='active' AND id<>?", [$id]) === 0;
    }

    /** 解析批量名单：每行「姓名,邮箱[,学校/备注]」，逗号、空格、Tab 都可以 */
    public static function parseBatch($text)
    {
        $out = [];
        foreach (preg_split('/\r?\n/', (string)$text) as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            if (!preg_match('/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/', $line, $m)) {
                $out[] = ['line' => $line, 'error' => '没有找到邮箱'];
                continue;
            }
            $email = strtolower($m[0]);
            $rest = array_values(array_filter(array_map('trim', preg_split('/[,，;；\t ]+/u', str_replace($m[0], ' ', $line))), 'strlen'));
            $name = $rest[0] ?? '';
            if ($name === '') {
                $name = strstr($email, '@', true);
            }
            $out[] = ['line' => $line, 'name' => mb_substr($name, 0, 50), 'email' => $email, 'note' => mb_substr(implode(' ', array_slice($rest, 1)), 0, 200)];
        }
        return $out;
    }
}
