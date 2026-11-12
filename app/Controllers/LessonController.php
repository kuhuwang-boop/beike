<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Core\View;
use App\Services\Checks;
use App\Services\Repo;

class LessonController
{
    public function create($courseId)
    {
        $course = Auth::course($courseId);
        $seq = (int)DB::val('SELECT COALESCE(MAX(seq),0)+1 FROM lessons WHERE course_id=?', [$courseId]);
        $lid = DB::insert('lessons', [
            'course_id' => $courseId,
            'seq' => $seq,
            'title' => input('title') ?: "第{$seq}讲",
            'duration_min' => (int)$course['lesson_minutes'],
        ]);
        redirect("lessons/$lid");
    }

    public function store($courseId)
    {
        $this->create($courseId);
    }

    public function edit($id)
    {
        $lesson = Auth::lesson($id);
        $course = Auth::course($lesson['course_id']);
        $objectives = Repo::objectives($course['id']);
        $segments = Repo::segments($id);
        $lessonObjIds = Repo::lessonObjectiveIds($id);
        $qStats = Repo::objectiveQuestionStats($course['id']);
        $checks = Checks::lesson($lesson, $segments, $lessonObjIds, $objectives, $qStats);
        $siblings = DB::all('SELECT id, seq, title FROM lessons WHERE course_id=? ORDER BY seq, id', [$course['id']]);
        View::render('lessons/edit', compact('lesson', 'course', 'objectives', 'segments', 'lessonObjIds', 'checks', 'siblings'));
    }

    public function update($id)
    {
        $lesson = Auth::lesson($id);
        $courseId = (int)$lesson['course_id'];
        $validObj = array_map('intval', array_column(Repo::objectives($courseId), 'id'));
        $status = input('status', 'draft');
        $date = input('class_date');
        DB::tx(function () use ($id, $validObj, $status, $date) {
            DB::update('lessons', [
                'seq' => (int)input('seq', 1),
                'title' => mb_substr(input('title') ?: '未命名课次', 0, 200),
                'class_date' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date : null,
                'duration_min' => max(1, (int)input('duration_min', 90)),
                'key_points' => input('key_points'),
                'difficult_points' => input('difficult_points'),
                'misconceptions' => input('misconceptions'),
                'ideology' => input('ideology'),
                'resources' => input('resources'),
                'homework' => input('homework'),
                'reflection' => input('reflection'),
                'status' => in_array($status, ['draft', 'ready', 'taught'], true) ? $status : 'draft',
            ], 'id=?', [$id]);

            DB::exec('DELETE FROM lesson_objectives WHERE lesson_id=?', [$id]);
            foreach (array_unique(array_map('intval', (array)input('objectives', []))) as $oid) {
                if (in_array($oid, $validObj, true)) {
                    DB::insert('lesson_objectives', ['lesson_id' => $id, 'objective_id' => $oid]);
                }
            }

            DB::exec('DELETE FROM lesson_segments WHERE lesson_id=?', [$id]);
            $phases = (array)input('seg_phase', []);
            foreach ($phases as $i => $ph) {
                if (!array_key_exists($ph, phases())) {
                    continue;
                }
                $oid = (int)(((array)input('seg_obj', []))[$i] ?? 0);
                DB::insert('lesson_segments', [
                    'lesson_id' => $id,
                    'sort' => $i,
                    'phase' => $ph,
                    'minutes' => max(0, (int)(((array)input('seg_minutes', []))[$i] ?? 0)),
                    'teacher_act' => trim((string)(((array)input('seg_teacher', []))[$i] ?? '')),
                    'student_act' => trim((string)(((array)input('seg_student', []))[$i] ?? '')),
                    'objective_id' => in_array($oid, $validObj, true) ? $oid : null,
                    'assess_method' => mb_substr(trim((string)(((array)input('seg_assess', []))[$i] ?? '')), 0, 200),
                ]);
            }
        });
        flash('已保存，右侧检查结果已更新');
        redirect("lessons/$id");
    }

    public function destroy($id)
    {
        $l = Auth::lesson($id);
        DB::exec('DELETE FROM lessons WHERE id=?', [$id]);
        \App\Services\Images::purge($id);
        \App\Services\MiniMax::purge($id);
        DB::exec("DELETE FROM videos WHERE lesson_id=?", [$id]);
        flash('课次已删除');
        redirect('courses/' . $l['course_id']);
    }

    public function duplicate($id)
    {
        $l = Auth::lesson($id);
        $nl = $l;
        unset($nl['id'], $nl['updated_at']);
        $nl['seq'] = (int)DB::val('SELECT COALESCE(MAX(seq),0)+1 FROM lessons WHERE course_id=?', [$l['course_id']]);
        $nl['title'] = $l['title'] . '（副本）';
        $nl['class_date'] = null;
        $nl['status'] = 'draft';
        $nl['reflection'] = '';
        $nid = DB::insert('lessons', $nl);
        foreach (Repo::lessonObjectiveIds($id) as $oid) {
            DB::insert('lesson_objectives', ['lesson_id' => $nid, 'objective_id' => $oid]);
        }
        foreach (Repo::segments($id) as $s) {
            unset($s['id']);
            $s['lesson_id'] = $nid;
            DB::insert('lesson_segments', $s);
        }
        $deck = DB::one('SELECT theme, slides FROM decks WHERE lesson_id=?', [$id]);
        if ($deck) {
            DB::insert('decks', ['lesson_id' => $nid, 'theme' => $deck['theme'], 'slides' => $deck['slides']]);
        }
        flash('已复制为新课次');
        redirect("lessons/$nid");
    }

    public function printView($id)
    {
        $l = Auth::lesson($id);
        $course = Auth::course($l['course_id']);
        $doc = self::renderDoc($course, $l, Repo::objectives($course['id']));
        echo '<!doctype html><html><head><meta charset="utf-8"><title>' . e($l['title']) . '</title>'
            . '<style>' . self::docCss() . '@media print{.noprint{display:none}}</style></head><body>'
            . '<div class="noprint" style="text-align:right;margin:10px"><button onclick="print()">打印 / 另存为PDF</button></div>'
            . $doc . '</body></html>';
    }

    public function word($id)
    {
        $l = Auth::lesson($id);
        $course = Auth::course($l['course_id']);
        self::sendWord($course['name'] . '-' . $l['title'], self::renderDoc($course, $l, Repo::objectives($course['id'])));
    }

    public static function docCss()
    {
        return 'body{font-family:"宋体",SimSun,serif;font-size:12pt;line-height:1.6;max-width:800px;margin:0 auto;padding:20px}'
            . 'h1{font-family:"黑体",SimHei,sans-serif;text-align:center;font-size:18pt}h2{font-family:"黑体",SimHei,sans-serif;font-size:13pt;margin:14px 0 6px}'
            . 'table{border-collapse:collapse;width:100%}td,th{border:1px solid #000;padding:4px 6px;vertical-align:top;font-size:10.5pt}th{background:#eee}';
    }

    public static function renderDoc($course, $l, $objectives)
    {
        $objById = [];
        foreach ($objectives as $o) {
            $objById[$o['id']] = $o;
        }
        $lo = Repo::lessonObjectiveIds($l['id']);
        $segs = Repo::segments($l['id']);
        ob_start(); ?>
<h1><?= e($course['name']) ?> 教案</h1>
<table>
<tr><th width="15%">课次</th><td>第 <?= (int)$l['seq'] ?> 次：<?= e($l['title']) ?></td><th width="15%">授课日期</th><td><?= e($l['class_date'] ?: '—') ?></td></tr>
<tr><th>授课对象</th><td><?= e($course['audience']) ?></td><th>学时</th><td><?= (int)$l['duration_min'] ?> 分钟</td></tr>
</table>
<h2>一、教学目标</h2>
<?php if ($lo): foreach ($lo as $oid): if (!isset($objById[$oid])) continue; $o = $objById[$oid]; ?>
<p><?= e($o['code']) ?>（<?= e(bloom_name($o['bloom'])) ?>）：<?= e($o['content']) ?></p>
<?php endforeach; else: $ot = \App\Core\DB::val('SELECT objectives_text FROM lesson_meta WHERE lesson_id=?', [$l['id']]); ?><p><?= $ot ? nl($ot) : '（未设置）' ?></p><?php endif; ?>
<h2>二、教学重点</h2><p><?= nl($l['key_points']) ?></p>
<h2>三、教学难点</h2><p><?= nl($l['difficult_points']) ?></p>
<h2>四、学生可能的误区及对策</h2><p><?= nl($l['misconceptions']) ?></p>
<h2>五、教学过程（BOPPPS）</h2>
<table><tr><th width="13%">环节</th><th width="7%">时间</th><th>教师活动</th><th>学生活动</th><th width="16%">对应目标 / 检测方式</th></tr>
<?php foreach ($segs as $s): ?>
<tr><td><?= e(phase_name($s['phase'])) ?></td><td><?= (int)$s['minutes'] ?>′</td><td><?= nl($s['teacher_act']) ?></td><td><?= nl($s['student_act']) ?></td>
<td><?= $s['objective_id'] && isset($objById[$s['objective_id']]) ? e($objById[$s['objective_id']]['code']) : '' ?><?= $s['assess_method'] ? '<br>' . e($s['assess_method']) : '' ?></td></tr>
<?php endforeach; ?>
</table>
<h2>六、课程思政融入</h2><p><?= nl($l['ideology']) ?></p>
<h2>七、教学资源</h2><p><?= nl($l['resources']) ?></p>
<h2>八、作业与课后任务</h2><p><?= nl($l['homework']) ?></p>
<h2>九、教学反思</h2><p><?= nl($l['reflection']) ?: '<br><br><br>' ?></p>
<?php
        return ob_get_clean();
    }

    public static function sendWord($name, $bodyHtml)
    {
        $fn = preg_replace('/[\\\\\/:*?"<>|]/u', '_', $name) . '.doc';
        header('Content-Type: application/msword; charset=utf-8');
        header('Content-Disposition: attachment; filename="lesson.doc"; filename*=UTF-8\'\'' . rawurlencode($fn));
        echo '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">'
            . '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->'
            . '<style>' . self::docCss() . '</style></head><body>' . $bodyHtml . '</body></html>';
        exit;
    }
}
