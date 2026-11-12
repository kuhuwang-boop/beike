<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Core\View;
use App\Services\Repo;

/** PPT 课件：每课次一份，网页中编辑，浏览器端用 PptxGenJS 导出 .pptx */
class SlideController
{
    const LAYOUTS = ['title', 'objectives', 'bullets', 'two', 'diagram', 'quiz', 'section', 'summary', 'video'];

    /** 结构图版式（改编自 pptx-compose-skill 的版式目录）：名称、适用场景、条目数范围 */
    const DIAGRAMS = [
        'flow' => ['流程', '有先后的步骤、环节', 3, 6],
        'cycle' => ['闭环', '几步做完又回到起点', 3, 6],
        'timeline' => ['时间轴', '按时间排的里程碑、发展历程', 3, 6],
        'compare' => ['左右对照', '两种做法、两个概念、改前改后', 2, 2],
        'matrix' => ['并列卡片', '三五个并列要点，没有先后', 2, 6],
        'pillars' => ['支柱', '几根支柱共同撑起一个结论', 2, 4],
        'kpi' => ['大数字', '三四个关键数据', 2, 4],
        'pyramid' => ['金字塔', '上少下多的层级、需求层次', 3, 5],
        'funnel' => ['漏斗', '逐级筛选、收窄', 3, 5],
        'tree' => ['分类树', '一个总概念拆成几类，类下有条目', 2, 4],
        'hub' => ['中心辐射', '一个核心关联多个方面', 3, 6],
        'layers' => ['分层结构', '自上而下的层次，每层有若干模块', 2, 5],
        'pipeline' => ['三栏对照', '类型 → 内容 → 用途，每行一组', 2, 5],
    ];

    public function edit($lessonId)
    {
        $lesson = Auth::lesson($lessonId);
        $course = Auth::course($lesson['course_id']);
        $deck = DB::one('SELECT * FROM decks WHERE lesson_id=?', [$lessonId]);
        $slides = $deck ? (json_decode($deck['slides'], true) ?: []) : [];
        $theme = $deck ? $deck['theme'] : 'blue';
        $segCount = (int)DB::val('SELECT COUNT(*) FROM lesson_segments WHERE lesson_id=?', [$lessonId]);
        $templates = \App\Services\Templates::forUser(\App\Core\Auth::id());
        $brand = \App\Services\Brand::forUser(\App\Core\Auth::id());
        View::render('lessons/slides', compact('lesson', 'course', 'slides', 'theme', 'segCount', 'templates', 'brand'));
    }

    public function save($lessonId)
    {
        Auth::lesson($lessonId);
        $b = json_body();
        $slides = self::normalize((array)($b['slides'] ?? []));
        $theme = \App\Services\Templates::validTheme(\App\Core\Auth::id(), (string)($b['theme'] ?? '')) ? $b['theme'] : 'blue';
        DB::query(
            'INSERT INTO decks (lesson_id, theme, slides) VALUES (?,?,?) ON DUPLICATE KEY UPDATE theme=VALUES(theme), slides=VALUES(slides)',
            [$lessonId, $theme, json_encode($slides, JSON_UNESCAPED_UNICODE)]
        );
        json_out(['ok' => true, 'count' => count($slides)]);
    }

    /** 不用 AI：直接把教案结构转换为课件骨架 */
    public function fromLesson($lessonId)
    {
        $l = Auth::lesson($lessonId);
        $course = Auth::course($l['course_id']);
        $objById = array_column(Repo::objectives($course['id']), null, 'id');
        $lines = function ($t) {
            return array_values(array_filter(array_map('trim', preg_split('/\r\n|\n|；|;/u', (string)$t))));
        };
        $s = [];
        $s[] = ['layout' => 'title', 'phase' => 'B', 'title' => $l['title'], 'subtitle' => $course['name'] . ($course['audience'] ? ' · ' . $course['audience'] : '')];
        $objs = [];
        foreach (Repo::lessonObjectiveIds($lessonId) as $oid) {
            if (isset($objById[$oid])) {
                $objs[] = $objById[$oid]['content'];
            }
        }
        foreach (Repo::segments($lessonId) as $seg) {
            if ($seg['phase'] === 'O') {
                $s[] = ['layout' => 'objectives', 'phase' => 'O', 'title' => '学完本节，你能够', 'bullets' => $objs, 'notes' => $seg['teacher_act']];
            } elseif ($seg['phase'] === 'P1' || $seg['phase'] === 'P3') {
                $s[] = ['layout' => 'quiz', 'phase' => $seg['phase'], 'title' => $seg['phase'] === 'P1' ? '课前小测' : '课堂检测', 'question' => $seg['assess_method'] ?: '（在此填写检测题）', 'options' => [], 'answer' => '', 'notes' => $seg['teacher_act']];
            } elseif ($seg['phase'] === 'S') {
                $s[] = ['layout' => 'summary', 'phase' => 'S', 'title' => '本节小结', 'bullets' => array_slice($lines($l['key_points']), 0, 5), 'notes' => $seg['teacher_act'] . "\n作业：" . $l['homework']];
            } else {
                $s[] = ['layout' => 'bullets', 'phase' => $seg['phase'], 'title' => phase_name($seg['phase']), 'bullets' => array_slice($lines($seg['teacher_act']), 0, 5), 'notes' => '学生活动：' . $seg['student_act']];
            }
        }
        if (trim((string)$l['misconceptions']) !== '') {
            $s[] = ['layout' => 'bullets', 'phase' => 'P2', 'title' => '常见误区', 'bullets' => array_slice($lines($l['misconceptions']), 0, 5)];
        }
        json_out(['slides' => self::normalize($s)]);
    }

    public static function cleanImage($img)
    {
        if (!is_array($img) || !preg_match('#^/uploads/img/\d+/[a-f0-9]{20}\.(jpg|png)$#', (string)($img['src'] ?? ''))) {
            return null;
        }
        $o = ['src' => $img['src']];
        foreach (['credit', 'link', 'source', 'query_en', 'query_zh', 'ai_prompt'] as $k) {
            $o[$k] = mb_substr(trim((string)($img[$k] ?? '')), 0, 300);
        }
        $o['page'] = max(1, (int)($img['page'] ?? 1));
        $o['w'] = (int)($img['w'] ?? 0);
        $o['h'] = (int)($img['h'] ?? 0);
        return $o;
    }

    /** 视频页：只接受本站保存的 mp4，生成中的任务只记编号 */
    public static function cleanVideo($v)
    {
        if (!is_array($v) || (int)($v['id'] ?? 0) <= 0) {
            return null;
        }
        $src = (string)($v['src'] ?? '');
        if ($src !== '' && !preg_match('#^/uploads/video/\d+/v\d+\.mp4$#', $src)) {
            $src = '';
        }
        $st = in_array($v['status'] ?? '', ['queued', 'running', 'succeeded', 'failed'], true) ? $v['status'] : 'queued';
        if ($src !== '') {
            $st = 'succeeded';
        }
        return ['id' => (int)$v['id'], 'src' => $src, 'status' => $st, 'dur' => max(0, min(15, (int)($v['dur'] ?? 0))),
            'prompt' => mb_substr(trim((string)($v['prompt'] ?? '')), 0, 600), 'error' => mb_substr(trim((string)($v['error'] ?? '')), 0, 200)];
    }

    /** 清洗结构图：版式白名单、条目数范围、每条必须有标题和内容（禁止空壳） */
    public static function cleanDiagram($d)
    {
        if (!is_array($d) || !isset(self::DIAGRAMS[$d['type'] ?? ''])) {
            return null;
        }
        $type = $d['type'];
        list(, , $min, $max) = self::DIAGRAMS[$type];
        $str = function ($v, $n) {
            return mb_substr(trim(is_array($v) ? implode('，', $v) : (string)$v), 0, $n);
        };
        $items = [];
        foreach (array_slice((array)($d['items'] ?? []), 0, $max) as $x) {
            if (!is_array($x)) {
                $x = ['t' => (string)$x];
            }
            $it = ['t' => $str($x['t'] ?? $x['title'] ?? '', 20), 'd' => $str($x['d'] ?? $x['desc'] ?? '', 80)];
            $sub = array_values(array_filter(array_map(function ($v) use ($str) {
                return $str($v, 24);
            }, array_slice((array)($x['sub'] ?? []), 0, 6)), 'strlen'));
            if ($sub) {
                $it['sub'] = $sub;
            }
            if ($type === 'pipeline') {
                $it['u'] = $str($x['u'] ?? '', 40);
            }
            if ($it['t'] === '' || ($it['d'] === '' && !$sub)) {
                continue;
            }
            $items[] = $it;
        }
        if (count($items) < $min) {
            return null;
        }
        $out = ['type' => $type, 'style' => in_array($d['style'] ?? '', ['rounded', 'square', 'flat'], true) ? $d['style'] : 'rounded', 'items' => $items];
        foreach (['center' => 16, 'note' => 60] as $k => $n) {
            if (trim((string)($d[$k] ?? '')) !== '') {
                $out[$k] = $str($d[$k], $n);
            }
        }
        if ($type === 'pipeline' && is_array($d['cols'] ?? null) && count($d['cols']) === 3) {
            $out['cols'] = array_map(function ($v) use ($str) {
                return $str($v, 8);
            }, array_values($d['cols']));
        }
        if (isset($d['hi']) && is_numeric($d['hi']) && (int)$d['hi'] >= 0 && (int)$d['hi'] < count($items)) {
            $out['hi'] = (int)$d['hi'];
        }
        return $out;
    }

    public static function normalize(array $in)
    {
        $out = [];
        $arr = function ($v) {
            if (is_string($v)) {
                $v = preg_split('/\r\n|\n/', $v);
            }
            return array_values(array_filter(array_map(function ($x) {
                return trim(is_array($x) ? implode('：', $x) : (string)$x);
            }, (array)$v), 'strlen'));
        };
        foreach ($in as $s) {
            if (!is_array($s)) {
                continue;
            }
            $layout = in_array($s['layout'] ?? '', self::LAYOUTS, true) ? $s['layout'] : 'bullets';
            $diagram = $layout === 'diagram' ? self::cleanDiagram($s['diagram'] ?? null) : null;
            if ($layout === 'diagram' && !$diagram) {
                $layout = 'bullets'; // 结构图数据不完整时退回要点页，避免出现空壳图
            }
            $video = $layout === 'video' ? self::cleanVideo($s['video'] ?? null) : null;
            if ($layout === 'video' && !$video) {
                $layout = 'bullets';
            }
            $phase = strtoupper((string)($s['phase'] ?? ''));
            $out[] = [
                'layout' => $layout,
                'phase' => array_key_exists($phase, phases()) ? $phase : '',
                'title' => mb_substr(trim((string)($s['title'] ?? '')), 0, 80),
                'subtitle' => mb_substr(trim((string)($s['subtitle'] ?? '')), 0, 120),
                'bullets' => $arr($s['bullets'] ?? []),
                'left_title' => trim((string)($s['left_title'] ?? '')),
                'left' => $arr($s['left'] ?? []),
                'right_title' => trim((string)($s['right_title'] ?? '')),
                'right' => $arr($s['right'] ?? []),
                'question' => trim((string)($s['question'] ?? '')),
                'options' => $arr($s['options'] ?? []),
                'answer' => trim((string)($s['answer'] ?? '')),
                'notes' => trim((string)($s['notes'] ?? '')),
                'image' => self::cleanImage($s['image'] ?? null),
                'lead' => $layout === 'diagram' ? mb_substr(trim((string)($s['lead'] ?? '')), 0, 60) : '',
                'diagram' => $diagram,
                'video' => $video,
            ];
        }
        return array_slice($out, 0, 60);
    }
}
