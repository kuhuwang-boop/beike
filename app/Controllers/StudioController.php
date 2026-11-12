<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Core\View;
use App\Services\Agents;
use App\Services\DeepSeek;
use App\Services\Images;
use App\Controllers\SlideController;

/** 课件工作室：上传资料 + 与 AI 课件团队对话 + 实时预览 */
class StudioController
{
    private function defaultCourse()
    {
        $c = DB::one("SELECT * FROM courses WHERE user_id=? AND name='我的课件' ORDER BY id LIMIT 1", [Auth::id()]);
        if ($c) {
            return $c;
        }
        $id = DB::insert('courses', ['user_id' => Auth::id(), 'name' => '我的课件', 'semester' => '', 'lesson_minutes' => 45]);
        return Auth::course($id);
    }

    public function home()
    {
        if (!Auth::check()) {
            (new SiteController())->about();
            return;
        }
        $uid = Auth::id();
        $items = DB::all(
            'SELECT l.id, l.title, l.duration_min, l.updated_at, c.name cname, d.slides, d.theme, d.updated_at dupd,
              (SELECT COUNT(*) FROM materials m WHERE m.lesson_id=l.id) mats
             FROM lessons l JOIN courses c ON c.id=l.course_id
             LEFT JOIN decks d ON d.lesson_id=l.id
             WHERE c.user_id=? AND (d.id IS NOT NULL OR EXISTS(SELECT 1 FROM chat_messages cm WHERE cm.lesson_id=l.id) OR EXISTS(SELECT 1 FROM materials m2 WHERE m2.lesson_id=l.id))
             ORDER BY GREATEST(l.updated_at, COALESCE(d.updated_at, l.updated_at)) DESC LIMIT 60',
            [$uid]
        );
        foreach ($items as &$it) {
            $s = $it['slides'] ? (json_decode($it['slides'], true) ?: []) : [];
            $it['pages'] = count($s);
            $it['first'] = $s[0] ?? null;
            unset($it['slides']);
        }
        unset($it);
        $courses = DB::all('SELECT id, name, lesson_minutes FROM courses WHERE user_id=? ORDER BY id DESC', [$uid]);
        View::render('studio/home', ['items' => $items, 'courses' => $courses, 'team' => Agents::team(), 'aiReady' => DeepSeek::configured(), 'templates' => \App\Services\Templates::forUser($uid), 'brand' => \App\Services\Brand::forUser($uid), 'types' => \App\Services\Style::TYPES, 'libCount' => (int)DB::val('SELECT COUNT(*) FROM library WHERE user_id=?', [$uid]), 'hasStyle' => \App\Services\Style::text($uid) !== '']);
    }

    public function create()
    {
        $isJson = strpos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== false;
        $b = $isJson ? json_body() : $_POST;
        $title = trim((string)($b['title'] ?? ''));
        if ($title === '') {
            if ($isJson) {
                json_out(['error' => '请填写课题'], 400);
            }
            flash('请填写课题', 'err');
            redirect('');
        }
        $cid = (int)($b['course_id'] ?? 0);
        $course = $cid ? Auth::course($cid) : $this->defaultCourse();
        $minutes = max(10, min(300, (int)($b['minutes'] ?? 45)));
        $seq = (int)DB::val('SELECT COALESCE(MAX(seq),0)+1 FROM lessons WHERE course_id=?', [$course['id']]);
        $lid = DB::insert('lessons', ['course_id' => $course['id'], 'seq' => $seq, 'title' => mb_substr($title, 0, 200), 'duration_min' => $minutes]);
        // 新课件的样式：首页选的，或老师设置的默认样式（学校模板）
        $theme = (string)($b['theme'] ?? '');
        if ($theme === '') {
            $theme = \App\Services\Brand::prefs(Auth::id())['default_theme'];
        }
        if ($theme !== 'blue' && \App\Services\Templates::validTheme(Auth::id(), $theme)) {
            DB::insert('decks', ['lesson_id' => $lid, 'theme' => $theme, 'slides' => '[]']);
        }
        // 因人而异：课型、老师的默认技能、从资料库选用的资料
        $uid = Auth::id();
        $type = (string)($b['lesson_type'] ?? '');
        $meta = ['skills_text' => implode(',', \App\Services\Skills::filterIds($uid, \App\Services\Style::defaults($uid)))];
        if (isset(\App\Services\Style::TYPES[$type])) {
            $meta['lesson_type'] = $type;
        }
        Agents::setMeta($lid, $meta);
        \App\Services\Library::attach($uid, $lid, (array)($b['library'] ?? []));
        $aud = trim((string)($b['audience'] ?? ''));
        if ($aud !== '' && (string)$course['audience'] === '') {
            DB::update('courses', ['audience' => mb_substr($aud, 0, 120)], 'id=?', [$course['id']]);
        }
        if ($isJson) {
            json_out(['id' => $lid]);
        }
        redirect("studio/$lid");
    }

    public function clearChat($id)
    {
        Auth::lesson($id);
        DB::exec('DELETE FROM chat_messages WHERE lesson_id=?', [$id]);
        json_out(['ok' => true]);
    }

    public function material($id, $mid)
    {
        Auth::lesson($id);
        $m = DB::one('SELECT filename, content FROM materials WHERE id=? AND lesson_id=?', [$mid, $id]);
        if (!$m) {
            json_out(['error' => '资料不存在'], 404);
        }
        json_out($m);
    }

    public function updateMaterial($id, $mid)
    {
        Auth::lesson($id);
        $b = json_body();
        $f = [];
        if (isset($b['filename']) && trim($b['filename']) !== '') {
            $f['filename'] = mb_substr(trim($b['filename']), 0, 200);
        }
        if (isset($b['content'])) {
            $f['content'] = mb_substr((string)$b['content'], 0, 200000);
        }
        if ($f) {
            DB::update('materials', $f, 'id=? AND lesson_id=?', [$mid, $id]);
        }
        json_out(['ok' => true]);
    }

    /** 粘贴文字作为资料 */
    /** 已有课次进入工作室 */
    public function show($id)
    {
        $lesson = Auth::lesson($id);
        $course = Auth::course($lesson['course_id']);
        $msgs = DB::all('SELECT id, role, agent, content, created_at FROM chat_messages WHERE lesson_id=? ORDER BY id', [$id]);
        View::render('studio/show', [
            'lesson' => $lesson, 'course' => $course, 'msgs' => $msgs,
            'team' => Agents::team(true), 'state' => $this->stateData($lesson), 'aiReady' => DeepSeek::configured(),
            'title' => $lesson['title'],
        ], 'layout/studio');
    }

    private function stateData($lesson)
    {
        $deck = DB::one('SELECT theme, slides FROM decks WHERE lesson_id=?', [$lesson['id']]);
        $slides = $deck ? (json_decode($deck['slides'], true) ?: []) : [];
        $meta = DB::one('SELECT * FROM lesson_meta WHERE lesson_id=?', [$lesson['id']]);
        return [
            'slides' => $slides,
            'theme' => $deck['theme'] ?? 'blue',
            'health' => Agents::health($slides, (int)$lesson['duration_min']),
            'materials' => DB::all('SELECT id, filename, CHAR_LENGTH(content) chars FROM materials WHERE lesson_id=? ORDER BY id', [$lesson['id']]),
            'versions' => (int)DB::val('SELECT COUNT(*) FROM deck_versions WHERE lesson_id=?', [$lesson['id']]),
            'objectives' => $meta['objectives_text'] ?? '',
            'improvements' => $meta ? (json_decode((string)$meta['improve_report'], true) ?: []) : [],
            'hasPlan' => (int)DB::val('SELECT COUNT(*) FROM lesson_segments WHERE lesson_id=?', [$lesson['id']]) > 0,
            'tasks' => $this->taskList($lesson['id']),
            'board' => DB::val('SELECT board_text FROM lesson_meta WHERE lesson_id=?', [$lesson['id']]) ?: '',
            'learner' => DB::val('SELECT learner_text FROM lesson_meta WHERE lesson_id=?', [$lesson['id']]) ?: '',
            'content' => DB::val('SELECT content_text FROM lesson_meta WHERE lesson_id=?', [$lesson['id']]) ?: '',
            'skills' => $this->skillState($lesson['id']),
            'templates' => \App\Services\Templates::forUser(Auth::id()),
            'brand' => \App\Services\Brand::forUser(Auth::id()),
            'lessonType' => (string)($meta['lesson_type'] ?? ''),
            'cmds' => \App\Services\Style::cmds(Auth::id()),
            'hasStyle' => \App\Services\Style::text(Auth::id()) !== '',
            'plan' => [
                'key' => $lesson['key_points'], 'diff' => $lesson['difficult_points'], 'mis' => $lesson['misconceptions'],
                'ideo' => $lesson['ideology'], 'hw' => $lesson['homework'],
                'segs' => \App\Services\Repo::segments($lesson['id']),
            ],
        ];
    }

    public function state($id)
    {
        Auth::lesson($id);
        json_out($this->stateData(DB::one('SELECT * FROM lessons WHERE id=?', [$id])));
    }

    private function say($lessonId, $role, $agent, $content)
    {
        DB::insert('chat_messages', ['lesson_id' => $lessonId, 'role' => $role, 'agent' => $agent, 'content' => $content]);
    }

    public function addMaterial($id)
    {
        Auth::lesson($id);
        $b = json_body();
        $name = mb_substr(trim((string)($b['filename'] ?? '资料')), 0, 200);
        $text = trim((string)($b['content'] ?? ''));
        if ($text === '') {
            json_out(['error' => "没有从「{$name}」中读到文字。如果是扫描件或纯图片 PPT，请换成可复制文字的版本。"], 400);
        }
        $text = mb_substr($text, 0, 200000);
        DB::insert('materials', ['lesson_id' => $id, 'filename' => $name, 'content' => $text]);
        if (($b['save'] ?? true) !== false) {
            \App\Services\Library::add(Auth::id(), $name, $text); // 同时存进个人资料库，下次可直接选用
        }
        $this->say($id, 'system', '', "📎 已导入资料「{$name}」（约 " . number_format(mb_strlen($text)) . ' 字）');
        json_out(['ok' => true, 'chars' => mb_strlen($text)]);
    }

    public function deleteMaterial($id, $mid)
    {
        Auth::lesson($id);
        DB::exec('DELETE FROM materials WHERE id=? AND lesson_id=?', [$mid, $id]);
        json_out(['ok' => true]);
    }

    /** 老师发言 → 组长理解并分派，生成一轮任务 */
    public function chat($id)
    {
        release_session();
        $lesson = Auth::lesson($id);
        $course = Auth::course($lesson['course_id']);
        $b = json_body();
        $msg = trim((string)($b['message'] ?? ''));
        if ($msg === '') {
            json_out(['error' => '请输入内容'], 400);
        }
        $focus = (int)($b['focus'] ?? 0);
        $this->say($id, 'user', '', ($focus ? "【第{$focus}页】" : '') . $msg);
        // 没加资料时，告诉老师 AI 会参考资料库里哪几份（每份课件只提示一次）
        if (!DB::val('SELECT id FROM materials WHERE lesson_id=? LIMIT 1', [$id])) {
            $refs = Agents::libraryRefs($id);
            if ($refs && !DB::val("SELECT id FROM chat_messages WHERE lesson_id=? AND role='system' AND content LIKE ? LIMIT 1", [$id, '%参考你资料库里的%'])) {
                $notice = '这节课还没有添加资料，AI 团队会参考你资料库里的：' . implode('、', array_map(function ($r) {
                    return '「' . $r['filename'] . '」';
                }, $refs)) . '。如果不合适，点下方「资料库」手动选择。';
                $this->say($id, 'system', '', $notice);
            }
        }
        $run = (int)DB::val('SELECT COALESCE(MAX(run_id),0)+1 FROM agent_tasks WHERE lesson_id=?', [$id]);
        $t0 = microtime(true);
        $lt = DB::insert('agent_tasks', ['lesson_id' => $id, 'run_id' => $run, 'sort' => 0, 'agent' => 'leader', 'task' => $msg, 'status' => 'running', 'started_at' => date('Y-m-d H:i:s')]);
        Agents::$lessonId = (int)$id;
        $r = Agents::leader($lesson, $course, $msg, $focus);
        $ms = (int)((microtime(true) - $t0) * 1000);
        if (!$r['ok']) {
            DB::update('agent_tasks', ['status' => 'failed', 'result' => json_encode(['message' => $r['error']], JSON_UNESCAPED_UNICODE), 'finished_at' => date('Y-m-d H:i:s'), 'ms' => $ms], 'id=?', [$lt]);
            json_out(['error' => $r['error']], 502);
        }
        $team = Agents::team(true);
        $plan = $r['reply'];
        if ($r['steps']) {
            $plan .= "\n" . implode(' → ', array_map(function ($s) use ($team) {
                return $team[$s['agent']]['name'];
            }, $r['steps']));
        }
        DB::update('agent_tasks', ['status' => 'done', 'result' => json_encode(['message' => $plan], JSON_UNESCAPED_UNICODE), 'finished_at' => date('Y-m-d H:i:s'), 'ms' => $ms,
            'model' => DeepSeek::$last['model'], 'tokens' => DeepSeek::$last['tokens']], 'id=?', [$lt]);
        $this->say($id, 'agent', 'leader', $plan);
        $steps = [];
        foreach ($r['steps'] as $i => $st) {
            $tid = DB::insert('agent_tasks', ['lesson_id' => $id, 'run_id' => $run, 'sort' => $i + 1, 'agent' => $st['agent'], 'task' => $st['task']]);
            $steps[] = ['id' => $tid, 'agent' => $st['agent'], 'task' => $st['task']];
        }
        json_out(['reply' => $r['reply'], 'steps' => $steps, 'run' => $run, 'notice' => $notice ?? '']);
    }

    /** 执行一项任务 */
    public function agent($id)
    {
        release_session();
        $lesson = Auth::lesson($id);
        $course = Auth::course($lesson['course_id']);
        $b = json_body();
        $t = DB::one('SELECT * FROM agent_tasks WHERE id=? AND lesson_id=?', [(int)($b['task_id'] ?? 0), $id]);
        if (!$t) {
            json_out(['error' => '任务不存在'], 404);
        }
        if ($t['status'] === 'cancelled') {
            json_out(['error' => '任务已停止', 'cancelled' => true], 409);
        }
        if ($t['status'] === 'done') {
            json_out(['error' => '任务已完成'], 409);
        }
        DB::update('agent_tasks', ['status' => 'running', 'started_at' => date('Y-m-d H:i:s'), 'result' => null], 'id=?', [$t['id']]);
        $t0 = microtime(true);
        DeepSeek::$last = ['model' => '', 'tokens' => 0];
        $a = $t['agent'];
        $task = (string)$t['task'];
        Agents::$lessonId = (int)$id;
        if ($a === 'analyst') {
            $r = Agents::analyst($lesson, $course, $task);
        } elseif ($a === 'designer') {
            $r = Agents::designer($lesson, $course, $task);
        } elseif ($a === 'expert') {
            $r = Agents::expert($lesson, $course, $task);
        } elseif ($a === 'illustrator') {
            $r = Agents::illustrator($lesson, $course, $task);
        } elseif (in_array($a, ['slides', 'diagram', 'case', 'quiz', 'script', 'reviewer'], true)) {
            $r = Agents::slides($lesson, $course, $task, $a);
        } else {
            $r = ['ok' => false, 'error' => '未知成员'];
        }
        $ms = (int)((microtime(true) - $t0) * 1000);
        $upd = ['finished_at' => date('Y-m-d H:i:s'), 'ms' => $ms, 'model' => mb_substr((string)DeepSeek::$last['model'], 0, 60), 'tokens' => (int)DeepSeek::$last['tokens']];
        if (!$r['ok']) {
            DB::update('agent_tasks', $upd + ['status' => 'failed', 'result' => json_encode(['message' => $r['error']], JSON_UNESCAPED_UNICODE)], 'id=?', [$t['id']]);
            $this->say($id, 'agent', $a, '⚠ 这一步没有完成：' . $r['error']);
            json_out(['error' => $r['error']], 502);
        }
        DB::update('agent_tasks', $upd + ['status' => 'done', 'result' => json_encode(['message' => $r['message'], 'detail' => $r['detail'] ?? ''], JSON_UNESCAPED_UNICODE)], 'id=?', [$t['id']]);
        $this->say($id, 'agent', $a, $r['message']);
        json_out(['message' => $r['message']]);
    }

    /** 重试：把失败 / 已停止的任务重新置为等待 */
    public function retry($id)
    {
        Auth::lesson($id);
        $ids = array_map('intval', (array)(json_body()['ids'] ?? []));
        foreach ($ids as $tid) {
            DB::exec("UPDATE agent_tasks SET status='pending', result=NULL WHERE id=? AND lesson_id=? AND status IN ('failed','cancelled','pending')", [$tid, $id]);
        }
        json_out(['ok' => true]);
    }

    /** 停止本轮剩余任务 */
    public function cancel($id)
    {
        Auth::lesson($id);
        $run = (int)(json_body()['run'] ?? 0);
        $n = DB::exec("UPDATE agent_tasks SET status='cancelled' WHERE lesson_id=? AND run_id=? AND status IN ('pending','failed')", [$id, $run]);
        if ($n) {
            $this->say($id, 'system', '', "⏹ 已停止本轮剩余的 {$n} 项任务");
        }
        json_out(['ok' => true, 'n' => $n]);
    }

    public function tasks($id)
    {
        Auth::lesson($id);
        json_out(['tasks' => $this->taskList($id)]);
    }

    private function taskList($id)
    {
        $runs = array_column(DB::all('SELECT DISTINCT run_id FROM agent_tasks WHERE lesson_id=? ORDER BY run_id DESC LIMIT 8', [$id]), 'run_id');
        if (!$runs) {
            return [];
        }
        $in = implode(',', array_map('intval', $runs));
        // 超过 6 分钟仍在“进行中”的任务视为中断（例如关闭了页面）
        DB::exec("UPDATE agent_tasks SET status='failed', result=? WHERE lesson_id=? AND status='running' AND started_at < DATE_SUB(NOW(), INTERVAL 6 MINUTE)", [json_encode(['message' => '任务中断（可能关闭了页面或网络断开），可以重试'], JSON_UNESCAPED_UNICODE), $id]);
        $rows = DB::all("SELECT id, run_id, sort, agent, task, status, result, model, tokens, ms, started_at, finished_at, created_at FROM agent_tasks WHERE lesson_id=? AND run_id IN ($in) ORDER BY run_id DESC, sort", [$id]);
        foreach ($rows as &$r) {
            $r['result'] = $r['result'] ? (json_decode($r['result'], true) ?: ['message' => $r['result']]) : null;
        }
        return $rows;
    }

    /* ---------------- 单页图片：换图 / 上传 / 去掉 ---------------- */

    private function slideAt($id, $index)
    {
        $slides = Agents::deck($id);
        if ($index < 1 || $index > count($slides)) {
            json_out(['error' => '页码无效'], 400);
        }
        return $slides;
    }

    public function imageReplace($id)
    {
        release_session();
        Auth::lesson($id);
        $b = json_body();
        $i = (int)($b['index'] ?? 0);
        $slides = $this->slideAt($id, $i);
        $s = $slides[$i - 1];
        $q = trim((string)($b['query'] ?? ''));
        $old = $s['image'] ?? null;
        if ($q !== '') {
            $want = ['query_en' => $q, 'query_zh' => $q, 'ai_prompt' => $q . '，写实摄影风格，画面中没有文字', 'page' => 1];
        } elseif ($old) {
            $want = ['query_en' => $old['query_en'], 'query_zh' => $old['query_zh'], 'ai_prompt' => $old['ai_prompt'], 'page' => (int)$old['page'] + 1];
        } else {
            $want = ['query_en' => $s['title'], 'query_zh' => $s['title'], 'ai_prompt' => $s['title'] . '，写实摄影风格，画面中没有文字', 'page' => 1];
        }
        if (!empty($b['ai'])) {
            if (Images::aiProvider() === '') {
                json_out(['error' => 'AI 生成图片需要管理员在「系统设置」中填写 MiniMax 或通义千问的 API Key'], 400);
            }
            $urls = Images::aiBatch([$i => ($q !== '' ? $q : $s['title']) . '，写实摄影风格，画面中没有文字']);
            $im = !empty($urls[$i]) ? Images::download($id, $urls[$i]) : null;
            $found = $im ? [$i => SlideController::cleanImage($im + ['credit' => Images::aiCredit(), 'source' => Images::aiProvider()] + $want)] : [];
        } else {
            list($found) = Agents::fetchImages($id, [$i => $want]);
        }
        if (empty($found[$i])) {
            json_out(['error' => '没有找到合适的图片，可以换个关键词再试，或上传自己的图片'], 404);
        }
        $slides[$i - 1]['image'] = $found[$i];
        $slides[$i - 1]['notes'] = $this->creditNote($slides[$i - 1]['notes'], $found[$i]['credit']);
        Agents::saveDeck($id, $slides, "第{$i}页换图");
        json_out(['ok' => true, 'credit' => $found[$i]['credit']]);
    }

    /** 选图面板：搜索候选图片（只返回缩略图，不下载） */
    public function imageSearch($id)
    {
        Auth::lesson($id);
        release_session();
        $b = json_body();
        $q = trim((string)($b['q'] ?? ''));
        $page = max(1, (int)($b['page'] ?? 1));
        if ($q === '') {
            json_out(['error' => '请输入关键词'], 400);
        }
        $srcs = array_values(array_filter(Images::sources(), function ($x) {
            return $x !== 'ai';
        }));
        $items = [];
        foreach ($srcs as $src) {
            foreach (Images::search($src, $q, $q, $page, 9) as $c) {
                $items[] = $c;
            }
            if (count($items) >= 9) {
                break;
            }
        }
        json_out(['items' => array_slice($items, 0, 12), 'sources' => $srcs, 'ai' => in_array('ai', Images::sources(), true), 'aiName' => Images::aiName()]);
    }

    /** 选图面板：选中一张候选图，下载到本服务器并放到该页 */
    public function imagePick($id)
    {
        Auth::lesson($id);
        release_session();
        $b = json_body();
        $i = (int)($b['index'] ?? 0);
        $slides = $this->slideAt($id, $i);
        $im = Images::download($id, (string)($b['url'] ?? ''));
        if (!$im) {
            json_out(['error' => '这张图片下载失败，请换一张'], 502);
        }
        $q = mb_substr(trim((string)($b['q'] ?? '')), 0, 100);
        $img = SlideController::cleanImage($im + [
            'credit' => mb_substr((string)($b['credit'] ?? ''), 0, 200), 'link' => (string)($b['link'] ?? ''),
            'source' => (string)($b['source'] ?? ''), 'query_en' => $q, 'query_zh' => $q, 'ai_prompt' => '', 'page' => 1,
        ]);
        $slides[$i - 1]['image'] = $img;
        $slides[$i - 1]['notes'] = $this->creditNote($slides[$i - 1]['notes'], $img['credit']);
        Agents::saveDeck($id, $slides, "第{$i}页选图");
        json_out(['ok' => true, 'credit' => $img['credit']]);
    }

    public function imageUpload($id)
    {
        Auth::lesson($id);
        $i = (int)input('index');
        $slides = $this->slideAt($id, $i);
        if (empty($_FILES['file']['tmp_name']) || !is_uploaded_file($_FILES['file']['tmp_name']) || $_FILES['file']['size'] > Images::MAX_BYTES) {
            json_out(['error' => '请选择 6MB 以内的图片'], 400);
        }
        $img = Images::store($id, file_get_contents($_FILES['file']['tmp_name']));
        if (!$img) {
            json_out(['error' => '只支持 JPG、PNG、WebP、GIF 图片'], 400);
        }
        $slides[$i - 1]['image'] = SlideController::cleanImage($img + ['credit' => '教师上传', 'source' => 'upload']);
        $slides[$i - 1]['notes'] = $this->creditNote($slides[$i - 1]['notes'], '教师上传');
        Agents::saveDeck($id, $slides, "第{$i}页上传图片");
        json_out(['ok' => true]);
    }

    public function imageRemove($id)
    {
        Auth::lesson($id);
        $i = (int)(json_body()['index'] ?? 0);
        $slides = $this->slideAt($id, $i);
        $slides[$i - 1]['image'] = null;
        $slides[$i - 1]['notes'] = trim(preg_replace('/\n?（图片来源：[^）]*）/u', '', $slides[$i - 1]['notes']));
        Agents::saveDeck($id, $slides, "第{$i}页去掉图片");
        json_out(['ok' => true]);
    }

    private function creditNote($notes, $credit)
    {
        $notes = trim(preg_replace('/\n?（图片来源：[^）]*）/u', '', (string)$notes));
        return trim($notes . "\n（图片来源：{$credit}）");
    }

    public function undo($id)
    {
        Auth::lesson($id);
        $v = DB::one('SELECT * FROM deck_versions WHERE lesson_id=? ORDER BY id DESC LIMIT 1', [$id]);
        if (!$v) {
            json_out(['error' => '没有可以撤销的版本'], 400);
        }
        DB::exec('UPDATE decks SET slides=? WHERE lesson_id=?', [$v['slides'], $id]);
        DB::exec('DELETE FROM deck_versions WHERE id=?', [$v['id']]);
        $this->say($id, 'system', '', '↩ 已撤销：' . $v['note']);
        json_out(['ok' => true]);
    }

    public function attachLibrary($id)
    {
        Auth::lesson($id);
        $names = \App\Services\Library::attach(Auth::id(), $id, (array)(json_body()['ids'] ?? []));
        foreach ($names as $n) {
            $this->say($id, 'system', '', "已从资料库加入「{$n}」");
        }
        json_out(['ok' => true, 'added' => count($names)]);
    }

    public function setType($id)
    {
        Auth::lesson($id);
        $t = (string)(json_body()['type'] ?? '');
        Agents::setMeta($id, ['lesson_type' => isset(\App\Services\Style::TYPES[$t]) ? $t : '']);
        json_out(['ok' => true]);
    }

    private function skillState($lessonId)
    {
        try {
            $sel = \App\Services\Skills::lessonIds($lessonId);
            return array_map(function ($s) use ($sel) {
                return ['id' => (int)$s['id'], 'name' => $s['name'], 'cat' => $s['user_id'] ? '我的技能' : $s['category'], 'mine' => $s['user_id'] ? 1 : 0, 'sum' => $s['summary'] ?: mb_substr($s['instructions'], 0, 60), 'ev' => $s['evidence'], 'on' => in_array((int)$s['id'], $sel, true)];
            }, \App\Services\Skills::available(Auth::id()));
        } catch (\Throwable $e) {
            return [];
        }
    }

    public function skills($id)
    {
        Auth::lesson($id);
        $ids = \App\Services\Skills::setLesson($id, (array)(json_body()['ids'] ?? []));
        json_out(['ok' => true, 'ids' => $ids, 'skills' => $this->skillState($id)]);
    }

    public function theme($id)
    {
        Auth::lesson($id);
        $t = (string)(json_body()['theme'] ?? 'blue');
        if (\App\Services\Templates::validTheme(Auth::id(), $t)) {
            DB::query('INSERT INTO decks (lesson_id, theme, slides) VALUES (?,?,?) ON DUPLICATE KEY UPDATE theme=VALUES(theme)', [$id, $t, '[]']);
        }
        json_out(['ok' => true]);
    }

    public function rename($id)
    {
        Auth::lesson($id);
        $b = json_body();
        $f = [];
        if (!empty($b['title'])) {
            $f['title'] = mb_substr(trim($b['title']), 0, 200);
        }
        if (!empty($b['minutes'])) {
            $f['duration_min'] = max(10, min(300, (int)$b['minutes']));
        }
        if ($f) {
            DB::update('lessons', $f, 'id=?', [$id]);
        }
        json_out(['ok' => true]);
    }

    public function destroy($id)
    {
        Auth::lesson($id);
        DB::exec('DELETE FROM lessons WHERE id=?', [$id]);
        Images::purge($id);
        \App\Services\MiniMax::purge($id);
        DB::exec("DELETE FROM videos WHERE lesson_id=?", [$id]);
        flash('课件已删除');
        redirect('');
    }
}
