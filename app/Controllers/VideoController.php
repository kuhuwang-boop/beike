<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Services\Agents;
use App\Services\DeepSeek;
use App\Services\MiniMax;

/** 课件工作室：AI 教学视频（MiniMax H3）——写视频脚本、提交生成、查询进度、插入课件 */
class VideoController
{
    const KINDS = [
        'intro' => ['导入短片', '课堂开头用的情境短片，引起兴趣、引出问题'],
        'demo' => ['原理演示', '把抽象的过程、原理、结构变化直观地演示出来'],
        'scene' => ['真实场景', '展示知识在真实生活、行业、实验中的样子'],
        'story' => ['故事情境', '一个小情节，带出本节要讨论的问题或案例'],
    ];

    private function guard($id)
    {
        $lesson = Auth::lesson($id);
        if (!MiniMax::videoOn()) {
            json_out(['error' => '管理员还没有开启 AI 教学视频（需要在「系统设置」填写 MiniMax 的 API Key）'], 400);
        }
        return $lesson;
    }

    /** 本月额度和可用参数，供前端打开窗口时显示 */
    public function info($id)
    {
        Auth::lesson($id);
        $q = MiniMax::videoQuota(Auth::id());
        json_out([
            'on' => MiniMax::videoOn(), 'quota' => $q, 'used' => MiniMax::videosThisMonth(Auth::id()),
            'model' => MiniMax::videoModel(), 'resolution' => MiniMax::videoResolution(), 'kinds' => self::KINDS,
            'min' => MiniMax::videoModel() === 'MiniMax-H3-Max' ? 5 : 4,
            'pending' => DB::all("SELECT id, status FROM videos WHERE lesson_id=? AND status IN ('queued','running')", [$id]),
        ]);
    }

    /** AI 根据这一页和本节课内容写视频脚本（画面描述） */
    public function draft($id)
    {
        release_session();
        $lesson = $this->guard($id);
        $course = Auth::course($lesson['course_id']);
        $b = json_body();
        $slides = Agents::deck($id);
        $i = (int)($b['index'] ?? 0);
        $s = $slides[$i - 1] ?? null;
        $kind = isset(self::KINDS[$b['kind'] ?? '']) ? $b['kind'] : 'intro';
        $idea = mb_substr(trim((string)($b['idea'] ?? '')), 0, 300);
        $page = $s ? "第{$i}页「{$s['title']}」" . ($s['subtitle'] ? "：{$s['subtitle']}" : '') . ($s['bullets'] ? '；要点：' . implode('；', array_slice($s['bullets'], 0, 5)) : '') : '（未指定页面）';
        $prompt = "你是高校课堂的教学视频导演。请为下面这节课写一段给 AI 视频模型（MiniMax 海螺 H3）的画面描述，用来生成一条 4–15 秒的课堂短视频。\n\n"
            . "课程：{$course['name']}\n本节课题：{$lesson['title']}\n相关页面：{$page}\n视频类型：" . self::KINDS[$kind][0] . '——' . self::KINDS[$kind][1] . "\n"
            . ($idea !== '' ? "老师的想法：{$idea}\n" : '')
            . "\n写作要求：\n1. 用中文写成一段连贯的画面描述（120–260 字），依次交代：场景与主体、主体的具体动作或变化过程、镜头运动（如缓慢推进、环绕、俯拍、特写）、光线与色调、整体风格（写实摄影 / 科普三维动画 / 实验室实拍等，选最适合本学科的一种）。\n"
            . "2. 画面要准确表达这节课的知识点，科学、专业、无常识错误；适合大学课堂播放，不出现血腥、暴力、真实名人、品牌标志。\n"
            . "3. 画面里不要出现任何文字、字幕、公式、数字标签（视频模型写不好字，字由老师在课件上讲）。\n"
            . "4. 只描述一个连续镜头或两三个紧凑的镜头，别塞太多内容。\n"
            . "5. 另给一个 12 字以内的视频标题，并建议时长（4–15 的整数秒，一般 6–10 秒）。\n\n"
            . '输出 JSON：{"title":"","prompt":"","duration":8,"teach":"一句话说明课堂上怎么用这段视频"}';
        $r = DeepSeek::chat('video_prompt', [['role' => 'user', 'content' => $prompt]], true, 0.6, 1200);
        if (!$r['ok']) {
            json_out(['error' => $r['error']], 502);
        }
        $j = $r['json'];
        if (mb_strlen(trim((string)($j['prompt'] ?? ''))) < 8) {
            json_out(['error' => 'AI 这次没写出画面描述，请再点一次，或自己写几句'], 502);
        }
        json_out([
            'title' => mb_substr(trim((string)($j['title'] ?? '')), 0, 30) ?: ($s['title'] ?? $lesson['title']),
            'prompt' => mb_substr(trim((string)($j['prompt'] ?? '')), 0, 1500),
            'duration' => max(4, min(15, (int)($j['duration'] ?? 8))),
            'teach' => mb_substr(trim((string)($j['teach'] ?? '')), 0, 120),
        ]);
    }

    /** 提交生成：在指定位置插入一页「视频页」，或替换已有视频页的视频 */
    public function create($id)
    {
        release_session();
        $lesson = $this->guard($id);
        $b = json_body();
        $prompt = trim((string)($b['prompt'] ?? ''));
        if (mb_strlen($prompt) < 8) {
            json_out(['error' => '请先写几句画面描述（或点「AI 帮我写」）'], 400);
        }
        $uid = Auth::id();
        $q = MiniMax::videoQuota($uid);
        if ($q > 0 && MiniMax::videosThisMonth($uid) >= $q) {
            json_out(['error' => "本月的视频额度已用完（{$q} 条），下个月 1 日自动恢复。急需请联系管理员。"], 403);
        }
        if ((int)DB::val("SELECT COUNT(*) FROM videos WHERE user_id=? AND status IN ('queued','running') AND created_at>=DATE_SUB(NOW(), INTERVAL 1 HOUR)", [$uid]) >= 3) {
            json_out(['error' => '你已有 3 条视频正在生成，请等它们完成后再提交'], 429);
        }
        $slides = Agents::deck($id);
        $n = count($slides);
        $replace = (int)($b['replace'] ?? 0);
        if ($replace && (($slides[$replace - 1]['layout'] ?? '') !== 'video')) {
            $replace = 0;
        }
        $after = max(0, min($n, (int)($b['after'] ?? $n)));
        if ($n >= 60 && !$replace) {
            json_out(['error' => '课件已有 60 页，不能再插入了'], 400);
        }
        $dur = (int)($b['duration'] ?? 8);
        $ratio = (string)($b['ratio'] ?? '16:9');
        // 可选：用某一页的配图作为视频第一帧
        $first = null;
        $fi = (int)($b['first_frame'] ?? 0);
        if ($fi >= 1 && $fi <= $n && !empty($slides[$fi - 1]['image']['src'])) {
            $f = BASE_PATH . '/public' . $slides[$fi - 1]['image']['src'];
            if (is_file($f) && filesize($f) < 8 * 1048576) {
                $first = 'data:image/' . (substr($f, -3) === 'png' ? 'png' : 'jpeg') . ';base64,' . base64_encode(file_get_contents($f));
            }
        }
        list($task, $err) = MiniMax::createVideo($prompt, $dur, $ratio, $first);
        if ($task === '') {
            json_out(['error' => $err], 502);
        }
        $dur = max(4, min(15, $dur));
        $vid = DB::insert('videos', ['user_id' => $uid, 'lesson_id' => $id, 'task_id' => $task, 'model' => MiniMax::videoModel(),
            'prompt' => mb_substr($prompt, 0, 6000), 'duration' => $dur, 'ratio' => $first ? 'adaptive' : $ratio, 'status' => 'queued']);
        $title = mb_substr(trim((string)($b['title'] ?? '')), 0, 60) ?: '教学视频';
        $video = ['id' => (int)$vid, 'src' => '', 'status' => 'queued', 'dur' => $dur, 'prompt' => mb_substr($prompt, 0, 600)];
        $teach = mb_substr(trim((string)($b['teach'] ?? '')), 0, 200);
        if ($replace) {
            $slides[$replace - 1]['video'] = $video;
            $idx = $replace;
            $note = "第{$replace}页重新生成视频";
        } else {
            $page = SlideController::normalize([[
                'layout' => 'video', 'phase' => (string)($b['phase'] ?? ($after === 0 || $after === 1 ? 'B' : 'P2')), 'title' => $title,
                'subtitle' => mb_substr(trim((string)($b['subtitle'] ?? '')), 0, 120), 'video' => $video,
                'notes' => trim(($teach !== '' ? "【怎么用】{$teach}\n" : '') . '（视频由 AI 生成：MiniMax 海螺 H3，仅作教学示意）'),
            ]])[0];
            array_splice($slides, $after, 0, [$page]);
            $idx = $after + 1;
            $note = "插入第{$idx}页教学视频";
        }
        Agents::saveDeck($id, $slides, $note);
        json_out(['ok' => true, 'vid' => (int)$vid, 'index' => $idx]);
    }

    /** 查询进度；完成后把成片下载到本服务器并写进课件 */
    public function status($id, $vid)
    {
        release_session();
        Auth::lesson($id);
        $v = DB::one('SELECT * FROM videos WHERE id=? AND lesson_id=?', [(int)$vid, $id]);
        if (!$v) {
            json_out(['error' => '没有这个视频任务'], 404);
        }
        if (in_array($v['status'], ['queued', 'running'], true)) {
            $r = MiniMax::queryVideo($v['task_id']);
            $st = $r['status'];
            if ($st === 'succeeded' && $r['url'] !== '') {
                $saved = MiniMax::saveVideo($id, $r['url'], 'v' . $v['id']);
                if ($saved) {
                    DB::update('videos', ['status' => 'succeeded', 'src' => $saved['src'], 'updated_at' => date('Y-m-d H:i:s')], 'id=?', [$v['id']]);
                    $this->patchSlide($id, (int)$v['id'], ['status' => 'succeeded', 'src' => $saved['src']]);
                } else {
                    DB::update('videos', ['status' => 'failed', 'error' => '视频已生成，但下载到服务器失败（检查 uploads 目录是否可写）', 'updated_at' => date('Y-m-d H:i:s')], 'id=?', [$v['id']]);
                    $this->patchSlide($id, (int)$v['id'], ['status' => 'failed', 'error' => '视频下载失败，请重新生成']);
                }
            } elseif (in_array($st, ['failed', 'cancelled'], true)) {
                $e = $r['error'] ?: '视频生成失败，请换个描述再试';
                DB::update('videos', ['status' => 'failed', 'error' => mb_substr($e, 0, 250), 'updated_at' => date('Y-m-d H:i:s')], 'id=?', [$v['id']]);
                $this->patchSlide($id, (int)$v['id'], ['status' => 'failed', 'error' => mb_substr($e, 0, 200)]);
            } elseif (in_array($st, ['queued', 'running'], true) && $st !== $v['status']) {
                DB::update('videos', ['status' => $st, 'updated_at' => date('Y-m-d H:i:s')], 'id=?', [$v['id']]);
                $this->patchSlide($id, (int)$v['id'], ['status' => $st]);
            } elseif ($st === 'unknown' && strtotime($v['created_at']) < time() - 86400) {
                DB::update('videos', ['status' => 'failed', 'error' => '任务超时', 'updated_at' => date('Y-m-d H:i:s')], 'id=?', [$v['id']]);
                $this->patchSlide($id, (int)$v['id'], ['status' => 'failed', 'error' => '任务超时，请重新生成']);
            }
            $v = DB::one('SELECT * FROM videos WHERE id=?', [$v['id']]);
            if (isset($r['progress'])) {
                $v['progress'] = $r['progress'];
            }
        }
        json_out(['status' => $v['status'], 'src' => $v['src'], 'error' => $v['error'], 'progress' => $v['progress'] ?? null,
            'elapsed' => time() - strtotime($v['created_at'])]);
    }

    /** 更新课件里对应视频页的状态（不进撤销历史，避免刷屏） */
    private function patchSlide($lessonId, $vid, array $fields)
    {
        $slides = Agents::deck($lessonId);
        $hit = false;
        foreach ($slides as &$s) {
            if (($s['layout'] ?? '') === 'video' && (int)($s['video']['id'] ?? 0) === $vid) {
                $s['video'] = SlideController::cleanVideo(array_merge($s['video'], $fields));
                $hit = true;
            }
        }
        unset($s);
        if ($hit) {
            DB::exec('UPDATE decks SET slides=? WHERE lesson_id=?', [json_encode($slides, JSON_UNESCAPED_UNICODE), $lessonId]);
        }
    }
}
