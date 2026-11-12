<?php
namespace App\Services;

use App\Core\DB;
use App\Controllers\SlideController;

/**
 * 课件 AI 团队（按高校真实教研分工设计）
 *
 *  leader      组长·小备        理解需求、制定工序、分派任务（快速 / 精品两种流程）
 *  analyst     学情分析师       学生起点、先修知识、典型困难 → 决定讲多深、从哪讲起
 *  designer    教学设计师       学习目标、重难点、BOPPPS 流程与时间分配
 *  expert      学科专家         概念的准确表述、推导要点、典型例题、学科前沿
 *  slides      课件设计师       制作 / 修改 PPT 页面
 *  case        案例与思政设计师 真实行业案例、应用场景、自然融入的课程思政
 *  quiz        互动与评价设计师 课堂提问、前测后测、练习，同时写入题库
 *  illustrator 配图师           给合适的页面配真实照片（图库优先，AI 生成兜底）
 *  script      讲稿撰写师       每页授课讲稿（时间、过渡语、提问话术）与板书设计
 *  reviewer    质量督导         对照原始资料核查科学性，并从教学质量角度把关（可用另一模型交叉核查）
 */
class Agents
{
    /** 角色默认定义；管理员可在系统设置中启用/停用、改名、追加要求 */
    public static function roles()
    {
        return [
            'leader' => ['name' => '组长·小备', 'title' => '统筹分工', 'color' => '#5b7f95', 'icon' => '备', 'fixed' => true,
                'desc' => '理解你的需求，安排合适的成员按顺序工作'],
            'analyst' => ['name' => '学情分析师', 'title' => '学生起点', 'color' => '#6f8fa8', 'icon' => '情',
                'desc' => '分析学生已有基础、先修知识和典型困难，决定讲多深、从哪里讲起'],
            'designer' => ['name' => '教学设计师', 'title' => '教学设计', 'color' => '#4f8a7b', 'icon' => '设',
                'desc' => '确定学习目标和重难点，设计课堂流程与时间分配'],
            'expert' => ['name' => '学科专家', 'title' => '内容把关', 'color' => '#5e7d6a', 'icon' => '专',
                'desc' => '给出概念的准确表述、推导要点、典型例题，补充学科前沿'],
            'slides' => ['name' => '课件设计师', 'title' => 'PPT 制作', 'color' => '#c0895a', 'icon' => '课',
                'desc' => '把教学设计做成一页一个观点的课件，详细内容放进讲稿'],
            'case' => ['name' => '案例与思政设计师', 'title' => '案例与思政', 'color' => '#b07a6e', 'icon' => '案',
                'desc' => '加入真实的行业案例、应用场景，自然融入课程思政'],
            'quiz' => ['name' => '互动与评价设计师', 'title' => '互动与测验', 'color' => '#8a7aa6', 'icon' => '题',
                'desc' => '设计课堂提问、课前小测、课堂检测和课后练习，题目同时存入题库'],
            'diagram' => ['name' => '结构图设计师', 'title' => '结构图', 'color' => '#4f7fa8', 'icon' => '构',
                'desc' => '把流程、对比、层级、分类等关系画成可在 PPT 里直接编辑的结构图（13 种版式）'],
            'illustrator' => ['name' => '配图师', 'title' => '真实图片', 'color' => '#7d9a5b', 'icon' => '图',
                'desc' => '给适合的页面配真实照片，搜不到时用 AI 生成写实示意图'],
            'script' => ['name' => '讲稿撰写师', 'title' => '讲稿与板书', 'color' => '#a08a5a', 'icon' => '稿',
                'desc' => '为每页写授课讲稿：时间提示、讲解要点、过渡语、提问话术，并设计板书'],
            'reviewer' => ['name' => '质量督导', 'title' => '内容与质量核查', 'color' => '#5d8fa5', 'icon' => '督',
                'desc' => '对照原始资料核查科学性和遗漏，并从教学质量角度提出修改'],
        ];
    }

    /** 当前生效的团队（合并管理员配置） */
    public static function team($all = false)
    {
        $cfg = json_decode((string)setting('team_config', ''), true) ?: [];
        $out = [];
        foreach (self::roles() as $k => $r) {
            $c = $cfg[$k] ?? [];
            $r['enabled'] = !empty($r['fixed']) ? true : (isset($c['enabled']) ? (bool)$c['enabled'] : true);
            if (!empty($c['name'])) {
                $r['name'] = mb_substr($c['name'], 0, 20);
            }
            $r['extra'] = (string)($c['extra'] ?? '');
            $r['model'] = isset(DeepSeek::providers()[$c['model'] ?? '']) ? $c['model'] : 'auto';
            if ($all || $r['enabled']) {
                $out[$k] = $r;
            }
        }
        return $out;
    }

    /** 当前正在处理的课次（用于注入老师选定的教学方法） */
    public static $lessonId = 0;

    private static function extra($agent)
    {
        $t = self::team(true);
        $x = !empty($t[$agent]['extra']) ? "\n【管理员对你的额外要求】" . $t[$agent]['extra'] . "\n" : '';
        try {
            // 因人而异：课型 + 这位老师的备课风格 + 本节课选定的技能（见 Skills::prompt）
            $x .= Skills::prompt(self::$lessonId, $agent);
        } catch (\Throwable $e) {
            // 相关表未建好时不影响主流程
        }
        return $x;
    }

    const BASE = '你是高校“AI 课件团队”的一员，团队成员由资深教授、教学设计专家和学科专家组成，服务于一位大学老师，帮他把平时的备课资料变成科学准确、结构合理、学生愿意听的课件。共同原则：1) 以老师上传的原始资料为准，保留其中的核心概念、例题、数据和案例，不编造事实、数据、文献或人物言论；资料没有覆盖而你补充的内容要明确说明“这是补充的”。2) 遵循学习科学：先激活旧知再引入新知、一页一个观点、讲练结合、及时反馈。3) 用中文，语气像靠谱的同事，简洁直接。4) 只输出 JSON。';

    /* ---------------- 上下文 ---------------- */

    public static function materials($lessonId, $limit = 24000)
    {
        $rows = DB::all('SELECT filename, content FROM materials WHERE lesson_id=? ORDER BY id', [$lessonId]);
        $out = '';
        foreach ($rows as $r) {
            $out .= "\n===== 资料：{$r['filename']} =====\n" . $r['content'] . "\n";
        }
        if ($out === '') {
            // 这节课还没加资料：按课题从老师自己的资料库里找最相关的几份参考
            foreach (self::libraryRefs($lessonId) as $r) {
                $out .= "\n===== 资料（来自老师的资料库，按课题自动匹配，只取与本课相关的部分）：{$r['filename']} =====\n" . $r['content'] . "\n";
            }
        }
        return mb_substr($out, 0, $limit);
    }

    /** 课件没有资料时，按课题自动匹配老师资料库里的资料（最多 3 份） */
    public static function libraryRefs($lessonId)
    {
        try {
            $title = (string)DB::val('SELECT title FROM lessons WHERE id=?', [$lessonId]);
            $uid = Skills::ownerOf($lessonId);
            $sug = Library::suggest($uid, $title, 3);
            if (!$sug) {
                return [];
            }
            return DB::all('SELECT filename, LEFT(content, 9000) content FROM library WHERE user_id=? AND id IN (' . implode(',', array_column($sug, 'id')) . ')', [$uid]);
        } catch (\Throwable $e) {
            return [];
        }
    }

    public static function deck($lessonId)
    {
        $d = DB::one('SELECT slides FROM decks WHERE lesson_id=?', [$lessonId]);
        return $d ? (json_decode($d['slides'], true) ?: []) : [];
    }

    public static function meta($lessonId)
    {
        return DB::one('SELECT * FROM lesson_meta WHERE lesson_id=?', [$lessonId]) ?: [];
    }

    public static function setMeta($lessonId, array $f)
    {
        if (!DB::val('SELECT lesson_id FROM lesson_meta WHERE lesson_id=?', [$lessonId])) {
            DB::insert('lesson_meta', ['lesson_id' => $lessonId]);
        }
        DB::update('lesson_meta', $f, 'lesson_id=?', [$lessonId]);
    }

    public static function deckText(array $slides, $notesLen = 80)
    {
        if (!$slides) {
            return '（还没有课件）';
        }
        $t = '';
        foreach ($slides as $i => $s) {
            $t .= '第' . ($i + 1) . "页 [{$s['layout']}" . ($s['phase'] ? '/' . $s['phase'] : '') . "] {$s['title']}"
                . (!empty($s['image']) ? ' [已配图:' . ($s['image']['query_zh'] ?: $s['image']['query_en']) . ']' : '')
                . (($s['layout'] ?? '') === 'video' ? ' [老师生成的教学视频，' . (int)($s['video']['dur'] ?? 0) . '秒，请保留此页，不要修改或删除]' : '');
            if ($s['subtitle']) {
                $t .= " — {$s['subtitle']}";
            }
            foreach (['bullets', 'left', 'right', 'options'] as $k) {
                if (!empty($s[$k])) {
                    $t .= "\n   {$k}: " . implode(' | ', $s[$k]);
                }
            }
            if ($s['question']) {
                $t .= "\n   question: {$s['question']}  answer: {$s['answer']}";
            }
            if (!empty($s['diagram'])) {
                $dg = $s['diagram'];
                $t .= "\n   diagram[{$dg['type']}/" . ($dg['style'] ?? 'rounded') . ']' . (!empty($s['lead']) ? " 导语：{$s['lead']}" : '') . (!empty($dg['center']) ? " 中心：{$dg['center']}" : '') . "\n   items: " . implode(' | ', array_map(function ($x) {
                    return $x['t'] . (isset($x['d']) && $x['d'] !== '' ? '：' . $x['d'] : '') . (!empty($x['sub']) ? '（' . implode('、', $x['sub']) . '）' : '') . (!empty($x['u']) ? ' → ' . $x['u'] : '');
                }, $dg['items']));
            }
            if ($s['notes'] && $notesLen) {
                $t .= "\n   notes: " . mb_substr($s['notes'], 0, $notesLen) . (mb_strlen($s['notes']) > $notesLen ? '…' : '');
            }
            $t .= "\n";
        }
        return $t;
    }

    public static function planText($lesson, $full = false)
    {
        $m = self::meta($lesson['id']);
        $segs = Repo::segments($lesson['id']);
        $t = '';
        if (!empty($m['learner_text'])) {
            $t .= "学情分析：" . mb_substr($m['learner_text'], 0, $full ? 1500 : 300) . "\n";
        }
        if ($segs || !empty($m['objectives_text'])) {
            $t .= "教学目标：" . ($m['objectives_text'] ?? '') . "\n重点：{$lesson['key_points']}\n难点：{$lesson['difficult_points']}\n学生易错：{$lesson['misconceptions']}\n流程：\n";
            foreach ($segs as $s) {
                $t .= '  [' . $s['phase'] . ' ' . $s['minutes'] . "分钟] 教师：" . mb_substr($s['teacher_act'], 0, 100) . ' | 学生：' . mb_substr($s['student_act'], 0, 60) . "\n";
            }
        }
        if (!empty($m['content_text'])) {
            $t .= "学科专家的内容要点：\n" . mb_substr($m['content_text'], 0, $full ? 6000 : 600) . "\n";
        }
        return $t ?: '（还没有教学设计）';
    }

    public static function history($lessonId, $n = 10)
    {
        $rows = array_reverse(DB::all('SELECT role, agent, content FROM chat_messages WHERE lesson_id=? ORDER BY id DESC LIMIT ' . (int)$n, [$lessonId]));
        $team = self::team(true);
        $t = '';
        foreach ($rows as $r) {
            $who = $r['role'] === 'user' ? '老师' : ($team[$r['agent']]['name'] ?? '系统');
            $t .= "{$who}：" . mb_substr($r['content'], 0, 300) . "\n";
        }
        return $t ?: '（无）';
    }

    private static function header($lesson, $course)
    {
        return "课程：{$course['name']}" . ($course['audience'] ? "（授课对象：{$course['audience']}）" : '') . "\n本次课：{$lesson['title']}，时长 {$lesson['duration_min']} 分钟\n";
    }

    /** 交叉复核时强制使用的模型 */
    public static $force = null;

    /**
     * 成员使用哪家模型：管理员指定的优先；「自动」时，质量督导默认用与课件设计师不同的模型，
     * 让另一家模型来核查内容，更容易发现错误。
     */
    public static function providerFor($agent)
    {
        $avail = DeepSeek::available();
        if (!$avail) {
            return null;
        }
        $m = self::team(true)[$agent]['model'] ?? 'auto';
        if ($m !== 'auto' && in_array($m, $avail, true)) {
            return $m;
        }
        if ($agent === 'reviewer') {
            $r = setting('review_provider', 'same');
            if ($r !== 'same' && in_array($r, $avail, true)) {
                return $r;
            }
            $maker = self::providerFor('slides');
            foreach ($avail as $p) {
                if ($p !== $maker) {
                    return $p;
                }
            }
        }
        return $avail[0];
    }

    private static function call($agent, $prompt, $temp = 0.5, $max = 6000, $provider = null)
    {
        $provider = self::$force ?: ($provider ?: self::providerFor($agent));
        return DeepSeek::chat('agent_' . $agent, [['role' => 'system', 'content' => self::BASE], ['role' => 'user', 'content' => $prompt . self::extra($agent)]], true, $temp, $max, $provider);
    }

    private static function flat($v)
    {
        if (is_array($v)) {
            return implode("\n", array_map(function ($x) {
                return is_array($x) ? implode('：', array_map('strval', $x)) : (string)$x;
            }, $v));
        }
        return (string)$v;
    }

    /* ---------------- 组长 ---------------- */

    public static function leader($lesson, $course, $userMsg, $focus)
    {
        $team = self::team();
        $slides = self::deck($lesson['id']);
        $hasMat = (int)DB::val('SELECT COUNT(*) FROM materials WHERE lesson_id=?', [$lesson['id']]);
        $members = '';
        foreach ($team as $k => $m) {
            if ($k !== 'leader') {
                $members .= "- {$k} {$m['name']}：{$m['desc']}\n";
            }
        }
        $fast = array_values(array_intersect(['designer', 'slides', 'diagram', 'quiz', 'illustrator', 'reviewer'], array_keys($team)));
        $fine = array_values(array_intersect(['analyst', 'designer', 'expert', 'slides', 'diagram', 'case', 'quiz', 'illustrator', 'script', 'reviewer'], array_keys($team)));
        $prompt = self::header($lesson, $course)
            . "已上传资料：" . ($hasMat ? "{$hasMat} 份" : '无') . "\n"
            . "当前教学设计：\n" . self::planText($lesson) . "\n"
            . "当前课件（共" . count($slides) . "页）：\n" . mb_substr(self::deckText($slides, 0), 0, 3500) . "\n"
            . "最近对话：\n" . self::history($lesson['id']) . "\n"
            . ($focus ? "老师当前选中的是第 {$focus} 页。\n" : '')
            . "老师刚刚说：「{$userMsg}」\n\n"
            . "你是组长·小备，一位带过很多青年教师的资深教授。团队成员（只能从这里选）：\n{$members}\n"
            . "安排规则：\n"
            . "1. 从零生成完整课件且老师没有特别要求时，用快速流程：" . implode(' → ', $fast) . "；\n"
            . "2. 老师要求“精品/打磨/公开课/比赛/全员”时，用精品流程：" . implode(' → ', $fine) . "；\n"
            . "3. 局部修改只派最相关的 1–2 位，例如改文字派 slides、画结构图或把文字页改成图解派 diagram、换图派 illustrator、加讲稿派 script、加案例或思政派 case、加题派 quiz、查错派 reviewer；\n"
            . "4. 老师只是提问或闲聊时 steps 为空，直接在 reply 里回答；没有资料又要生成时可以根据课题生成，但提醒老师上传资料效果更好；\n"
            . "5. task 写成给该成员的具体指令，包含老师的原话和涉及的页码。reply 是你对老师说的一两句话。\n"
            . '输出：{"reply":"","steps":[{"agent":"designer","task":""}]}';
        $r = self::call('leader', $prompt, 0.3, 1500);
        if (!$r['ok']) {
            return $r;
        }
        $steps = [];
        foreach ((array)($r['json']['steps'] ?? []) as $s) {
            $a = $s['agent'] ?? '';
            if ($a !== 'leader' && isset($team[$a])) {
                $steps[] = ['agent' => $a, 'task' => (string)($s['task'] ?? $userMsg)];
            }
        }
        return ['ok' => true, 'reply' => (string)($r['json']['reply'] ?? '好的'), 'steps' => array_slice($steps, 0, 10)];
    }

    /* ---------------- 学情分析师 ---------------- */

    public static function analyst($lesson, $course, $task)
    {
        $prompt = self::header($lesson, $course)
            . "【老师的原始资料】" . (self::materials($lesson['id'], 12000) ?: '（未上传）') . "\n\n【任务】{$task}\n\n"
            . "你是学情分析师。结合授课对象、课程和本课内容，分析：1) 学生应具备的先修知识，以及哪些可能已经遗忘需要快速回顾；"
            . "2) 本课最可能卡住学生的 2–4 个地方及原因；3) 学生可能的学习兴趣点或与他们生活/专业相关的切入点；4) 对教学设计的具体建议（讲多深、从哪讲起、节奏）。"
            . "授课对象信息不足时，按该课程最常见的本科生情况分析，并在 message 里请老师补充学生情况。\n"
            . '输出：{"message":"给老师的两三句话","prerequisites":[""],"difficulties":[""],"interests":[""],"suggestions":[""]}';
        $r = self::call('analyst', $prompt, 0.4, 2500);
        if (!$r['ok']) {
            return $r;
        }
        $j = $r['json'];
        $txt = "先修知识：" . implode('；', (array)($j['prerequisites'] ?? [])) . "\n典型困难：" . implode('；', (array)($j['difficulties'] ?? []))
            . "\n兴趣切入点：" . implode('；', (array)($j['interests'] ?? [])) . "\n设计建议：" . implode('；', (array)($j['suggestions'] ?? []));
        self::setMeta($lesson['id'], ['learner_text' => $txt]);
        return ['ok' => true, 'message' => (string)($j['message'] ?? '学情分析已完成。'), 'detail' => $txt];
    }

    /* ---------------- 教学设计师 ---------------- */

    public static function designer($lesson, $course, $task)
    {
        $dur = (int)$lesson['duration_min'];
        $prompt = self::header($lesson, $course)
            . "【老师的原始资料】" . (self::materials($lesson['id']) ?: '（未上传，请根据课题和学科常识设计）') . "\n\n"
            . "【当前教学设计与学情】\n" . self::planText($lesson, true) . "\n"
            . "【任务】{$task}\n\n"
            . "你是教学设计师。用逆向设计 + BOPPPS 完成教学设计：\n"
            . "1. objectives：2–4 条可观测的学习目标（“学完能够……”，用说出/解释/计算/分析/设计等可检验的动词）；\n"
            . "2. segments：按 B导入、O目标、P1前测、P2参与式学习(可多段)、P3后测、S总结；minutes 之和必须等于 {$dur}；单段讲授不超过15分钟，至少一段学生动手/讨论；\n"
            . "3. misconceptions：学生最可能的误区和对策（参考学情分析）；\n"
            . "4. improvements：对比老师的原始资料，指出原资料在教学上可以改进的地方和你的调整（2–5条；没有资料则为空数组）；\n"
            . "5. message：两三句话告诉老师主要设计思路。\n"
            . '输出：{"message":"","objectives":[""],"key_points":"","difficult_points":"","misconceptions":"","ideology":"","homework":"",'
            . '"segments":[{"phase":"B","minutes":5,"teacher_act":"","student_act":"","assess_method":""}],"improvements":[{"issue":"","change":""}]}';
        $r = self::call('designer', $prompt, 0.5, 6000);
        if (!$r['ok']) {
            return $r;
        }
        $j = $r['json'];
        DB::tx(function () use ($lesson, $j) {
            DB::update('lessons', [
                'key_points' => self::flat($j['key_points'] ?? ''),
                'difficult_points' => self::flat($j['difficult_points'] ?? ''),
                'misconceptions' => self::flat($j['misconceptions'] ?? ''),
                'ideology' => self::flat($j['ideology'] ?? ''),
                'homework' => self::flat($j['homework'] ?? ''),
            ], 'id=?', [$lesson['id']]);
            $segs = (array)($j['segments'] ?? []);
            if ($segs) {
                DB::exec('DELETE FROM lesson_segments WHERE lesson_id=?', [$lesson['id']]);
                foreach ($segs as $i => $s) {
                    $ph = strtoupper((string)($s['phase'] ?? 'P2'));
                    DB::insert('lesson_segments', [
                        'lesson_id' => $lesson['id'], 'sort' => $i,
                        'phase' => array_key_exists($ph, phases()) ? $ph : 'P2',
                        'minutes' => max(0, (int)($s['minutes'] ?? 0)),
                        'teacher_act' => (string)($s['teacher_act'] ?? ''),
                        'student_act' => (string)($s['student_act'] ?? ''),
                        'assess_method' => mb_substr((string)($s['assess_method'] ?? ''), 0, 200),
                    ]);
                }
            }
            self::setMeta($lesson['id'], [
                'objectives_text' => implode("\n", array_map('strval', (array)($j['objectives'] ?? []))),
                'improve_report' => json_encode((array)($j['improvements'] ?? []), JSON_UNESCAPED_UNICODE),
            ]);
        });
        $sum = 0;
        foreach ((array)($j['segments'] ?? []) as $s) {
            $sum += (int)($s['minutes'] ?? 0);
        }
        $msg = (string)($j['message'] ?? '教学设计已完成。');
        if ($sum && $sum !== $dur) {
            $msg .= "\n（提示：环节时间合计 {$sum} 分钟，与 {$dur} 分钟不一致，可以让我调整。）";
        }
        return ['ok' => true, 'message' => $msg, 'detail' => "学习目标：\n" . implode("\n", array_map('strval', (array)($j['objectives'] ?? []))) . "\n重点：" . self::flat($j['key_points'] ?? '') . "\n难点：" . self::flat($j['difficult_points'] ?? '')];
    }

    /* ---------------- 学科专家 ---------------- */

    public static function expert($lesson, $course, $task)
    {
        $prompt = self::header($lesson, $course)
            . "【老师的原始资料】" . (self::materials($lesson['id']) ?: '（未上传）') . "\n\n"
            . "【教学设计】\n" . self::planText($lesson) . "\n【任务】{$task}\n\n"
            . "你是这门学科的资深教授。为本课整理“内容要点”，供课件设计师和讲稿撰写师使用：\n"
            . "1. concepts：核心概念的准确表述（定义、条件、适用范围），注意区分易混概念；\n"
            . "2. derivations：关键推导或论证的步骤要点（如有）；\n"
            . "3. examples：1–3 道典型例题或示例，给出完整解答，计算请自行验算；\n"
            . "4. frontier：与本课相关的学科前沿、新进展或工程应用（1–2 条，只写你确信真实存在的，不要编造论文、数据或人名）；\n"
            . "5. corrections：如果老师的原始资料中有表述不准确或过时的地方，指出原文和正确说法。\n"
            . '输出：{"message":"给老师的两三句话","concepts":[""],"derivations":[""],"examples":[{"question":"","answer":""}],"frontier":[""],"corrections":[{"original":"","correct":""}]}';
        $r = self::call('expert', $prompt, 0.3, 6000);
        if (!$r['ok']) {
            return $r;
        }
        $j = $r['json'];
        $txt = "【核心概念】\n" . implode("\n", (array)($j['concepts'] ?? [])) . "\n【推导要点】\n" . implode("\n", (array)($j['derivations'] ?? []))
            . "\n【典型例题】\n" . implode("\n", array_map(function ($e) {
                return is_array($e) ? '题：' . ($e['question'] ?? '') . "\n解：" . ($e['answer'] ?? '') : (string)$e;
            }, (array)($j['examples'] ?? []))) . "\n【学科前沿】\n" . implode("\n", (array)($j['frontier'] ?? []));
        $cor = (array)($j['corrections'] ?? []);
        if ($cor) {
            $txt .= "\n【原资料需修正】\n" . implode("\n", array_map(function ($c) {
                return '原文：' . ($c['original'] ?? '') . ' → 应为：' . ($c['correct'] ?? '');
            }, $cor));
        }
        self::setMeta($lesson['id'], ['content_text' => $txt]);
        $msg = (string)($j['message'] ?? '内容要点已整理。');
        if ($cor) {
            $msg .= "\n⚠ 发现原资料中有 " . count($cor) . " 处表述需要修正，详见任务详情。";
        }
        return ['ok' => true, 'message' => $msg, 'detail' => $txt];
    }

    /* ---------------- 制作类成员（直接修改课件） ---------------- */

    const SLIDE_SCHEMA = 'slide 对象格式：{"layout":"title|objectives|bullets|two|diagram|quiz|section|summary","phase":"B|O|P1|P2|P3|S","title":"","subtitle":"","bullets":[],"left_title":"","left":[],"right_title":"","right":[],"question":"","options":[],"answer":"","lead":"","diagram":null,"notes":"讲稿备注"}。layout=diagram 是结构图页：lead 为一句导语（≤30字，说出这张图的结论），diagram={"type":"版式","style":"rounded|square|flat","items":[{"t":"标题","d":"一行说明","sub":["子条目"]}],"center":"中心词/结论","note":"底部一句话","hi":重点条目序号(从0起，可省略)}。';

    /** 结构图版式说明（给 AI 选型用） */
    private static function diagramGuide()
    {
        $t = "【结构图版式（按信息结构选，不要每页都用同一种）】\n";
        foreach (SlideController::DIAGRAMS as $k => $v) {
            $t .= "- {$k}（{$v[0]}）：{$v[1]}，{$v[2]}–{$v[3]} 条\n";
        }
        return $t . "各版式字段用法：flow/cycle/timeline/matrix/hub/pyramid/funnel 用 items[{t,d}]（timeline 的 t 写时间、pyramid/funnel 自上而下）；cycle、hub 的 center 写中心词；compare 用 2 个 items，每个写 t 和 sub[3–5条]；pillars 用 center 写顶部结论、items 为支柱、note 写地基；kpi 的 t 写数字（如 92%）、d 写指标名，可加 note；tree 用 center 写总概念、items[{t,sub}]；layers 自上而下 items[{t:层名,sub:模块}]；pipeline 用 cols 三个栏名、items[{t,d,u}]。\n";
    }
    const OPS_RULE = '修改方式二选一：mode="replace" 时给出完整 slides 数组（从零制作或大改时用）；mode="patch" 时给出 ops 数组，页码均指【当前课件】中的页码（从1开始）：{"op":"update","index":3,"slide":{只写需要改的字段}} 修改第3页；{"op":"insert","after":3,"slide":{...}} 在第3页后插入（after=0 表示插到最前）；{"op":"delete","index":5} 删除第5页。小改动必须用 patch，不要动无关页面。';

    private static function roleText($agent)
    {
        $t = [
            'slides' => '你是课件设计师。原则：一页一个核心观点；bullets 每条不超过25字、每页不超过5条；详细讲解写进 notes（80–150字）；对比内容用 two 布局；流程、层级、分类等有结构关系的内容可以直接用 diagram 结构图页（结构图设计师随后还会优化）；第1页 title、第2页 objectives、最后一页 summary；页数与课时匹配（约每 3–5 分钟一页）；每页标 phase，顺序与教学设计一致；优先使用学科专家整理的准确表述和例题。',
            'case' => '你是案例与思政设计师。为本课加入 1–2 个真实的行业案例或应用场景（导入或讲授环节），说明它与知识点的关系；把课程思政自然融入案例本身（如科学精神、工程伦理、国家需求、职业责任），不要单独喊口号。只能使用你确信真实的案例，不编造具体数据和人物言论。用 patch 插入或修改页面，并在 lesson_updates.ideology 中写下思政融入点。',
            'quiz' => '你是互动与评价设计师。设计课堂互动：导入提问、课前小测(P1)、课中思考题、课堂检测(P3)。用 quiz 布局（question、options 4个、answer 只写在 answer 字段不会显示在幻灯片上），题目考查理解和应用，干扰项来自学生常见误区，用 patch 插入到合适位置，不改其他页面。同时在 bank 中给出 3–6 道可入题库的题（含课后练习），在 lesson_updates.homework 中写课后作业。',
            'script' => '你是讲稿撰写师，一位讲课很受学生欢迎的老教师。为每一页写授课讲稿放进 notes：开头写建议时长（如“【约3分钟】”），然后是讲解要点、与上一页的过渡语、要问学生的问题及预期回答。语言口语化、可直接照着讲，每页 120–250 字。用 patch 的 update 只修改 notes 字段，不改动页面其他内容。同时在 lesson_updates.board 中设计板书（主板书结构，用缩进表示层次）。',
            'diagram' => '你是结构图设计师（信息设计专家）。通读当前课件，找出内容本身有结构关系、用图比用文字更好懂的页面（步骤、循环、时间演进、对比、并列要点、层级、分类、中心与关联等），用 patch 的 update 把它们改成 layout=diagram（保留 title、phase、notes，原来的文字信息要完整搬进图里，放不下的细节补进 notes）；必要时也可以 insert 新的结构图页。硬性规则：①按信息结构选版式，见下方版式表；②封面、学习目标、课堂提问、小结页不要改；③相邻两页不能用同一种版式；整套课件结构图 ≥4 张时至少用 3 种版式，matrix 和 flow 合计不超过一半；④每个条目必须有标题和一行说明（或子条目），禁止只有两个字的空壳卡片；⑤同一套课件所有结构图用同一种 style（默认 rounded）；⑥lead 写一句点明结论的导语；⑦一般改 2–5 页即可，不要把所有页都变成图。',
            'reviewer' => '你是质量督导（资深教学督导 + 学科专家）。逐页核查：①科学性：概念、公式、数据是否准确，与原始资料和学科常识是否一致；②完整性：是否遗漏资料中的重要内容；③教学性：目标-内容-检测是否对应，文字是否过多，难点有没有讲透的设计。发现问题直接用 patch 修正；message 中按“发现的问题 → 已做的修改”列出结论；没有问题 ops 为空。',
        ];
        return $t[$agent] ?? $t['slides'];
    }

    public static function slides($lesson, $course, $task, $agent = 'slides')
    {
        $slides = self::deck($lesson['id']);
        $prompt = self::header($lesson, $course)
            . "【老师的原始资料】" . (self::materials($lesson['id'], $agent === 'reviewer' ? 24000 : 14000) ?: '（未上传）') . "\n\n"
            . "【教学设计与内容要点】\n" . self::planText($lesson, in_array($agent, ['slides', 'script', 'reviewer'], true)) . "\n"
            . "【当前课件】\n" . self::deckText($slides, $agent === 'script' ? 0 : 80) . "\n"
            . "【任务】{$task}\n\n"
            . self::roleText($agent) . "\n" . self::SLIDE_SCHEMA . "\n" . (in_array($agent, ['slides', 'diagram', 'reviewer'], true) ? self::diagramGuide() : '') . self::OPS_RULE . "\n"
            . 'message 用一两句话告诉老师你做了什么。输出：{"message":"","mode":"patch","slides":[],"ops":[],"lesson_updates":{},"bank":[{"qtype":"单选","stem":"","options":[],"answer":"","analysis":""}]}';
        $r = self::call($agent, $prompt, $agent === 'reviewer' ? 0.2 : 0.5, 12000);
        $used = DeepSeek::$last['provider'] ?? '';
        if (!$r['ok']) {
            return $r;
        }
        $j = $r['json'];
        $mode = ($j['mode'] ?? '') === 'replace' || !$slides ? 'replace' : 'patch';
        if ($mode === 'replace' && in_array($agent, ['script', 'quiz', 'case', 'reviewer'], true) && $slides) {
            $mode = 'patch'; // 这些成员只能局部修改，防止整套被替换
        }
        if ($mode === 'replace') {
            $new = SlideController::normalize((array)($j['slides'] ?? []));
            if (!$new && $slides) {
                $new = $slides;
            }
            // 保留原有配图（标题相同的页）
            foreach ($new as &$ns) {
                foreach ($slides as $os) {
                    if (!empty($os['image']) && $os['title'] === $ns['title']) {
                        $ns['image'] = $os['image'];
                    }
                }
            }
            unset($ns);
            $new = self::keepVideos($slides, $new);
        } else {
            $new = self::applyOps($slides, (array)($j['ops'] ?? []));
        }
        $changed = json_encode($new, JSON_UNESCAPED_UNICODE) !== json_encode($slides, JSON_UNESCAPED_UNICODE);
        $team = self::team(true);
        if ($changed) {
            self::saveDeck($lesson['id'], $new, $team[$agent]['name'] . '：' . mb_substr($task, 0, 60));
        }
        $extra = [];
        $lu = (array)($j['lesson_updates'] ?? []);
        if (!empty($lu['ideology'])) {
            DB::update('lessons', ['ideology' => self::flat($lu['ideology'])], 'id=?', [$lesson['id']]);
            $extra[] = '思政融入点已写入教学设计';
        }
        if (!empty($lu['homework'])) {
            DB::update('lessons', ['homework' => self::flat($lu['homework'])], 'id=?', [$lesson['id']]);
            $extra[] = '课后作业已写入教学设计';
        }
        if (!empty($lu['board'])) {
            self::setMeta($lesson['id'], ['board_text' => self::flat($lu['board'])]);
            $extra[] = '板书设计已完成';
        }
        $saved = 0;
        if ($agent === 'quiz') {
            foreach ((array)($j['bank'] ?? []) as $q) {
                $stem = trim((string)($q['stem'] ?? ''));
                if ($stem === '') {
                    continue;
                }
                $opts = $q['options'] ?? '';
                DB::insert('questions', [
                    'course_id' => $course['id'], 'objective_id' => null, 'bloom' => min(6, max(1, (int)($q['bloom'] ?? 3))),
                    'qtype' => mb_substr((string)($q['qtype'] ?? '简答'), 0, 20), 'stem' => $stem,
                    'options' => is_array($opts) ? implode("\n", $opts) : (string)$opts,
                    'answer' => (string)($q['answer'] ?? ''), 'analysis' => (string)($q['analysis'] ?? ''),
                    'score' => max(1, (float)($q['score'] ?? 5)), 'source' => 'AI',
                ]);
                $saved++;
            }
            if ($saved) {
                $extra[] = "{$saved} 道题已存入「{$course['name']}」题库";
            }
        }
        $msg = (string)($j['message'] ?? '已完成') . ($extra ? "\n（" . implode('；', $extra) . '）' : '');
        if (!empty($r['partial'])) {
            if ($mode === 'replace') {
                $msg = '先做好了前 ' . count($new) . ' 页课件' . ($extra ? '（' . implode('；', $extra) . '）' : '') . '。';
            }
            $msg .= "\n（这次内容较长，超出了单次输出上限，已保留完整生成的部分" . ($mode === 'replace' ? '，共 ' . count($new) . ' 页' : '') . '。可以接着说“继续完成剩余页面”。）';
        }
        $detail = '';
        if (!$changed && $mode === 'patch' && empty($j['ops'])) {
            $detail = '没有修改课件页面。';
        } else {
            $detail = $mode === 'replace' ? '重新制作了整套课件，共 ' . count($new) . ' 页' : '修改操作：' . implode('；', array_map(function ($o) {
                $t = $o['op'] ?? '';
                return $t === 'update' ? '修改第' . ($o['index'] ?? '?') . '页' : ($t === 'insert' ? '在第' . ($o['after'] ?? '?') . '页后插入「' . ($o['slide']['title'] ?? '') . '」' : ($t === 'delete' ? '删除第' . ($o['index'] ?? '?') . '页' : $t));
            }, (array)($j['ops'] ?? [])));
        }
        $res = ['ok' => true, 'message' => $msg, 'detail' => $detail, 'changed' => $changed];
        // 交叉复核：再请另一家模型独立检查一遍（两家模型背景知识不同，互相纠错）
        if ($agent === 'reviewer' && !self::$force && setting('cross_review', '1') === '1') {
            $second = null;
            foreach (DeepSeek::available() as $p) {
                if ($p !== $used) {
                    $second = $p;
                    break;
                }
            }
            if ($second) {
                $m1 = DeepSeek::$last['model'];
                self::$force = $second;
                try {
                    $r2 = self::slides($lesson, $course, '【交叉复核】上一位质量督导（' . (DeepSeek::providers()[$used]['name'] ?? '另一模型') . '）已经核查并修改过课件。请你独立再查一遍：'
                        . '重点找概念、定义、公式、数据、年代、人名等事实性错误，以及上一位改错或漏掉的地方；对有把握的问题直接修改，没有把握的不要改。没有发现问题就不要修改，message 里说明“复核未发现问题”。原任务：' . $task, 'reviewer');
                } finally {
                    self::$force = null;
                }
                if (!empty($r2['ok'])) {
                    $res['message'] .= "\n【交叉复核 · " . DeepSeek::providers()[$second]['name'] . '】' . $r2['message'];
                    $res['detail'] .= "\n交叉复核：" . $r2['detail'];
                    $res['changed'] = $res['changed'] || !empty($r2['changed']);
                }
                DeepSeek::$last['model'] = $m1 . ' + 复核 ' . DeepSeek::$last['model'];
            }
        }
        return $res;
    }

    /* ---------------- 配图师 ---------------- */

    public static function illustrator($lesson, $course, $task)
    {
        $slides = self::deck($lesson['id']);
        if (!$slides) {
            return ['ok' => false, 'error' => '还没有课件，无法配图'];
        }
        if (!Images::sources()) {
            return ['ok' => true, 'message' => '系统设置里关闭了自动配图，这一步跳过。'];
        }
        $max = max(2, min(8, (int)ceil(count($slides) / 3)));
        $prompt = self::header($lesson, $course)
            . "【当前课件】\n" . self::deckText($slides, 0) . "\n【任务】{$task}\n\n"
            . "你是配图师。选出最适合配“真实照片”的页面（最多 {$max} 页）：封面、导入情境、生活/工程案例、应用场景最适合；"
            . "公式、代码、定义、流程图、对比表这类抽象内容不要配照片；只能选 layout 为 title、bullets、objectives、summary、section 的页面。"
            . "已配图的页面跳过，除非任务明确要求为该页换图（换图时给出与原图不同的关键词）；任务要求去掉某页图片时放进 remove。\n"
            . "每项给出：index（页码）、query_en（2–5 个英文关键词，描述画面中看得见的东西，例如 \"library bookshelf books\"，不要写抽象概念）、query_zh（中文关键词）、"
            . "ai_prompt（找不到照片时用 AI 生成的中文画面描述，写实摄影风格，画面中不要出现文字）、why（为什么这页配这张图）。\n"
            . '输出：{"message":"","images":[{"index":1,"query_en":"","query_zh":"","ai_prompt":"","why":""}],"remove":[]}';
        $r = self::call('illustrator', $prompt, 0.4, 2000);
        if (!$r['ok']) {
            return $r;
        }
        $j = $r['json'];
        $ok = ['title', 'bullets', 'objectives', 'summary', 'section'];
        $want = [];
        foreach ((array)($j['images'] ?? []) as $w) {
            $i = (int)($w['index'] ?? 0);
            if ($i >= 1 && $i <= count($slides) && in_array($slides[$i - 1]['layout'], $ok, true) && !isset($want[$i])) {
                $prevPage = !empty($slides[$i - 1]['image']) ? (int)$slides[$i - 1]['image']['page'] : 0;
                $want[$i] = [
                    'query_en' => trim((string)($w['query_en'] ?? '')), 'query_zh' => trim((string)($w['query_zh'] ?? '')),
                    'ai_prompt' => trim((string)($w['ai_prompt'] ?? '')), 'page' => $prevPage ? $prevPage + 1 : 1,
                ];
            }
        }
        $want = array_slice($want, 0, $max, true);
        $new = $slides;
        $removed = [];
        foreach ((array)($j['remove'] ?? []) as $ri) {
            $ri = (int)$ri;
            if (isset($new[$ri - 1]) && !empty($new[$ri - 1]['image'])) {
                $new[$ri - 1]['image'] = null;
                $removed[] = $ri;
            }
        }
        list($found, $bySrc, $miss) = self::fetchImages($lesson['id'], $want);
        foreach ($found as $i => $img) {
            $new[$i - 1]['image'] = $img;
        }
        foreach ($new as &$sl) {
            if (!empty($sl['image']) && strpos($sl['notes'], '图片来源') === false) {
                $sl['notes'] = trim($sl['notes'] . "\n（图片来源：" . $sl['image']['credit'] . '）');
            }
        }
        unset($sl);
        if ($found || $removed) {
            self::saveDeck($lesson['id'], $new, '配图师：' . mb_substr($task, 0, 60));
        }
        $got = array_keys($found);
        sort($got);
        $names = ['pexels' => 'Pexels 图库', 'pixabay' => 'Pixabay 图库', 'openverse' => 'Openverse 图库', 'wanx' => '通义万相 AI 生成', 'minimax' => 'MiniMax AI 生成'];
        $parts = [];
        if ($got) {
            $parts[] = '为第 ' . implode('、', $got) . ' 页配了图（' . implode('，', array_map(function ($k, $v) use ($names) {
                return ($names[$k] ?? $k) . " {$v} 张";
            }, array_keys($bySrc), $bySrc)) . '）';
        }
        if ($removed) {
            $parts[] = '去掉了第 ' . implode('、', $removed) . ' 页的图片';
        }
        if ($miss) {
            sort($miss);
            $parts[] = '第 ' . implode('、', $miss) . ' 页没有找到合适的图片（可以在该页点“换图”或上传自己的图）';
        }
        if (!$want && !$removed) {
            $parts[] = '这次没有需要配图的页面';
        }
        $detail = implode("\n", array_map(function ($i, $w) use ($found) {
            return "第{$i}页：{$w['query_zh']}（{$w['query_en']}）" . (isset($found[$i]) ? ' → ' . $found[$i]['credit'] : ' → 未找到');
        }, array_keys($want), $want));
        $msg = trim((string)($j['message'] ?? ''));
        return ['ok' => true, 'message' => ($msg ? $msg . "\n" : '') . implode('；', $parts) . '。', 'detail' => $detail];
    }

    /**
     * 为多页找图：先依次搜图库，剩余的用通义万相并行生成
     * @return array [index=>image, 来源计数, 未找到的页码]
     */
    public static function fetchImages($lessonId, array $want)
    {
        $found = [];
        $bySrc = [];
        $miss = [];
        $needAi = [];
        $srcs = Images::sources();
        foreach ($want as $i => $w) {
            $img = null;
            foreach ($srcs as $src) {
                if ($src === 'ai') {
                    continue;
                }
                foreach (array_slice(Images::search($src, $w['query_en'], $w['query_zh'], $w['page']), 0, 3) as $cand) {
                    if ($im = Images::download($lessonId, $cand['url'])) {
                        $img = $im + ['credit' => $cand['credit'], 'link' => $cand['link'], 'source' => $src] + $w;
                        break 2;
                    }
                }
            }
            if ($img) {
                $found[$i] = SlideController::cleanImage($img);
                $bySrc[$img['source']] = ($bySrc[$img['source']] ?? 0) + 1;
            } elseif (in_array('ai', $srcs, true)) {
                $needAi[$i] = $w['ai_prompt'] ?: ($w['query_zh'] . '，写实摄影风格，画面中没有文字');
            } else {
                $miss[] = $i;
            }
        }
        if ($needAi) {
            $urls = Images::aiBatch($needAi);
            foreach ($needAi as $i => $pr) {
                $im = !empty($urls[$i]) ? Images::download($lessonId, $urls[$i]) : null;
                if ($im) {
                    $found[$i] = SlideController::cleanImage($im + ['credit' => Images::aiCredit(), 'source' => Images::aiProvider()] + $want[$i]);
                    $bySrc[Images::aiProvider()] = ($bySrc[Images::aiProvider()] ?? 0) + 1;
                } else {
                    $miss[] = $i;
                }
            }
        }
        return [$found, $bySrc, $miss];
    }

    /* ---------------- 课件存取 ---------------- */

    /** 整套重做时，老师生成的视频页按原位置保留（视频花钱又花时间，不能被 AI 顺手丢掉） */
    public static function keepVideos(array $old, array $new)
    {
        $have = [];
        foreach ($new as $s) {
            if (!empty($s['video']['id'])) {
                $have[$s['video']['id']] = true;
            }
        }
        foreach ($old as $k => $s) {
            if (($s['layout'] ?? '') === 'video' && !empty($s['video']['id']) && empty($have[$s['video']['id']])) {
                array_splice($new, min($k, count($new)), 0, [$s]);
            }
        }
        return array_slice($new, 0, 60);
    }

    /** 以原页码为基准应用 patch */
    public static function applyOps(array $slides, array $ops)
    {
        $n = count($slides);
        $upd = [];
        $del = [];
        $ins = [];
        foreach ($ops as $op) {
            $t = $op['op'] ?? '';
            if ($t === 'update' && isset($op['index'], $op['slide'])) {
                $i = (int)$op['index'];
                if ($i >= 1 && $i <= $n) {
                    $base = $upd[$i] ?? $slides[$i - 1];
                    $u = SlideController::normalize([array_merge($base, (array)$op['slide'])]);
                    if (!array_key_exists('image', (array)$op['slide'])) {
                        $u[0]['image'] = $base['image'] ?? null;
                    }
                    $upd[$i] = $u[0];
                }
            } elseif ($t === 'delete' && isset($op['index'])) {
                $del[(int)$op['index']] = true;
            } elseif ($t === 'insert' && isset($op['slide'])) {
                $a = max(0, min($n, (int)($op['after'] ?? $n)));
                $s = SlideController::normalize([(array)$op['slide']]);
                if ($s) {
                    $ins[$a][] = $s[0];
                }
            }
        }
        $out = [];
        foreach ($ins[0] ?? [] as $s) {
            $out[] = $s;
        }
        for ($i = 1; $i <= $n; $i++) {
            if (empty($del[$i])) {
                $out[] = $upd[$i] ?? $slides[$i - 1];
            }
            foreach ($ins[$i] ?? [] as $s) {
                $out[] = $s;
            }
        }
        return array_slice($out, 0, 60);
    }

    public static function saveDeck($lessonId, array $slides, $note)
    {
        $old = DB::one('SELECT slides, theme FROM decks WHERE lesson_id=?', [$lessonId]);
        if ($old && trim((string)$old['slides']) !== '[]') {
            DB::insert('deck_versions', ['lesson_id' => $lessonId, 'slides' => $old['slides'], 'note' => mb_substr($note, 0, 200)]);
            DB::exec('DELETE FROM deck_versions WHERE lesson_id=? AND id NOT IN (SELECT id FROM (SELECT id FROM deck_versions WHERE lesson_id=? ORDER BY id DESC LIMIT 30) t)', [$lessonId, $lessonId]);
        }
        DB::query('INSERT INTO decks (lesson_id, theme, slides) VALUES (?,?,?) ON DUPLICATE KEY UPDATE slides=VALUES(slides)', [
            $lessonId, $old['theme'] ?? 'blue', json_encode($slides, JSON_UNESCAPED_UNICODE),
        ]);
    }

    /* ---------------- 课件体检（确定性规则，不依赖 AI） ---------------- */

    public static function health(array $slides, $minutes)
    {
        $out = [];
        $n = count($slides);
        if (!$n) {
            return [];
        }
        $per = $minutes / max(1, $n);
        if ($per < 2) {
            $out[] = ['warn', "共 {$n} 页，平均每页不到 2 分钟，可能讲不完或节奏过快。"];
        } elseif ($per > 8) {
            $out[] = ['warn', "共 {$n} 页，平均每页超过 8 分钟，内容可能偏少或讲授过长。"];
        }
        $quiz = 0;
        $img = 0;
        $noNotes = 0;
        $layouts = [];
        foreach ($slides as $i => $s) {
            $layouts[$s['layout']] = true;
            if ($s['layout'] === 'quiz') {
                $quiz++;
            }
            if (!empty($s['image'])) {
                $img++;
            }
            if (trim($s['notes']) === '' && $s['layout'] !== 'title') {
                $noNotes++;
            }
            $b = array_merge($s['bullets'], $s['left'], $s['right']);
            $long = 0;
            foreach ($b as $x) {
                if (mb_strlen($x) > 32) {
                    $long++;
                }
            }
            if (count($s['bullets']) > 6 || $long >= 2) {
                $out[] = ['warn', '第' . ($i + 1) . '页文字偏多，学生不容易抓重点，可以精简并把细节放进讲稿。'];
            }
            if (in_array($s['layout'], ['bullets', 'two', 'objectives', 'summary'], true) && !$b) {
                $out[] = ['warn', '第' . ($i + 1) . '页没有内容。'];
            }
        }
        // 结构图多页防单调规则（改编自 pptx-compose-skill）
        $dg = [];
        foreach ($slides as $i => $s) {
            if (($s['layout'] ?? '') === 'diagram' && !empty($s['diagram']['type'])) {
                $dg[] = [$i, $s['diagram']['type'], $s['diagram']['style'] ?? 'rounded'];
            }
        }
        $names = SlideController::DIAGRAMS;
        for ($k = 1; $k < count($dg); $k++) {
            if ($dg[$k][0] === $dg[$k - 1][0] + 1 && $dg[$k][1] === $dg[$k - 1][1]) {
                $out[] = ['warn', '第' . ($dg[$k - 1][0] + 1) . '、' . ($dg[$k][0] + 1) . '页连续使用了同一种结构图（' . $names[$dg[$k][1]][0] . '），换一种版式会更清楚。'];
            }
        }
        if (count($dg) >= 4) {
            $types = array_count_values(array_column($dg, 1));
            if (count($types) < 3) {
                $out[] = ['warn', '有 ' . count($dg) . ' 张结构图，但只用了 ' . count($types) . ' 种版式，显得单调；建议至少用 3 种。'];
            }
            if (($types['matrix'] ?? 0) + ($types['flow'] ?? 0) > count($dg) / 2) {
                $out[] = ['info', '一半以上的结构图都是“并列卡片”或“流程”，可以按内容换成时间轴、对照、层级等版式。'];
            }
        }
        if (count(array_unique(array_column($dg, 2))) > 1) {
            $out[] = ['info', '结构图用了不止一种风格，建议整套统一。'];
        }
        if (!$quiz) {
            $out[] = ['warn', '整套课件没有课堂提问或测验页，学生参与偏少。'];
        }
        if (empty($layouts['objectives'])) {
            $out[] = ['info', '没有“学习目标”页，开课时告诉学生本节学完能做什么，有助于聚焦。'];
        }
        if (empty($layouts['summary'])) {
            $out[] = ['info', '没有“小结”页。'];
        }
        if ($noNotes > $n / 2) {
            $out[] = ['info', "有 {$noNotes} 页没有讲稿备注，可以让讲稿撰写师补上。"];
        }
        if (!$img && $n >= 5) {
            $out[] = ['info', '整套课件没有图片，可以让配图师为导入和案例页配上真实照片。'];
        }
        if (!$out) {
            $out[] = ['ok', '页数、文字量、互动、讲稿、配图和结构图都比较合理。'];
        }
        return $out;
    }
}
