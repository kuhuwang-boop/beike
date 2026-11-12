<?php
namespace App\Services;

use App\Core\DB;

/** 常用数据读取 */
class Repo
{
    public static function objectives($courseId)
    {
        return DB::all('SELECT * FROM objectives WHERE course_id=? ORDER BY code, id', [$courseId]);
    }

    public static function gradReqs($courseId)
    {
        return DB::all('SELECT * FROM grad_reqs WHERE course_id=? ORDER BY code, id', [$courseId]);
    }

    /** objective_id => [grad_req_id => level] */
    public static function matrix($courseId)
    {
        $rows = DB::all('SELECT r.* FROM objective_req r JOIN objectives o ON o.id=r.objective_id WHERE o.course_id=?', [$courseId]);
        $m = [];
        foreach ($rows as $r) {
            $m[$r['objective_id']][$r['grad_req_id']] = $r['level'];
        }
        return $m;
    }

    public static function lessons($courseId)
    {
        return DB::all('SELECT * FROM lessons WHERE course_id=? ORDER BY seq, id', [$courseId]);
    }

    public static function segments($lessonId)
    {
        return DB::all('SELECT * FROM lesson_segments WHERE lesson_id=? ORDER BY sort, id', [$lessonId]);
    }

    public static function lessonObjectiveIds($lessonId)
    {
        return array_map('intval', array_column(DB::all('SELECT objective_id FROM lesson_objectives WHERE lesson_id=?', [$lessonId]), 'objective_id'));
    }

    /** objective_id => 覆盖它的课次数 */
    public static function objectiveLessonCounts($courseId)
    {
        $rows = DB::all('SELECT lo.objective_id, COUNT(*) n FROM lesson_objectives lo JOIN lessons l ON l.id=lo.lesson_id WHERE l.course_id=? GROUP BY lo.objective_id', [$courseId]);
        return array_column($rows, 'n', 'objective_id');
    }

    /** objective_id => ['n'=>题数, 'maxbloom'=>最高层级] */
    public static function objectiveQuestionStats($courseId)
    {
        $rows = DB::all('SELECT objective_id, COUNT(*) n, MAX(bloom) maxbloom FROM questions WHERE course_id=? AND objective_id IS NOT NULL GROUP BY objective_id', [$courseId]);
        $o = [];
        foreach ($rows as $r) {
            $o[$r['objective_id']] = $r;
        }
        return $o;
    }

    public static function paperItems($paperId)
    {
        return DB::all(
            'SELECT pi.id item_id, pi.sort, pi.score full, q.*, o.code ocode, o.content ocontent
             FROM paper_items pi JOIN questions q ON q.id=pi.question_id
             LEFT JOIN objectives o ON o.id=q.objective_id
             WHERE pi.paper_id=? ORDER BY pi.sort, pi.id',
            [$paperId]
        );
    }
}
