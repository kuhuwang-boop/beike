<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Core\View;
use App\Services\Checks;
use App\Services\Repo;

class DashboardController
{
    public function index()
    {
        $uid = Auth::id();
        $courses = DB::all(
            'SELECT c.*,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id) lesson_n,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id AND l.status<>\'draft\') ready_n,
              (SELECT COUNT(*) FROM questions q WHERE q.course_id=c.id) q_n
             FROM courses c WHERE c.user_id=? ORDER BY c.id DESC',
            [$uid]
        );
        foreach ($courses as &$c) {
            $checks = Checks::course(
                $c,
                Repo::objectives($c['id']),
                Repo::gradReqs($c['id']),
                Repo::matrix($c['id']),
                Repo::objectiveLessonCounts($c['id']),
                Repo::objectiveQuestionStats($c['id']),
                Repo::lessons($c['id'])
            );
            $c['checks'] = Checks::counts($checks);
        }
        unset($c);

        $upcoming = DB::all(
            'SELECT l.*, c.name cname FROM lessons l JOIN courses c ON c.id=l.course_id
             WHERE c.user_id=? AND l.class_date IS NOT NULL AND l.class_date >= CURDATE()
             ORDER BY l.class_date, l.seq LIMIT 8',
            [$uid]
        );
        $needReflect = DB::all(
            'SELECT l.*, c.name cname FROM lessons l JOIN courses c ON c.id=l.course_id
             WHERE c.user_id=? AND l.class_date IS NOT NULL AND l.class_date < CURDATE()
               AND (l.reflection IS NULL OR l.reflection=\'\')
             ORDER BY l.class_date DESC LIMIT 6',
            [$uid]
        );
        View::render('dashboard', compact('courses', 'upcoming', 'needReflect'));
    }

    public function guide()
    {
        redirect('manual');
    }
}
