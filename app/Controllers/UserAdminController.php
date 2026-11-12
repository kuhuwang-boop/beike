<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Core\View;
use App\Services\Brand;
use App\Services\Users;

/** 管理员：用户管理 */
class UserAdminController
{
    /** 回到列表时保留筛选条件 */
    private static function back($id = 0)
    {
        $to = (string)input('back');
        if ($to !== '' && preg_match('#^admin/users(/\d+)?(\?[\w=&%.\-+]*)?$#', $to)) {
            redirect($to);
        }
        redirect($id ? "admin/users/$id" : 'admin/users');
    }

    public function index()
    {
        $q = mb_substr(trim((string)($_GET['q'] ?? '')), 0, 60);
        $role = (string)($_GET['role'] ?? '');
        $status = (string)($_GET['status'] ?? '');
        $res = Users::search($q, $role, $status, (int)($_GET['page'] ?? 1));
        View::render('admin/users', $res + [
            'title' => '用户管理', 'q' => $q, 'role' => $role, 'status' => $status,
            'counts' => Users::counts(), 'meId' => Auth::id(),
            'allowReg' => setting('allow_register', '0'), 'review' => setting('register_review', '0'),
            'invite' => setting('invite_code', ''), 'quotaDefault' => (int)setting('ai_quota_default', '0'),
            'created' => $_SESSION['created_users'] ?? null,
            'qs' => http_build_query(array_filter(['q' => $q, 'role' => $role, 'status' => $status, 'page' => $res['page'] > 1 ? $res['page'] : null])),
        ]);
        unset($_SESSION['created_users']);
    }

    public function show($id)
    {
        $u = DB::one('SELECT * FROM users WHERE id=?', [$id]);
        if (!$u) {
            flash('用户不存在', 'err');
            redirect('admin/users');
        }
        $courses = DB::all("SELECT c.id, c.name, c.semester, c.created_at,
            (SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id) lessons,
            (SELECT COUNT(*) FROM decks d JOIN lessons l ON l.id=d.lesson_id WHERE l.course_id=c.id AND d.slides IS NOT NULL AND d.slides<>'[]') decks
            FROM courses c WHERE c.user_id=? ORDER BY c.id DESC LIMIT 50", [$id]);
        $months = DB::all("SELECT DATE_FORMAT(created_at,'%Y-%m') m, COUNT(*) n, SUM(ok) okn, SUM(prompt_tokens+completion_tokens) tk
            FROM ai_logs WHERE user_id=? AND created_at>=DATE_SUB(?, INTERVAL 5 MONTH) GROUP BY m ORDER BY m DESC", [$id, Users::monthStart()]);
        $recent = DB::all('SELECT action, ok, prompt_tokens+completion_tokens tk, ms, created_at FROM ai_logs WHERE user_id=? ORDER BY id DESC LIMIT 15', [$id]);
        View::render('admin/user', [
            'title' => '用户详情 · ' . $u['name'], 'u' => $u, 'courses' => $courses, 'months' => $months, 'recent' => $recent,
            'school' => Brand::school($id), 'calls' => Users::monthCalls($id), 'quota' => Users::quotaOf($id),
            'quotaDefault' => (int)setting('ai_quota_default', '0'), 'meId' => Auth::id(),
            'stats' => [
                'lib' => (int)DB::val('SELECT COUNT(*) FROM library WHERE user_id=?', [$id]),
                'skills' => (int)DB::val('SELECT COUNT(*) FROM skills WHERE user_id=?', [$id]),
                'tpl' => (int)DB::val('SELECT COUNT(*) FROM templates WHERE user_id=?', [$id]),
            ],
            'created' => $_SESSION['created_users'] ?? null,
        ]);
        unset($_SESSION['created_users']);
    }

    public function create()
    {
        $email = strtolower(input('email'));
        $name = mb_substr(input('name'), 0, 50);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $name === '') {
            flash('请填写姓名和有效邮箱', 'err');
            self::back();
        }
        if (DB::val('SELECT id FROM users WHERE email=?', [$email])) {
            flash('该邮箱已存在', 'err');
            self::back();
        }
        $pw = input('password');
        $gen = $pw === '';
        if ($gen) {
            $pw = Users::genPassword();
        } elseif (mb_strlen($pw) < 8) {
            flash('初始密码至少 8 位（留空则自动生成）', 'err');
            self::back();
        }
        DB::insert('users', ['name' => $name, 'email' => $email, 'password_hash' => password_hash($pw, PASSWORD_DEFAULT),
            'role' => input('role') === 'admin' ? 'admin' : 'teacher', 'note' => mb_substr(input('note'), 0, 200), 'must_change' => 1]);
        $_SESSION['created_users'] = [['name' => $name, 'email' => $email, 'password' => $pw]];
        flash("账号已创建：{$email}");
        self::back();
    }

    /** 批量添加：每行「姓名,邮箱[,学校/备注]」 */
    public function batch()
    {
        $rows = Users::parseBatch(input('lines'));
        if (!$rows) {
            flash('请粘贴名单，每行一位老师：姓名,邮箱', 'err');
            redirect('admin/users');
        }
        if (count($rows) > 300) {
            flash('一次最多添加 300 位', 'err');
            redirect('admin/users');
        }
        $made = [];
        $skip = [];
        $seen = [];
        foreach ($rows as $r) {
            if (!empty($r['error'])) {
                $skip[] = $r['line'] . '（' . $r['error'] . '）';
                continue;
            }
            if (isset($seen[$r['email']]) || DB::val('SELECT id FROM users WHERE email=?', [$r['email']])) {
                $skip[] = $r['email'] . '（已存在）';
                continue;
            }
            $seen[$r['email']] = 1;
            $pw = Users::genPassword();
            DB::insert('users', ['name' => $r['name'], 'email' => $r['email'], 'password_hash' => password_hash($pw, PASSWORD_DEFAULT),
                'role' => 'teacher', 'note' => $r['note'], 'must_change' => 1]);
            $made[] = ['name' => $r['name'], 'email' => $r['email'], 'password' => $pw];
        }
        $_SESSION['created_users'] = $made;
        $msg = '已添加 ' . count($made) . ' 位老师';
        if ($skip) {
            $msg .= '；跳过 ' . count($skip) . ' 行：' . mb_substr(implode('、', $skip), 0, 300);
        }
        flash($msg, $made ? 'ok' : 'err');
        redirect('admin/users');
    }

    public function update($id)
    {
        $u = DB::one('SELECT * FROM users WHERE id=?', [$id]);
        if (!$u) {
            redirect('admin/users');
        }
        $email = strtolower(input('email')) ?: $u['email'];
        if ($email !== $u['email'] && (!filter_var($email, FILTER_VALIDATE_EMAIL) || DB::val('SELECT id FROM users WHERE email=? AND id<>?', [$email, $id]))) {
            flash('邮箱无效或已被使用', 'err');
            self::back($id);
        }
        $role = input('role') === 'admin' ? 'admin' : 'teacher';
        if ($role !== 'admin' && Users::isLastAdmin($id)) {
            flash('这是最后一个管理员，不能改成教师', 'err');
            self::back($id);
        }
        if ((int)$id === Auth::id()) {
            $role = 'admin';
        }
        $quota = trim((string)input('ai_quota'));
        DB::update('users', [
            'name' => mb_substr(input('name'), 0, 50) ?: $u['name'], 'email' => $email, 'role' => $role,
            'note' => mb_substr(input('note'), 0, 200),
            'ai_quota' => $quota === '' ? null : max(0, min(100000, (int)$quota)),
        ], 'id=?', [$id]);
        flash('已保存');
        self::back($id);
    }

    public function setStatus($id)
    {
        $st = input('status');
        if (!isset(Users::STATUS[$st]) || !DB::val('SELECT id FROM users WHERE id=?', [$id])) {
            self::back($id);
        }
        if ($st !== 'active' && ((int)$id === Auth::id() || Users::isLastAdmin($id))) {
            flash((int)$id === Auth::id() ? '不能停用自己的账号' : '不能停用最后一个管理员', 'err');
            self::back($id);
        }
        DB::update('users', ['status' => $st], 'id=?', [$id]);
        flash(['active' => '账号已启用', 'disabled' => '账号已停用：对方将无法登录，数据保留', 'pending' => '已设为待审核'][$st]);
        self::back($id);
    }

    public function bulk()
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', (array)($_POST['ids'] ?? [])))));
        $act = input('act');
        if (!$ids) {
            flash('请先勾选用户', 'err');
            self::back();
        }
        $ids = array_values(array_diff($ids, [Auth::id()]));
        $in = implode(',', $ids ?: [0]);
        $n = 0;
        if ($act === 'approve' || $act === 'enable') {
            $n = DB::exec("UPDATE users SET status='active' WHERE id IN ($in)" . ($act === 'approve' ? " AND status='pending'" : ''));
        } elseif ($act === 'disable') {
            $n = DB::exec("UPDATE users SET status='disabled' WHERE id IN ($in) AND role<>'admin'");
        } elseif ($act === 'quota') {
            $q = trim((string)input('quota'));
            $n = DB::exec("UPDATE users SET ai_quota=" . ($q === '' ? 'NULL' : max(0, min(100000, (int)$q))) . " WHERE id IN ($in)");
        }
        $n = is_object($n) ? $n->rowCount() : (int)$n;
        flash("已处理 {$n} 个账号" . ($act === 'disable' ? '（管理员账号不会被批量停用）' : ''));
        self::back();
    }

    public function reset($id)
    {
        $u = DB::one('SELECT name, email FROM users WHERE id=?', [$id]);
        if (!$u) {
            self::back();
        }
        $pw = Users::genPassword();
        DB::update('users', ['password_hash' => password_hash($pw, PASSWORD_DEFAULT), 'must_change' => (int)$id === Auth::id() ? 0 : 1], 'id=?', [$id]);
        $_SESSION['created_users'] = [['name' => $u['name'], 'email' => $u['email'], 'password' => $pw, 'reset' => 1]];
        flash('密码已重置');
        self::back($id);
    }

    public function delete($id)
    {
        if ((int)$id === Auth::id() || Users::isLastAdmin($id)) {
            flash('不能删除自己或最后一个管理员', 'err');
            self::back($id);
        }
        $name = (string)DB::val('SELECT name FROM users WHERE id=?', [$id]);
        DB::exec('DELETE FROM users WHERE id=?', [$id]);
        foreach (['school_brand_', 'brand_prefs_', 'style_profile_', 'default_skills_', 'quick_cmds_'] as $k) {
            DB::exec('DELETE FROM settings WHERE k=?', [$k . (int)$id]);
        }
        foreach (['library', 'skills', 'templates'] as $t) {
            try {
                DB::exec("DELETE FROM $t WHERE user_id=?", [$id]);
            } catch (\Throwable $e) {
            }
        }
        flash("已删除 {$name} 的账号及其全部课程和资料");
        redirect('admin/users');
    }

    public function saveRegister()
    {
        set_setting('allow_register', input('allow_register') === '1' ? '1' : '0');
        set_setting('register_review', input('register_review') === '1' ? '1' : '0');
        set_setting('invite_code', mb_substr(input('invite_code'), 0, 40));
        $q = trim((string)input('ai_quota_default'));
        set_setting('ai_quota_default', (string)max(0, min(100000, (int)$q)));
        flash('注册与额度设置已保存');
        redirect('admin/users');
    }

    /** 导出用户名单（Excel 可直接打开） */
    public function export()
    {
        $res = Users::search('', '', '', 1, 100000);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="users-' . date('Ymd') . '.csv"');
        $o = fopen('php://output', 'w');
        fwrite($o, "\xEF\xBB\xBF");
        fputcsv($o, ['ID', '姓名', '邮箱', '角色', '状态', '学校/备注', '课程数', '课件数', '资料数', '本月AI次数', '每月额度', '登录次数', '最近登录', '注册时间']);
        foreach ($res['rows'] as $r) {
            fputcsv($o, [$r['id'], $r['name'], $r['email'], $r['role'] === 'admin' ? '管理员' : '教师', Users::STATUS[$r['status']] ?? $r['status'],
                trim($r['school'] . ' ' . $r['note']), $r['courses'], $r['decks'], $r['lib'], $r['calls'], $r['quota'] ?: '不限', $r['login_count'],
                $r['last_login_at'] ?: '', $r['created_at']]);
        }
        fclose($o);
        exit;
    }
}
