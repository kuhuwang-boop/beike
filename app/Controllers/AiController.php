<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Services\Analytics;
use App\Services\DeepSeek;
use App\Services\Repo;

/**
 * 所有 AI 功能。原则：
 * 1. AI 只产出“草稿”，由教师确认后才写入；
 * 2. 要求 AI 引用大纲原文作为依据，服务器逐条核对引用是否真实存在；
 * 3. 结构化 JSON 输出，便于程序再做确定性检查。
 */
class AiController
{
    const SYS = '你是一位有20年经验的高校教学设计专家，熟悉OBE成果导向、逆向设计(UbD)、BOPPPS教学模型、修订版布鲁姆认知目标分类、课程思政和专业认证要求。你的输出将直接用于真实课堂，必须具体、可操作、符合学科事实；不确定的内容宁可不写也不要编造。只输出JSON。';

    private function syllabus($course, $limit = 12000)
    {
        $s = trim((string)$course['syllabus']);
        return $s === '' ? '（教师尚未粘贴课程大纲）' : mb_substr($s, 0, $limit);
    }

    private function courseHeader($course)
    {
        return "课程：{$course['name']}\n授课对象：" . ($course['audience'] ?: '未填写') . "\n学分/学时：{$course['credits']}/{$course['hours']}\n";
    }

    private function fail($r)
    {
        json_out(['error' => $r['error']], 502);
    }

    /** 核对引用 */
    private function verify($quotes, $source)
    {
        $out = [];
        foreach ((array)$quotes as $q) {
            $q = trim((string)$q);
            if ($q !== '') {
                $out[] = ['quote' => $q, 'ok' => evidence_in($q, $source)];
            }
        }
        return $out;
    }

    public function ping()
    {
        release_session();
        $p = (string)(json_body()['provider'] ?? DeepSeek::provider());
        if (!isset(DeepSeek::providers()[$p])) {
            $p = DeepSeek::provider();
        }
        $r = DeepSeek::chat('ping', [['role' => 'user', 'content' => '只回复JSON：{"ok":true}']], true, 0, 20, $p);
        if (!$r['ok']) {
            $this->fail($r);
        }
        json_out(['ok' => true, 'model' => DeepSeek::$last['model']]);
    }

    /** 从大纲提取课程目标 */
    public function objectives($courseId)
    {
        release_session();
        $course = Auth::course($courseId);
        if (trim((string)$course['syllabus']) === '') {
            json_out(['error' => '请先在「编辑课程」中粘贴教学大纲原文，AI 才能据此提取目标。'], 400);
        }
        $prompt = $this->courseHeader($course) . "\n【课程教学大纲原文】\n" . $this->syllabus($course) . "\n\n"
            . "任务：从大纲中提取或归纳 3–6 条课程目标(CLO)。要求：\n"
            . "1. 每条以可观测的行为动词开头（如“能够分析…”“能够设计…”），避免“了解、掌握”这类不可测动词；\n"
            . "2. bloom 为修订版布鲁姆层级 1记忆 2理解 3应用 4分析 5评价 6创造，须与动词一致；\n"
            . "3. weight 为该目标在课程考核中的权重百分比，合计必须等于100；\n"
            . "4. evidence 必须是从上面大纲中**逐字复制**的一句原文（10–60字），作为该目标的依据；\n"
            . "5. grad_req 如大纲提到对应的毕业要求指标点编号则填写，否则留空。\n"
            . '输出格式：{"objectives":[{"code":"CO1","content":"...","bloom":4,"weight":30,"evidence":"...","grad_req":""}]}';
        $r = DeepSeek::chat('objectives', [['role' => 'system', 'content' => self::SYS], ['role' => 'user', 'content' => $prompt]], true, 0.3);
        if (!$r['ok']) {
            $this->fail($r);
        }
        $list = [];
        $sum = 0;
        foreach ((array)($r['json']['objectives'] ?? []) as $o) {
            $o['bloom'] = min(6, max(1, (int)($o['bloom'] ?? 2)));
            $o['weight'] = (float)($o['weight'] ?? 0);
            $o['evidence_ok'] = evidence_in($o['evidence'] ?? '', $course['syllabus']);
            $sum += $o['weight'];
            $list[] = $o;
        }
        json_out(['objectives' => $list, 'weight_sum' => $sum]);
    }

    /** 生成教案草稿（BOPPPS） */
    public function lessonDraft($lessonId)
    {
        release_session();
        $lesson = Auth::lesson($lessonId);
        $course = Auth::course($lesson['course_id']);
        $b = json_body();
        $objs = Repo::objectives($course['id']);
        $sel = array_map('intval', (array)($b['objective_ids'] ?? []));
        $objText = '';
        $codeToId = [];
        foreach ($objs as $o) {
            $codeToId[$o['code']] = (int)$o['id'];
            if (in_array((int)$o['id'], $sel, true)) {
                $objText .= "- {$o['code']}（" . bloom_name($o['bloom']) . "）：{$o['content']}\n";
            }
        }
        if ($objText === '') {
            json_out(['error' => '请先勾选本课次要达成的课程目标（逆向设计：先定目标再设计活动）。'], 400);
        }
        $dur = max(10, (int)($b['duration'] ?? $lesson['duration_min']));
        $title = trim((string)($b['title'] ?? $lesson['title']));
        $extra = trim((string)($b['extra'] ?? ''));
        $reflect = trim((string)$lesson['reflection']);

        $prompt = $this->courseHeader($course)
            . "\n【课程教学大纲原文（节选）】\n" . $this->syllabus($course, 8000) . "\n\n"
            . "【本课次】{$title}，时长 {$dur} 分钟\n【本课次要达成的课程目标】\n{$objText}"
            . ($reflect ? "\n【上一轮授课后的教学反思，必须据此改进】\n{$reflect}\n" : '')
            . ($extra ? "\n【教师补充要求】\n{$extra}\n" : '')
            . "\n任务：用逆向设计 + BOPPPS 写一份可直接上课的教案草稿。硬性要求：\n"
            . "1. segments 按 B导入、O目标、P1前测、P2参与式学习(可拆成多段)、P3后测、S总结 的顺序；各段 minutes 之和必须恰好等于 {$dur}；\n"
            . "2. 每段写清 teacher_act(教师具体做什么、说什么、举什么例子) 与 student_act(学生具体做什么)；单段讲授不超过15分钟，P2 中至少一段是学生动手/讨论/练习；\n"
            . "3. 每段的 objective_code 填所服务的目标编号；P1、P3 必须写 assess_method（具体题目或检测方式）；每个目标至少被一次评价覆盖；\n"
            . "4. misconceptions：列出学生最可能出现的 2–4 个具体误区及纠正策略；\n"
            . "5. ideology：自然融入的课程思政点（结合学科内容，不要空喊口号）；\n"
            . "6. evidence：从大纲原文中逐字复制 1–3 句，作为本课内容的依据。\n"
            . '输出格式：{"key_points":"","difficult_points":"","misconceptions":"","ideology":"","resources":"","homework":"",'
            . '"segments":[{"phase":"B","minutes":5,"teacher_act":"","student_act":"","objective_code":"CO1","assess_method":""}],"evidence":["..."]}';
        $r = DeepSeek::chat('lesson', [['role' => 'system', 'content' => self::SYS], ['role' => 'user', 'content' => $prompt]], true, 0.5, 6000);
        if (!$r['ok']) {
            $this->fail($r);
        }
        $j = $r['json'];
        $segs = [];
        $sum = 0;
        foreach ((array)($j['segments'] ?? []) as $s) {
            $ph = strtoupper((string)($s['phase'] ?? 'P2'));
            if (!array_key_exists($ph, phases())) {
                $ph = 'P2';
            }
            $m = max(0, (int)($s['minutes'] ?? 0));
            $sum += $m;
            $segs[] = [
                'phase' => $ph,
                'minutes' => $m,
                'teacher_act' => (string)($s['teacher_act'] ?? ''),
                'student_act' => (string)($s['student_act'] ?? ''),
                'objective_id' => $codeToId[$s['objective_code'] ?? ''] ?? 0,
                'assess_method' => (string)($s['assess_method'] ?? ''),
            ];
        }
        $fields = [];
        foreach (['key_points', 'difficult_points', 'misconceptions', 'ideology', 'resources', 'homework'] as $f) {
            $v = $j[$f] ?? '';
            $fields[$f] = is_array($v) ? implode("\n", array_map(function ($x) {
                return is_array($x) ? implode('：', $x) : $x;
            }, $v)) : (string)$v;
        }
        json_out([
            'fields' => $fields,
            'segments' => $segs,
            'minutes_sum' => $sum,
            'duration' => $dur,
            'evidence' => $this->verify($j['evidence'] ?? [], $course['syllabus']),
        ]);
    }

    /** 模拟教学督导评课 */
    public function review($lessonId)
    {
        release_session();
        $lesson = Auth::lesson($lessonId);
        $course = Auth::course($lesson['course_id']);
        $objs = Repo::objectives($course['id']);
        $objById = array_column($objs, null, 'id');
        $txt = "课次：{$lesson['title']}（{$lesson['duration_min']}分钟）\n目标：\n";
        foreach (Repo::lessonObjectiveIds($lessonId) as $oid) {
            if (isset($objById[$oid])) {
                $txt .= "- {$objById[$oid]['code']}（" . bloom_name($objById[$oid]['bloom']) . "）{$objById[$oid]['content']}\n";
            }
        }
        $txt .= "重点：{$lesson['key_points']}\n难点：{$lesson['difficult_points']}\n预判误区：{$lesson['misconceptions']}\n思政：{$lesson['ideology']}\n教学过程：\n";
        foreach (Repo::segments($lessonId) as $s) {
            $oc = $s['objective_id'] && isset($objById[$s['objective_id']]) ? $objById[$s['objective_id']]['code'] : '-';
            $txt .= '[' . phase_name($s['phase']) . " {$s['minutes']}分钟 目标{$oc}] 教师：{$s['teacher_act']} | 学生：{$s['student_act']} | 检测：{$s['assess_method']}\n";
        }
        $prompt = $this->courseHeader($course) . "\n以下是一份教案：\n" . $txt
            . "\n请以学校教学督导的身份评审这份教案，重点看：目标-活动-评价是否对齐、认知层级是否匹配、学生是否真正参与、时间分配是否合理、难点的突破方法是否有效、科学性错误。"
            . "要具体指出哪个环节、为什么、怎么改，不要泛泛而谈。\n"
            . '输出格式：{"overall":"一句话总评","score":85,"strengths":["..."],"issues":[{"where":"环节或字段","problem":"...","suggestion":"可直接照做的修改建议"}]}';
        $r = DeepSeek::chat('review', [['role' => 'system', 'content' => self::SYS], ['role' => 'user', 'content' => $prompt]], true, 0.3);
        if (!$r['ok']) {
            $this->fail($r);
        }
        json_out($r['json']);
    }

    /** 按目标与层级出题 */
    public function questions($courseId)
    {
        release_session();
        $course = Auth::course($courseId);
        $b = json_body();
        $oid = (int)($b['objective_id'] ?? 0);
        $obj = DB::one('SELECT * FROM objectives WHERE id=? AND course_id=?', [$oid, $courseId]);
        if (!$obj) {
            json_out(['error' => '请选择课程目标'], 400);
        }
        $bloom = min(6, max(1, (int)($b['bloom'] ?? $obj['bloom'])));
        $qtype = in_array($b['qtype'] ?? '', qtypes(), true) ? $b['qtype'] : '简答';
        $count = min(10, max(1, (int)($b['count'] ?? 3)));
        $diff = min(5, max(1, (int)($b['difficulty'] ?? 3)));
        $extra = trim((string)($b['extra'] ?? ''));
        $existing = array_column(DB::all('SELECT stem FROM questions WHERE objective_id=? ORDER BY id DESC LIMIT 15', [$oid]), 'stem');

        $prompt = $this->courseHeader($course) . "\n【大纲原文（节选）】\n" . $this->syllabus($course, 6000)
            . "\n\n【考查的课程目标】{$obj['code']}：{$obj['content']}（目标层级：" . bloom_name($obj['bloom']) . "）\n"
            . "任务：编写 {$count} 道{$qtype}题，认知层级为「" . bloom_name($bloom) . "」，难度 {$diff}/5。要求：\n"
            . "1. 题目必须真正考查该层级（例如“分析”层级不能只考概念复述），尽量使用真实情境或案例；\n"
            . "2. 选择题给出4个选项且干扰项要反映学生常见误区，options 为数组；\n"
            . "3. 给出标准答案 answer、评分要点/解析 analysis、建议分值 score；\n"
            . "4. evidence 从大纲原文或目标表述中逐字复制一句作为命题依据；\n"
            . "5. 答案必须正确无争议，涉及计算的请自行验算。\n"
            . ($existing ? "6. 不要与以下已有题目重复：\n- " . implode("\n- ", array_map(function ($s) {
                return mb_substr($s, 0, 60);
            }, $existing)) . "\n" : '')
            . ($extra ? "【教师补充】{$extra}\n" : '')
            . '输出格式：{"questions":[{"stem":"","options":[],"answer":"","analysis":"","score":10,"evidence":""}]}';
        $r = DeepSeek::chat('questions', [['role' => 'system', 'content' => self::SYS], ['role' => 'user', 'content' => $prompt]], true, 0.6, 6000);
        if (!$r['ok']) {
            $this->fail($r);
        }
        $src = $course['syllabus'] . "\n" . $obj['content'];
        $qs = [];
        foreach ((array)($r['json']['questions'] ?? []) as $q) {
            $q['objective_id'] = $oid;
            $q['bloom'] = $bloom;
            $q['qtype'] = $qtype;
            $q['difficulty'] = $diff;
            $q['evidence_ok'] = evidence_in($q['evidence'] ?? '', $src);
            $qs[] = $q;
        }
        json_out(['questions' => $qs]);
    }

    /** 根据达成度与试题分析给出改进建议 */
    public function improve($courseId)
    {
        release_session();
        $course = Auth::course($courseId);
        $th = (float)$course['attain_threshold'];
        $att = Analytics::attainment($courseId, $th);
        if (!$att) {
            json_out(['error' => '还没有导入任何成绩，无法分析。'], 400);
        }
        $txt = "达成度阈值 {$th}\n";
        foreach (Repo::objectives($courseId) as $o) {
            $a = $att[$o['id']] ?? null;
            $txt .= "{$o['code']}（" . bloom_name($o['bloom']) . "，权重{$o['weight']}%）{$o['content']}：" . ($a ? sprintf('达成度 %.2f，%d/%d 名学生个人未达成', $a['attain'], $a['below'], $a['students']) : '无数据') . "\n";
            foreach (DB::all('SELECT l.seq, l.title, l.reflection FROM lesson_objectives lo JOIN lessons l ON l.id=lo.lesson_id WHERE lo.objective_id=? ORDER BY l.seq', [$o['id']]) as $l) {
                $txt .= "   · 第{$l['seq']}次课 {$l['title']}" . ($l['reflection'] ? '；反思：' . mb_substr($l['reflection'], 0, 120) : '') . "\n";
            }
        }
        foreach (DB::all('SELECT id, title FROM papers WHERE course_id=?', [$courseId]) as $p) {
            $a = Analytics::paper($p['id']);
            if (!$a || !$a['n']) {
                continue;
            }
            $txt .= "\n试卷《{$p['title']}》{$a['n']}人，均分" . round($a['mean'], 1) . '/' . $a['full'] . '，α=' . ($a['alpha'] === null ? '-' : round($a['alpha'], 2)) . "\n";
            foreach ($a['items'] as $i => $it) {
                if ($it['flags']) {
                    $txt .= '  第' . ($i + 1) . "题({$it['ocode']}," . bloom_name($it['bloom']) . ') P=' . round($it['P'], 2) . ' D=' . ($it['D'] === null ? '-' : round($it['D'], 2)) . ' ' . implode('/', $it['flags']) . '：' . mb_substr($it['stem'], 0, 50) . "\n";
                }
            }
        }
        $prompt = $this->courseHeader($course) . "\n以下是本学期的课程目标达成度和试题分析数据：\n" . $txt
            . "\n请像撰写《课程目标达成情况分析报告》中的“持续改进”部分那样：\n1. 区分“教的问题”和“考的问题”（题目本身区分度差或负区分时，先怀疑试题）；\n2. 针对每个未达成目标，指出应修改哪几次课、具体改什么；\n3. 只依据给定数据，不要编造数据。\n"
            . '输出格式：{"summary":"","test_issues":[{"item":"第N题","problem":"","fix":""}],"teaching_actions":[{"objective":"CO1","lessons":"第3、4次课","action":""}]}';
        $r = DeepSeek::chat('improve', [['role' => 'system', 'content' => self::SYS], ['role' => 'user', 'content' => $prompt]], true, 0.3);
        if (!$r['ok']) {
            $this->fail($r);
        }
        json_out($r['json']);
    }

    /** 根据教案生成 PPT 课件大纲 */
    public function slides($lessonId)
    {
        release_session();
        $lesson = Auth::lesson($lessonId);
        $course = Auth::course($lesson['course_id']);
        $b = json_body();
        $pages = min(40, max(6, (int)($b['pages'] ?? 15)));
        $extra = trim((string)($b['extra'] ?? ''));
        $segs = Repo::segments($lessonId);
        if (!$segs) {
            json_out(['error' => '本课次还没有教学环节。课件应以教案为依据——请先完成并保存教案（可用 AI 生成教案草稿）。'], 400);
        }
        $objById = array_column(Repo::objectives($course['id']), null, 'id');
        $txt = "课次：第{$lesson['seq']}次 {$lesson['title']}（{$lesson['duration_min']}分钟）\n教学目标：\n";
        foreach (Repo::lessonObjectiveIds($lessonId) as $oid) {
            if (isset($objById[$oid])) {
                $txt .= "- {$objById[$oid]['content']}\n";
            }
        }
        $txt .= "重点：{$lesson['key_points']}\n难点：{$lesson['difficult_points']}\n学生易错：{$lesson['misconceptions']}\n思政融入：{$lesson['ideology']}\n作业：{$lesson['homework']}\n教学过程：\n";
        foreach ($segs as $s) {
            $txt .= '[' . $s['phase'] . ' ' . phase_name($s['phase']) . " {$s['minutes']}分钟] 教师：{$s['teacher_act']} | 学生：{$s['student_act']} | 检测：{$s['assess_method']}\n";
        }
        $prompt = $this->courseHeader($course) . "\n【教案】\n" . $txt
            . "\n任务：依据这份教案制作约 {$pages} 页的课堂 PPT 课件内容。要求：\n"
            . "1. 课件服务于教案的每个环节，每页标注 phase（B/O/P1/P2/P3/S），顺序与教学过程一致；\n"
            . "2. 一页一个核心观点；bullets 每条不超过25字、每页不超过5条——PPT 是提示而不是讲稿，详细讲解写进 notes(讲稿备注，供教师参考，可写100–250字)；\n"
            . "3. 前测(P1)和后测(P3)做成 quiz 页：question、options(数组)、answer；\n"
            . "4. 对于对比类内容用 two 布局(left_title/left/right_title/right)；\n"
            . "5. 第一页 layout=title（title为课题，subtitle为课程名）；第二页 layout=objectives 列出“学完本节你能够…”；最后一页 layout=summary；\n"
            . "6. 难点和学生易错点要有专门的页；内容必须准确，不确定的事实不要写。\n"
            . ($extra ? "【教师补充要求】{$extra}\n" : '')
            . 'layout 只能是 title|objectives|bullets|two|quiz|section|summary。输出格式：'
            . '{"slides":[{"layout":"bullets","phase":"P2","title":"","subtitle":"","bullets":[],"left_title":"","left":[],"right_title":"","right":[],"question":"","options":[],"answer":"","notes":""}]}';
        $r = DeepSeek::chat('slides', [['role' => 'system', 'content' => self::SYS], ['role' => 'user', 'content' => $prompt]], true, 0.5, 8000);
        if (!$r['ok']) {
            $this->fail($r);
        }
        $slides = SlideController::normalize((array)($r['json']['slides'] ?? []));
        if (!$slides) {
            json_out(['error' => 'AI 没有返回有效的幻灯片，请重试'], 502);
        }
        json_out(['slides' => $slides]);
    }
}
