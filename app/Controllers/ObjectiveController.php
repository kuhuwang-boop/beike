<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Core\View;
use App\Services\Repo;

class ObjectiveController
{
    public function index($id)
    {
        $course = Auth::course($id);
        View::render('courses/objectives', [
            'course' => $course,
            'gradReqs' => Repo::gradReqs($id),
            'objectives' => Repo::objectives($id),
            'matrix' => Repo::matrix($id),
            'lessonCounts' => Repo::objectiveLessonCounts($id),
            'qStats' => Repo::objectiveQuestionStats($id),
        ]);
    }

    /** 通用的行编辑保存：有 id 更新、无 id 新增、勾选删除的删除 */
    private function saveRows($table, $courseId, $prefix, array $cols)
    {
        $ids = (array)input($prefix . '_id', []);
        $del = array_map('intval', (array)input($prefix . '_del', []));
        $owned = array_map('intval', array_column(DB::all("SELECT id FROM `$table` WHERE course_id=?", [$courseId]), 'id'));
        DB::tx(function () use ($table, $courseId, $prefix, $cols, $ids, $del, $owned) {
            foreach ($ids as $i => $rid) {
                $rid = (int)$rid;
                $row = [];
                foreach ($cols as $c => $type) {
                    $v = ((array)input($prefix . '_' . $c, []))[$i] ?? '';
                    $row[$c] = $type === 'int' ? (int)$v : ($type === 'float' ? (float)$v : trim((string)$v));
                }
                if (trim((string)$row['content']) === '') {
                    continue;
                }
                if ($rid && in_array($rid, $owned, true)) {
                    if (in_array($rid, $del, true)) {
                        DB::exec("DELETE FROM `$table` WHERE id=?", [$rid]);
                    } else {
                        DB::update($table, $row, 'id=?', [$rid]);
                    }
                } elseif (!$rid) {
                    $row['course_id'] = $courseId;
                    DB::insert($table, $row);
                }
            }
        });
    }

    public function saveGradReqs($id)
    {
        Auth::course($id);
        $this->saveRows('grad_reqs', $id, 'g', ['code' => 'str', 'content' => 'str']);
        flash('毕业要求指标点已保存');
        redirect("courses/$id/objectives");
    }

    public function saveObjectives($id)
    {
        Auth::course($id);
        $this->saveRows('objectives', $id, 'o', ['code' => 'str', 'content' => 'str', 'bloom' => 'int', 'weight' => 'float']);
        flash('课程目标已保存');
        redirect("courses/$id/objectives");
    }

    public function saveMatrix($id)
    {
        Auth::course($id);
        $objIds = array_map('intval', array_column(Repo::objectives($id), 'id'));
        $gIds = array_map('intval', array_column(Repo::gradReqs($id), 'id'));
        $m = (array)input('m', []);
        DB::tx(function () use ($objIds, $gIds, $m) {
            if ($objIds) {
                DB::exec('DELETE FROM objective_req WHERE objective_id IN (' . implode(',', $objIds) . ')');
            }
            foreach ($m as $oid => $row) {
                foreach ((array)$row as $gid => $lv) {
                    if (in_array((int)$oid, $objIds, true) && in_array((int)$gid, $gIds, true) && in_array($lv, ['H', 'M', 'L'], true)) {
                        DB::insert('objective_req', ['objective_id' => (int)$oid, 'grad_req_id' => (int)$gid, 'level' => $lv]);
                    }
                }
            }
        });
        flash('支撑矩阵已保存');
        redirect("courses/$id/objectives");
    }
}
