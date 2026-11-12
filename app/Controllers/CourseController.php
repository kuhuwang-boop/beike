<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Core\View;
use App\Services\Checks;
use App\Services\Repo;

class CourseController
{
    private function fields()
    {
        return [
            'name' => mb_substr(input('name'), 0, 100),
            'code' => mb_substr(input('code'), 0, 40),
            'semester' => mb_substr(input('semester'), 0, 40),
            'credits' => (float)input('credits', 0),
            'hours' => (int)input('hours', 0),
            'lesson_minutes' => max(10, (int)input('lesson_minutes', 90)),
            'audience' => mb_substr(input('audience'), 0, 120),
            'syllabus' => input('syllabus'),
            'attain_threshold' => min(1, max(0, (float)input('attain_threshold', 0.7))),
        ];
    }

    public function create()
    {
        View::render('courses/form', ['course' => null]);
    }

    public function store()
    {
        $f = $this->fields();
        if ($f['name'] === '') {
            flash('请填写课程名称', 'err');
            back();
        }
        $f['user_id'] = Auth::id();
        $id = DB::insert('courses', $f);
        flash('课程已创建。下一步：设置课程目标（可让 AI 从大纲中提取）。');
        redirect("courses/$id/objectives");
    }

    public function show($id)
    {
        $course = Auth::course($id);
        $objectives = Repo::objectives($id);
        $lessons = Repo::lessons($id);
        $qStats = Repo::objectiveQuestionStats($id);
        $checks = Checks::course($course, $objectives, Repo::gradReqs($id), Repo::matrix($id), Repo::objectiveLessonCounts($id), $qStats, $lessons);
        foreach ($lessons as &$l) {
            $c = Checks::lesson($l, Repo::segments($l['id']), Repo::lessonObjectiveIds($l['id']), $objectives, $qStats);
            $l['checks'] = Checks::counts($c);
            $l['objcodes'] = DB::all('SELECT o.code FROM lesson_objectives lo JOIN objectives o ON o.id=lo.objective_id WHERE lo.lesson_id=? ORDER BY o.code', [$l['id']]);
        }
        unset($l);
        View::render('courses/show', compact('course', 'objectives', 'lessons', 'checks'));
    }

    public function edit($id)
    {
        View::render('courses/form', ['course' => Auth::course($id)]);
    }

    public function update($id)
    {
        Auth::course($id);
        DB::update('courses', $this->fields(), 'id=?', [$id]);
        flash('已保存');
        redirect("courses/$id");
    }

    public function destroy($id)
    {
        Auth::course($id);
        DB::exec('DELETE FROM courses WHERE id=?', [$id]);
        flash('课程已删除');
        redirect('');
    }

    /** 生成教学进度：按开课日期、每周上课星期，自动给课次排日期 */
    public function schedule($id)
    {
        $course = Auth::course($id);
        $start = input('start_date');
        $days = array_map('intval', (array)input('weekdays', []));
        $count = max(1, min(80, (int)input('count', 16)));
        $skip = [];
        foreach (preg_split('/[\s,，]+/', (string)input('skip')) as $s) {
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
                $skip[$s] = true;
            }
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) || !$days) {
            flash('请填写开课日期并至少选择一个上课星期', 'err');
            redirect("courses/$id");
        }
        $dates = [];
        $d = new \DateTime($start);
        $guard = 0;
        while (count($dates) < $count && $guard++ < 1000) {
            $ds = $d->format('Y-m-d');
            if (in_array((int)$d->format('N'), $days, true) && empty($skip[$ds])) {
                $dates[] = $ds;
            }
            $d->modify('+1 day');
        }
        DB::tx(function () use ($id, $dates, $course) {
            $lessons = Repo::lessons($id);
            $maxSeq = 0;
            foreach ($lessons as $l) {
                $maxSeq = max($maxSeq, (int)$l['seq']);
            }
            foreach ($dates as $i => $ds) {
                if (isset($lessons[$i])) {
                    DB::update('lessons', ['class_date' => $ds], 'id=?', [$lessons[$i]['id']]);
                } else {
                    $maxSeq++;
                    DB::insert('lessons', [
                        'course_id' => $id,
                        'seq' => $maxSeq,
                        'title' => "第{$maxSeq}讲（待定）",
                        'class_date' => $ds,
                        'duration_min' => (int)$course['lesson_minutes'],
                    ]);
                }
            }
        });
        flash('已生成 ' . count($dates) . ' 次课的教学进度');
        redirect("courses/$id");
    }

    /** 复制到新学期：带上目标、矩阵、课次(含环节和反思)、题库 */
    public function cloneCourse($id)
    {
        $c = Auth::course($id);
        $sem = input('semester') ?: ($c['semester'] . '(新)');
        $newId = DB::tx(function () use ($c, $sem, $id) {
            $nc = $c;
            unset($nc['id'], $nc['created_at']);
            $nc['semester'] = $sem;
            $newId = DB::insert('courses', $nc);
            $gmap = [];
            foreach (Repo::gradReqs($id) as $g) {
                $gmap[$g['id']] = DB::insert('grad_reqs', ['course_id' => $newId, 'code' => $g['code'], 'content' => $g['content']]);
            }
            $omap = [];
            foreach (Repo::objectives($id) as $o) {
                $omap[$o['id']] = DB::insert('objectives', ['course_id' => $newId, 'code' => $o['code'], 'content' => $o['content'], 'bloom' => $o['bloom'], 'weight' => $o['weight']]);
            }
            foreach (Repo::matrix($id) as $oid => $row) {
                foreach ($row as $gid => $lv) {
                    if (isset($omap[$oid], $gmap[$gid])) {
                        DB::insert('objective_req', ['objective_id' => $omap[$oid], 'grad_req_id' => $gmap[$gid], 'level' => $lv]);
                    }
                }
            }
            foreach (Repo::lessons($id) as $l) {
                $nl = $l;
                unset($nl['id'], $nl['updated_at']);
                $nl['course_id'] = $newId;
                $nl['class_date'] = null;
                $nl['status'] = 'draft';
                $nl['reflection'] = trim((string)$l['reflection']) !== '' ? "【上一轮反思 {$c['semester']}】\n" . $l['reflection'] : '';
                $lid = DB::insert('lessons', $nl);
                foreach (Repo::lessonObjectiveIds($l['id']) as $oid) {
                    if (isset($omap[$oid])) {
                        DB::insert('lesson_objectives', ['lesson_id' => $lid, 'objective_id' => $omap[$oid]]);
                    }
                }
                foreach (Repo::segments($l['id']) as $s) {
                    unset($s['id']);
                    $s['lesson_id'] = $lid;
                    $s['objective_id'] = $s['objective_id'] && isset($omap[$s['objective_id']]) ? $omap[$s['objective_id']] : null;
                    DB::insert('lesson_segments', $s);
                }
                $deck = DB::one('SELECT theme, slides FROM decks WHERE lesson_id=?', [$l['id']]);
                if ($deck) {
                    DB::insert('decks', ['lesson_id' => $lid, 'theme' => $deck['theme'], 'slides' => $deck['slides']]);
                }
            }
            foreach (DB::all('SELECT * FROM questions WHERE course_id=?', [$id]) as $q) {
                unset($q['id'], $q['created_at']);
                $q['course_id'] = $newId;
                $q['objective_id'] = $q['objective_id'] && isset($omap[$q['objective_id']]) ? $omap[$q['objective_id']] : null;
                DB::insert('questions', $q);
            }
            return $newId;
        });
        flash('已复制到新学期。上一轮的教学反思已放进每个课次，备课时可以直接参考。');
        redirect("courses/$newId");
    }

    /** 导出整门课教案集（Word） */
    public function exportAll($id)
    {
        $course = Auth::course($id);
        $objectives = Repo::objectives($id);
        $html = '';
        foreach (Repo::lessons($id) as $i => $l) {
            $html .= ($i ? '<br style="page-break-before:always">' : '') . LessonController::renderDoc($course, $l, $objectives);
        }
        LessonController::sendWord($course['name'] . '-教案集', $html);
    }
}
