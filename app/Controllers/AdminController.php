<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Core\View;
use App\Services\DeepSeek;

class AdminController
{
    public function index()
    {
                $usage = DB::all('SELECT action, COUNT(*) n, SUM(ok) okn, SUM(prompt_tokens) pt, SUM(completion_tokens) ct, ROUND(AVG(ms)) ms
            FROM ai_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY action ORDER BY n DESC');
        $mask = function ($k) {
            return $k ? substr($k, 0, 6) . str_repeat('*', 8) . substr($k, -4) : '';
        };
        View::render('admin/index', [
            'usage' => $usage,
            'providers' => DeepSeek::providers(),
            'provider' => DeepSeek::provider(),
            'masks' => ['deepseek' => $mask(DeepSeek::keyOf('deepseek')), 'qwen' => $mask(DeepSeek::keyOf('qwen')),
                'pexels' => $mask(setting('pexels_key', '')), 'pixabay' => $mask(setting('pixabay_key', '')), 'minimax' => $mask(\App\Services\MiniMax::key())],
            'models' => ['deepseek' => DeepSeek::modelOf('deepseek'), 'qwen' => DeepSeek::modelOf('qwen'), 'minimax' => DeepSeek::modelOf('minimax')],
            'mm' => [
                'host' => \App\Services\MiniMax::host(), 'imageModel' => \App\Services\MiniMax::imageModel(), 'videoOn' => setting('video_on', '1') === '1',
                'videoModel' => \App\Services\MiniMax::videoModel(), 'resolution' => setting('video_resolution', '768P'), 'quota' => (int)setting('video_quota_default', '5'),
                'monthCount' => (int)DB::val("SELECT COUNT(*) FROM videos WHERE status='succeeded' AND created_at>=?", [\App\Services\Users::monthStart()]),
                'monthSeconds' => (int)DB::val("SELECT COALESCE(SUM(duration),0) FROM videos WHERE status='succeeded' AND created_at>=?", [\App\Services\Users::monthStart()]),
            ],
            'qwenBase' => setting('qwen_base', ''),
            'review' => setting('review_provider', 'same'),
            'imgSource' => setting('img_source', 'auto'),
            'team' => \App\Services\Agents::team(true),
            'skills' => self::skillsSafe(),
            'roles' => \App\Services\Agents::roles(),
            'errlog' => self::tailLog(40),
            'env' => [
                'PHP' => PHP_VERSION,
                '数据库' => (string)DB::val('SELECT VERSION()'),
                'sql_mode' => (string)DB::val('SELECT @@SESSION.sql_mode'),
                'curl' => function_exists('curl_init') ? '有' : '缺少',
                'GD' => function_exists('imagecreatefromstring') ? '有' : '缺少',
                'open_basedir' => (string)ini_get('open_basedir') ?: '无',
                '图片目录可写' => is_writable(BASE_PATH . '/public/uploads') ? '是' : '否',
                '日志目录可写' => is_writable(BASE_PATH . '/storage/logs') ? '是' : '否',
            ],
            'ucount' => \App\Services\Users::counts(),
            'keys' => array_map(function ($p) {
                return DeepSeek::configured($p);
            }, array_combine(array_keys(DeepSeek::providers()), array_keys(DeepSeek::providers()))),
        ]);
    }

    public function saveSettings()
    {
        foreach (['deepseek_key', 'qwen_key', 'pexels_key', 'pixabay_key', 'minimax_key'] as $k) {
            $v = trim(input($k));
            if ($v === '-') {
                set_setting($k, '');
            } elseif ($v !== '') {
                set_setting($k, $v);
            }
        }
        if (array_key_exists(input('ai_provider'), DeepSeek::providers())) {
            set_setting('ai_provider', input('ai_provider'));
        }
        foreach (['deepseek', 'qwen', 'minimax'] as $p) {
            $m = input($p . '_model');
            if (isset(DeepSeek::providers()[$p]['models'][$m])) {
                set_setting($p . '_model', $m);
            }
        }
        $qb = input('qwen_base');
        set_setting('qwen_base', in_array($qb, ['https://dashscope.aliyuncs.com/compatible-mode/v1', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'], true) ? $qb : '');
        $mm = \App\Services\MiniMax::class;
        set_setting('minimax_host', isset($mm::HOSTS[input('minimax_host')]) ? input('minimax_host') : 'https://api.minimax.cn');
        if (isset($mm::IMAGE_MODELS[input('minimax_image_model')])) {
            set_setting('minimax_image_model', input('minimax_image_model'));
        }
        if (isset($mm::VIDEO_MODELS[input('video_model')])) {
            set_setting('video_model', input('video_model'));
        }
        if (in_array(input('video_resolution'), ['480P', '768P', '2K'], true)) {
            set_setting('video_resolution', input('video_resolution'));
        }
        set_setting('video_on', input('video_on') === '1' ? '1' : '0');
        set_setting('ai_failover', input('ai_failover') === '1' ? '1' : '0');
        set_setting('cross_review', input('cross_review') === '1' ? '1' : '0');
        set_setting('video_quota_default', (string)max(0, (int)input('video_quota_default', '5')));
        if (in_array(input('review_provider'), ['same', 'deepseek', 'qwen', 'minimax'], true)) {
            set_setting('review_provider', input('review_provider'));
        }
        if (in_array(input('img_source'), ['auto', 'pexels', 'pixabay', 'openverse', 'wanx', 'minimax', 'off'], true)) {
            set_setting('img_source', input('img_source'));
        }
        flash('设置已保存');
        redirect('admin');
    }

    public static function tailLog($n)
    {
        $f = BASE_PATH . '/storage/logs/error.log';
        if (!is_readable($f)) {
            return [];
        }
        $lines = file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        return array_reverse(array_slice($lines, -$n));
    }

    public function clearLog()
    {
        @file_put_contents(BASE_PATH . '/storage/logs/error.log', '');
        flash('错误日志已清空');
        redirect('admin#log');
    }

    public function saveTeam()
    {
        $cfg = [];
        foreach (\App\Services\Agents::roles() as $k => $r) {
            $cfg[$k] = [
                'enabled' => !empty($r['fixed']) || input('en_' . $k) === '1',
                'name' => mb_substr(trim(input('name_' . $k)), 0, 20),
                'extra' => mb_substr(trim(input('extra_' . $k)), 0, 500),
                'model' => isset(DeepSeek::providers()[input('model_' . $k)]) ? input('model_' . $k) : 'auto',
            ];
            if ($cfg[$k]['name'] === $r['name']) {
                $cfg[$k]['name'] = '';
            }
        }
        if (input('reset') === '1') {
            $cfg = [];
        }
        set_setting('team_config', json_encode($cfg, JSON_UNESCAPED_UNICODE));
        flash(input('reset') === '1' ? 'AI 团队已恢复默认设置' : 'AI 团队设置已保存');
        redirect('admin#team');
    }

    private static function skillsSafe()
    {
        try {
            return \App\Services\Skills::all();
        } catch (\Throwable $e) {
            return [];
        }
    }

    public function createSkill()
    {
        $f = \App\Services\Skills::clean($_POST + ['enabled' => 1]);
        if ($f['name'] === '' || $f['instructions'] === '') {
            flash('请填写方法名称和具体做法', 'err');
            redirect('admin#skills');
        }
        $f['skey'] = 'u' . substr(md5(uniqid('', true)), 0, 12);
        $f['sort'] = (int)DB::val('SELECT COALESCE(MAX(sort),0)+10 FROM skills');
        DB::insert('skills', $f);
        flash('已添加教学方法：' . $f['name']);
        redirect('admin#skills');
    }

    public function updateSkill($id)
    {
        if (!DB::val('SELECT id FROM skills WHERE id=? AND user_id IS NULL', [$id])) {
            redirect('admin#skills');
        }
        if (input('toggle') === '1') {
            DB::query('UPDATE skills SET enabled=1-enabled WHERE id=?', [$id]);
            redirect('admin#skills');
        }
        $f = \App\Services\Skills::clean($_POST);
        if ($f['name'] === '' || $f['instructions'] === '') {
            flash('方法名称和具体做法不能为空', 'err');
            redirect('admin#skills');
        }
        $f['sort'] = (int)input('sort');
        DB::update('skills', $f, 'id=?', [$id]);
        flash('已保存：' . $f['name']);
        redirect('admin#skills');
    }

    public function deleteSkill($id)
    {
        DB::query('DELETE FROM skills WHERE id=? AND user_id IS NULL', [$id]);
        flash('已删除');
        redirect('admin#skills');
    }

    /** 从 GitHub 上的 SKILL.md（链接或粘贴的文本）导入，由 AI 改写为中文高校版 */
    public function importSkill()
    {
        release_session();
        $text = trim((string)($_POST['text'] ?? ''));
        $url = trim(input('url'));
        if ($url !== '') {
            if (preg_match('#^https://github\.com/([^/]+)/([^/]+)/blob/(.+)$#', $url, $m)) {
                $url = "https://raw.githubusercontent.com/{$m[1]}/{$m[2]}/{$m[3]}";
            }
            if (!preg_match('#^https://raw\.githubusercontent\.com/[\w.-]+/[\w.-]+/.+\.md$#', $url)) {
                flash('只支持 GitHub 上的 .md 文件链接（如 https://github.com/用户/仓库/blob/main/.../SKILL.md）', 'err');
                redirect('admin#skills');
            }
            $ch = curl_init($url);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_FOLLOWLOCATION => false, CURLOPT_USERAGENT => 'beike-workbench']);
            $text = (string)curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($code !== 200 || $text === '') {
                flash("读取失败（HTTP {$code}），可以把文件内容直接粘贴进来", 'err');
                redirect('admin#skills');
            }
        }
        if (mb_strlen($text) < 40) {
            flash('请粘贴技能说明文本或填写 GitHub 链接', 'err');
            redirect('admin#skills');
        }
        $roles = implode('、', array_map(function ($k, $r) {
            return "$k={$r['name']}";
        }, array_keys(\App\Services\Agents::roles()), \App\Services\Agents::roles()));
        $r = DeepSeek::chat('skill_import', [
            ['role' => 'system', 'content' => '你是高校教学发展中心的资深教学设计专家。把给定的（可能是英文的）教学技能说明改写成中国高校教师可直接使用的中文“教学方法卡片”。只输出 JSON。'],
            ['role' => 'user', 'content' => "原文：\n" . mb_substr($text, 0, 12000) . "\n\n输出 JSON：{\"name\":\"不超过10字的中文名称\",\"category\":\"分类，如 记忆与学习科学/讲授与示范/提问与讨论/评价与反馈/国内高校常用\",\"summary\":\"一句话说明（40字内）\",\"instructions\":\"给 AI 课件团队的具体做法（150-300字，可操作，适合大学课堂，说明在课件/讲稿/练习中怎么体现）\",\"agents\":[\"相关成员代号\"],\"evidence\":\"原文引用的主要研究文献，原样保留作者和年份，不要编造\",\"license\":\"原文声明的许可证，没有就留空\"}。成员代号可选：{$roles}"],
        ], true, 0.3, 2000);
        if (!$r['ok']) {
            flash('AI 改写失败：' . $r['error'], 'err');
            redirect('admin#skills');
        }
        $j = $r['json'] ?: [];
        $f = \App\Services\Skills::clean([
            'name' => $j['name'] ?? '', 'category' => $j['category'] ?? '', 'summary' => $j['summary'] ?? '',
            'instructions' => $j['instructions'] ?? '', 'agents' => (array)($j['agents'] ?? []), 'evidence' => $j['evidence'] ?? '',
            'source' => $url ? preg_replace('#^https://raw\.githubusercontent\.com/#', 'github.com/', $url) : '粘贴导入',
            'license' => $j['license'] ?? '', 'enabled' => 1,
        ]);
        if ($f['name'] === '' || $f['instructions'] === '') {
            flash('AI 没有给出有效结果，请换一份说明再试', 'err');
            redirect('admin#skills');
        }
        $f['skey'] = 'u' . substr(md5(uniqid('', true)), 0, 12);
        $f['sort'] = (int)DB::val('SELECT COALESCE(MAX(sort),0)+10 FROM skills');
        DB::insert('skills', $f);
        flash('已导入：' . $f['name'] . '（请检查内容，必要时修改）');
        redirect('admin#skills');
    }

}
