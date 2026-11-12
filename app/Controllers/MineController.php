<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Core\View;
use App\Services\DeepSeek;
use App\Services\Library;
use App\Services\Skills;
use App\Services\Style;

/** 因人而异：我的资料库、我的备课风格、我的技能、常用指令 */
class MineController
{
    /* ---------------- 我的资料库 ---------------- */

    public function library()
    {
        $uid = Auth::id();
        $q = trim((string)($_GET['q'] ?? ''));
        View::render('mine/library', ['title' => '我的资料库', 'items' => Library::listFor($uid, $q), 'q' => $q,
            'folders' => array_values(array_filter(array_column(DB::all('SELECT DISTINCT folder FROM library WHERE user_id=? ORDER BY folder', [$uid]), 'folder'), 'strlen'))]);
    }

    public function libraryList()
    {
        $uid = Auth::id();
        json_out(['items' => Library::listFor($uid, (string)($_GET['q'] ?? '')), 'suggest' => Library::suggest($uid, (string)($_GET['title'] ?? ''))]);
    }

    public function libraryAdd()
    {
        $b = json_body();
        $name = mb_substr(trim((string)($b['filename'] ?? '资料')), 0, 200);
        if (trim((string)($b['content'] ?? '')) === '') {
            json_out(['error' => "没有从「{$name}」中读到文字。如果是扫描件或纯图片 PPT，请换成可复制文字的版本。"], 400);
        }
        $id = Library::add(Auth::id(), $name, (string)$b['content'], (string)($b['folder'] ?? ''));
        if (!$id) {
            json_out(['error' => '资料库已满（最多 ' . Library::MAX_ITEMS . ' 份），请先删除不用的资料'], 400);
        }
        json_out(['ok' => true, 'id' => $id]);
    }

    public function libraryGet($id)
    {
        $r = DB::one('SELECT id, folder, filename, content FROM library WHERE id=? AND user_id=?', [$id, Auth::id()]);
        if (!$r) {
            json_out(['error' => '资料不存在'], 404);
        }
        json_out($r);
    }

    public function libraryUpdate($id)
    {
        $b = json_body();
        $r = DB::one('SELECT id FROM library WHERE id=? AND user_id=?', [$id, Auth::id()]);
        if (!$r) {
            json_out(['error' => '资料不存在'], 404);
        }
        $f = [];
        if (isset($b['filename']) && trim((string)$b['filename']) !== '') {
            $f['filename'] = mb_substr(trim((string)$b['filename']), 0, 200);
        }
        if (isset($b['folder'])) {
            $f['folder'] = mb_substr(trim((string)$b['folder']), 0, 60);
        }
        if (isset($b['content']) && trim((string)$b['content']) !== '') {
            $c = mb_substr(trim((string)$b['content']), 0, 200000);
            $f += ['content' => $c, 'chars' => mb_strlen($c), 'hash' => sha1($c)];
        }
        if ($f) {
            DB::update('library', $f, 'id=?', [$id]);
        }
        json_out(['ok' => true]);
    }

    public function libraryDelete($id)
    {
        DB::exec('DELETE FROM library WHERE id=? AND user_id=?', [$id, Auth::id()]);
        json_out(['ok' => true]);
    }

    /* ---------------- 我的备课风格与技能 ---------------- */

    public function style()
    {
        $uid = Auth::id();
        View::render('mine/style', [
            'title' => '我的备课风格',
            'p' => Style::profile($uid), 'cmds' => Style::cmds($uid), 'defaults' => Style::defaults($uid),
            'mine' => Skills::mine($uid), 'system' => Skills::all(true), 'roles' => \App\Services\Agents::roles(),
            'libCount' => (int)DB::val('SELECT COUNT(*) FROM library WHERE user_id=?', [$uid]),
            'aiReady' => DeepSeek::configured(),
        ]);
    }

    public function saveStyle()
    {
        Style::setProfile(Auth::id(), $_POST);
        flash('备课风格已保存，之后生成和修改课件都会按它来');
        redirect('style');
    }

    public function saveDefaults()
    {
        $uid = Auth::id();
        Style::setDefaults($uid, Skills::filterIds($uid, (array)($_POST['ids'] ?? [])));
        flash('已保存：新课件会自动带上这些技能');
        redirect('style#skills');
    }

    public function saveCmds()
    {
        json_out(['ok' => true, 'cmds' => Style::setCmds(Auth::id(), (array)(json_body()['cmds'] ?? []))]);
    }

    /** AI 读老师资料库里的旧资料，总结出备课风格的建议（不直接保存，老师确认后再存） */
    public function learnStyle()
    {
        release_session();
        $uid = Auth::id();
        $rows = DB::all('SELECT filename, LEFT(content, 3500) head FROM library WHERE user_id=? ORDER BY id DESC LIMIT 6', [$uid]);
        if (!$rows) {
            json_out(['error' => '资料库里还没有资料。先到「我的资料库」上传几份你以前的课件或教案，AI 才能学习你的风格。'], 400);
        }
        $text = '';
        foreach ($rows as $r) {
            $text .= "\n=== {$r['filename']} ===\n{$r['head']}\n";
        }
        $must = implode('、', array_map(function ($k, $v) {
            return "$k=$v";
        }, array_keys(Style::MUST), Style::MUST));
        $r = DeepSeek::chat('style_learn', [
            ['role' => 'system', 'content' => '你是高校教学发展中心的资深教学顾问。阅读一位大学老师以前的课件和教案，客观总结他的备课习惯。只依据材料里看得到的特点，看不出来的字段留空，不要编造。只输出 JSON。'],
            ['role' => 'user', 'content' => "这位老师的旧资料（节选）：\n" . mb_substr($text, 0, 16000)
                . "\n\n输出 JSON：{\"tone\":\"rigorous|friendly|lively 之一，看不出留空\",\"density\":\"lean|normal|rich 之一，看不出留空\",\"students\":\"从材料推断的授课对象（专业、年级、基础），40字内，看不出留空\",\"cases\":\"他常用哪类案例/例子，40字内\",\"must\":[\"他几乎每节课都有的环节代号，可选：{$must}\"],\"avoid\":\"\",\"notes\":\"其他明显的习惯（如结构、板书、作业、用语特点），100字内\",\"evidence\":\"用两三句话告诉老师：你是从哪些特点看出来的\"}"],
        ], true, 0.2, 1500);
        if (!$r['ok']) {
            json_out(['error' => $r['error']], 502);
        }
        $j = (array)$r['json'];
        json_out(['ok' => true, 'files' => array_column($rows, 'filename'), 'evidence' => mb_substr((string)($j['evidence'] ?? ''), 0, 400), 'profile' => [
            'tone' => array_key_exists((string)($j['tone'] ?? ''), Style::TONES) ? (string)$j['tone'] : '',
            'density' => array_key_exists((string)($j['density'] ?? ''), Style::DENSITY) ? (string)$j['density'] : '',
            'students' => mb_substr(trim((string)($j['students'] ?? '')), 0, 200), 'cases' => mb_substr(trim((string)($j['cases'] ?? '')), 0, 200),
            'must' => array_values(array_intersect((array)($j['must'] ?? []), array_keys(Style::MUST))),
            'notes' => mb_substr(trim((string)($j['notes'] ?? '')), 0, 800),
        ]]);
    }

    /* ---------------- 我的技能 ---------------- */

    public function skillSave($id = 0)
    {
        $uid = Auth::id();
        $f = Skills::clean($_POST + ['enabled' => 1]);
        $f['category'] = '我的技能';
        if ($f['name'] === '' || $f['instructions'] === '') {
            flash('请填写技能名称和具体要求', 'err');
            redirect('style#skills');
        }
        if ($id) {
            if (!DB::val('SELECT id FROM skills WHERE id=? AND user_id=?', [$id, $uid])) {
                redirect('style#skills');
            }
            DB::update('skills', $f, 'id=?', [$id]);
        } else {
            if (DB::val('SELECT id FROM skills WHERE user_id=? AND name=? AND instructions=?', [$uid, $f['name'], $f['instructions']])) {
                flash('已经有一个完全相同的技能「' . $f['name'] . '」，不用重复保存', 'err');
                redirect('style#skills');
            }
            if ((int)DB::val('SELECT COUNT(*) FROM skills WHERE user_id=?', [$uid]) >= 50) {
                flash('最多保存 50 个自己的技能', 'err');
                redirect('style#skills');
            }
            $f += ['skey' => 'u' . substr(md5(uniqid('', true)), 0, 12), 'user_id' => $uid, 'sort' => 0];
            $id = DB::insert('skills', $f);
            if (input('as_default') === '1') {
                Style::setDefaults($uid, array_merge(Style::defaults($uid), [$id]));
            }
        }
        flash('已保存技能：' . $f['name']);
        redirect('style#skills');
    }

    public function skillCreate()
    {
        $this->skillSave(0);
    }

    public function skillDelete($id)
    {
        $uid = Auth::id();
        DB::exec('DELETE FROM skills WHERE id=? AND user_id=?', [$id, $uid]);
        Style::setDefaults($uid, array_diff(Style::defaults($uid), [(int)$id]));
        flash('已删除');
        redirect('style#skills');
    }

    /** 老师用一句话描述想要的效果，AI 写成可执行的技能要求（返回草稿，不直接保存） */
    public function skillDraft()
    {
        release_session();
        $want = mb_substr(trim((string)(json_body()['want'] ?? '')), 0, 600);
        if (mb_strlen($want) < 4) {
            json_out(['error' => '请先用一两句话说说你想要的效果'], 400);
        }
        $r = DeepSeek::chat('skill_draft', [
            ['role' => 'system', 'content' => '你是资深大学教师和教学设计专家。把老师口头描述的备课习惯写成一条给“AI 课件团队”执行的技能：具体、可检查、能直接落实到课件页面、讲稿和练习。不要加入老师没提到的要求。只输出 JSON。'],
            ['role' => 'user', 'content' => "老师说：「{$want}」\n输出 JSON：{\"name\":\"不超过10字的技能名\",\"summary\":\"一句话说明（30字内）\",\"instructions\":\"给 AI 团队的具体要求，100–220字，分点写清在课件、讲稿、练习中分别怎么做\"}"],
        ], true, 0.3, 900);
        if (!$r['ok']) {
            json_out(['error' => $r['error']], 502);
        }
        $j = (array)$r['json'];
        json_out(['ok' => true, 'name' => mb_substr(trim((string)($j['name'] ?? '')), 0, 60), 'summary' => mb_substr(trim((string)($j['summary'] ?? '')), 0, 200), 'instructions' => mb_substr(trim((string)($j['instructions'] ?? '')), 0, 2000)]);
    }
}
