<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Core\View;
use App\Services\Analytics;
use App\Services\Repo;

class AnalysisController
{
    public function index($id)
    {
        $course = Auth::course($id);
        $objectives = Repo::objectives($id);
        $th = (float)$course['attain_threshold'];
        $att = Analytics::attainment($id, $th);
        $wsum = 0;
        $acc = 0;
        foreach ($objectives as $o) {
            if (isset($att[$o['id']]) && $att[$o['id']]['attain'] !== null) {
                $wsum += (float)$o['weight'];
                $acc += (float)$o['weight'] * $att[$o['id']]['attain'];
            }
        }
        $overall = $wsum > 0 ? $acc / $wsum : null;
        $papers = [];
        foreach (DB::all('SELECT * FROM papers WHERE course_id=? ORDER BY id', [$id]) as $p) {
            $a = Analytics::paper($p['id']);
            if ($a && $a['n'] > 0) {
                $p['an'] = $a;
                $papers[] = $p;
            }
        }
        // 低达成目标 → 关联的课次（用于回到教案改进）
        $weakLessons = [];
        foreach ($objectives as $o) {
            if (isset($att[$o['id']]) && $att[$o['id']]['attain'] !== null && $att[$o['id']]['attain'] < $th) {
                $weakLessons[$o['id']] = DB::all('SELECT l.id, l.seq, l.title FROM lesson_objectives lo JOIN lessons l ON l.id=lo.lesson_id WHERE lo.objective_id=? ORDER BY l.seq', [$o['id']]);
            }
        }
        View::render('analysis/index', compact('course', 'objectives', 'att', 'overall', 'papers', 'weakLessons', 'th'));
    }
}
