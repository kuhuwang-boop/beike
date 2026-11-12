<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Core\View;
use App\Services\Repo;

class QuestionController
{
    public function index($id)
    {
        $course = Auth::course($id);
        $where = 'q.course_id=?';
        $p = [$id];
        if (($o = (int)input('objective')) > 0) {
            $where .= ' AND q.objective_id=?';
            $p[] = $o;
        }
        if (($b = (int)input('bloom')) > 0) {
            $where .= ' AND q.bloom=?';
            $p[] = $b;
        }
        if (($t = input('qtype')) !== '') {
            $where .= ' AND q.qtype=?';
            $p[] = $t;
        }
        if (($k = input('kw')) !== '') {
            $where .= ' AND q.stem LIKE ?';
            $p[] = '%' . $k . '%';
        }
        $questions = DB::all("SELECT q.*, o.code ocode,
            (SELECT COUNT(*) FROM paper_items pi WHERE pi.question_id=q.id) used
            FROM questions q LEFT JOIN objectives o ON o.id=q.objective_id WHERE $where ORDER BY q.id DESC", $p);
        $objectives = Repo::objectives($id);
        // 双向细目：目标 × 布鲁姆层级 的题量
        $grid = [];
        foreach (DB::all('SELECT objective_id, bloom, COUNT(*) n FROM questions WHERE course_id=? GROUP BY objective_id, bloom', [$id]) as $r) {
            $grid[(int)$r['objective_id']][(int)$r['bloom']] = (int)$r['n'];
        }
        View::render('questions/index', compact('course', 'questions', 'objectives', 'grid'));
    }

    private function fields($courseId)
    {
        $oid = (int)input('objective_id');
        $valid = array_map('intval', array_column(Repo::objectives($courseId), 'id'));
        return [
            'objective_id' => in_array($oid, $valid, true) ? $oid : null,
            'bloom' => min(6, max(1, (int)input('bloom', 2))),
            'qtype' => mb_substr(input('qtype', '简答'), 0, 20),
            'stem' => input('stem'),
            'options' => input('options'),
            'answer' => input('answer'),
            'analysis' => input('analysis'),
            'difficulty_est' => min(5, max(1, (int)input('difficulty_est', 3))),
            'score' => max(0, (float)input('score', 10)),
        ];
    }

    public function store($id)
    {
        Auth::course($id);
        $f = $this->fields($id);
        if (trim($f['stem']) === '') {
            flash('题干不能为空', 'err');
            back();
        }
        $f['course_id'] = $id;
        DB::insert('questions', $f);
        flash('题目已加入题库');
        redirect("courses/$id/questions");
    }

    /** 保存 AI 生成并经教师勾选的题目 */
    public function storeBatch($id)
    {
        $course = Auth::course($id);
        $valid = [];
        foreach (Repo::objectives($id) as $o) {
            $valid[(int)$o['id']] = $o;
        }
        $body = json_body();
        $n = 0;
        foreach ((array)($body['questions'] ?? []) as $q) {
            $stem = trim((string)($q['stem'] ?? ''));
            if ($stem === '') {
                continue;
            }
            $oid = (int)($q['objective_id'] ?? 0);
            $evidence = trim((string)($q['evidence'] ?? ''));
            $src = (string)$course['syllabus'] . "\n" . (isset($valid[$oid]) ? $valid[$oid]['content'] : '');
            $opts = $q['options'] ?? '';
            if (is_array($opts)) {
                $opts = implode("\n", $opts);
            }
            DB::insert('questions', [
                'course_id' => $id,
                'objective_id' => isset($valid[$oid]) ? $oid : null,
                'bloom' => min(6, max(1, (int)($q['bloom'] ?? 2))),
                'qtype' => mb_substr((string)($q['qtype'] ?? '简答'), 0, 20),
                'stem' => $stem,
                'options' => (string)$opts,
                'answer' => (string)($q['answer'] ?? ''),
                'analysis' => (string)($q['analysis'] ?? ''),
                'difficulty_est' => min(5, max(1, (int)($q['difficulty'] ?? 3))),
                'score' => max(0, (float)($q['score'] ?? 10)),
                'source' => 'AI',
                'evidence' => $evidence,
                'evidence_ok' => $evidence === '' ? 0 : (evidence_in($evidence, $src) ? 1 : 0),
            ]);
            $n++;
        }
        json_out(['ok' => true, 'saved' => $n]);
    }

    public function edit($id)
    {
        $q = DB::one('SELECT q.* FROM questions q JOIN courses c ON c.id=q.course_id WHERE q.id=? AND c.user_id=?', [$id, Auth::id()]);
        if (!$q) {
            http_response_code(404);
            exit('题目不存在');
        }
        $course = Auth::course($q['course_id']);
        View::render('questions/edit', ['q' => $q, 'course' => $course, 'objectives' => Repo::objectives($course['id'])]);
    }

    public function update($id)
    {
        $q = DB::one('SELECT q.* FROM questions q JOIN courses c ON c.id=q.course_id WHERE q.id=? AND c.user_id=?', [$id, Auth::id()]);
        if (!$q) {
            exit('题目不存在');
        }
        DB::update('questions', $this->fields($q['course_id']), 'id=?', [$id]);
        flash('题目已更新');
        redirect('courses/' . $q['course_id'] . '/questions');
    }

    public function destroy($id)
    {
        $q = DB::one('SELECT q.* FROM questions q JOIN courses c ON c.id=q.course_id WHERE q.id=? AND c.user_id=?', [$id, Auth::id()]);
        if ($q) {
            DB::exec('DELETE FROM questions WHERE id=?', [$id]);
        }
        flash('题目已删除');
        back();
    }
}
