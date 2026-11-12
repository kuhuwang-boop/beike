<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Core\View;
use App\Services\Analytics;
use App\Services\Repo;

class PaperController
{
    public function index($id)
    {
        $course = Auth::course($id);
        $papers = DB::all('SELECT p.*, (SELECT COUNT(*) FROM paper_items pi WHERE pi.paper_id=p.id) n,
            (SELECT COALESCE(SUM(score),0) FROM paper_items pi WHERE pi.paper_id=p.id) total,
            (SELECT COUNT(DISTINCT student_no) FROM scores s WHERE s.paper_id=p.id) stu
            FROM papers p WHERE p.course_id=? ORDER BY p.id DESC', [$id]);
        $questions = DB::all('SELECT q.*, o.code ocode FROM questions q LEFT JOIN objectives o ON o.id=q.objective_id WHERE q.course_id=? ORDER BY o.code, q.bloom, q.id', [$id]);
        View::render('papers/index', ['course' => $course, 'papers' => $papers, 'questions' => $questions, 'objectives' => Repo::objectives($id)]);
    }

    public function store($id)
    {
        Auth::course($id);
        $title = input('title') ?: '试卷' . date('Ymd');
        $mode = input('mode', 'manual');
        $chosen = [];
        if ($mode === 'auto') {
            $chosen = $this->autoAssemble($id, max(10, (float)input('total', 100)));
            if (!$chosen) {
                flash('题库题目不足，无法按蓝图组卷。请先为各课程目标补充题目。', 'err');
                redirect("courses/$id/papers");
            }
        } else {
            $ids = array_map('intval', (array)input('qids', []));
            if (!$ids) {
                flash('请至少勾选一道题', 'err');
                redirect("courses/$id/papers");
            }
            $in = implode(',', $ids);
            $chosen = DB::all("SELECT id, score FROM questions WHERE course_id=? AND id IN ($in) ORDER BY FIELD(qtype,'单选','多选','判断','填空','简答','计算','论述','案例分析','设计'), id", [$id]);
        }
        $pid = DB::tx(function () use ($id, $title, $chosen) {
            $pid = DB::insert('papers', ['course_id' => $id, 'title' => mb_substr($title, 0, 200)]);
            foreach ($chosen as $i => $q) {
                DB::insert('paper_items', ['paper_id' => $pid, 'question_id' => $q['id'], 'sort' => $i + 1, 'score' => $q['score']]);
            }
            return $pid;
        });
        flash('试卷已生成，请核对下方双向细目表');
        redirect("papers/$pid");
    }

    /** 按课程目标权重分配分值，优先选层级 ≥ 目标层级、未被用过的题 */
    private function autoAssemble($courseId, $total)
    {
        $objs = Repo::objectives($courseId);
        $picked = [];
        foreach ($objs as $o) {
            $target = $total * (float)$o['weight'] / 100;
            if ($target <= 0) {
                continue;
            }
            $cands = DB::all('SELECT q.id, q.score, q.bloom, q.qtype, (SELECT COUNT(*) FROM paper_items pi WHERE pi.question_id=q.id) used
                FROM questions q WHERE q.course_id=? AND q.objective_id=?', [$courseId, $o['id']]);
            if (!$cands) {
                continue;
            }
            $ob = (int)$o['bloom'];
            usort($cands, function ($a, $b) use ($ob) {
                $ka = [(int)$a['bloom'] >= $ob ? 0 : 1, (int)$a['used'], mt_rand(0, 99)];
                $kb = [(int)$b['bloom'] >= $ob ? 0 : 1, (int)$b['used'], mt_rand(0, 99)];
                return $ka <=> $kb;
            });
            $sum = 0;
            foreach ($cands as $c) {
                if ($sum >= $target - 0.01) {
                    break;
                }
                if ($sum + (float)$c['score'] > $target * 1.25 && $sum > 0) {
                    continue;
                }
                $picked[] = $c;
                $sum += (float)$c['score'];
            }
        }
        $order = array_flip(qtypes());
        usort($picked, function ($a, $b) use ($order) {
            return [($order[$a['qtype']] ?? 99), $a['id']] <=> [($order[$b['qtype']] ?? 99), $b['id']];
        });
        return $picked;
    }

    public function show($id)
    {
        $paper = Auth::paper($id);
        $course = Auth::course($paper['course_id']);
        $objectives = Repo::objectives($course['id']);
        $an = Analytics::paper($id);
        $items = $an ? $an['items'] : [];
        $bank = DB::all('SELECT q.id, q.stem, q.qtype, q.score, o.code ocode FROM questions q LEFT JOIN objectives o ON o.id=q.objective_id
            WHERE q.course_id=? AND q.id NOT IN (SELECT question_id FROM paper_items WHERE paper_id=?) ORDER BY q.id DESC', [$course['id'], $id]);
        View::render('papers/show', compact('paper', 'course', 'objectives', 'items', 'an', 'bank'));
    }

    /** 编辑试卷：改名、改分值、移除题目、追加题目 */
    public function edit($id)
    {
        $paper = Auth::paper($id);
        $title = trim(input('title'));
        DB::tx(function () use ($id, $paper, $title) {
            if ($title !== '') {
                DB::update('papers', ['title' => mb_substr($title, 0, 200)], 'id=?', [$id]);
            }
            $owned = array_map('intval', array_column(DB::all('SELECT id FROM paper_items WHERE paper_id=?', [$id]), 'id'));
            foreach ((array)input('item_score', []) as $iid => $sc) {
                if (in_array((int)$iid, $owned, true) && is_numeric($sc) && $sc >= 0) {
                    DB::update('paper_items', ['score' => (float)$sc], 'id=?', [(int)$iid]);
                }
            }
            foreach ((array)input('item_sort', []) as $iid => $so) {
                if (in_array((int)$iid, $owned, true)) {
                    DB::update('paper_items', ['sort' => (int)$so], 'id=?', [(int)$iid]);
                }
            }
            foreach (array_map('intval', (array)input('remove', [])) as $iid) {
                if (in_array($iid, $owned, true)) {
                    DB::exec('DELETE FROM paper_items WHERE id=?', [$iid]);
                }
            }
            $max = (int)DB::val('SELECT COALESCE(MAX(sort),0) FROM paper_items WHERE paper_id=?', [$id]);
            foreach (array_map('intval', (array)input('add_qids', [])) as $qid) {
                $q = DB::one('SELECT id, score FROM questions WHERE id=? AND course_id=?', [$qid, $paper['course_id']]);
                if ($q) {
                    DB::insert('paper_items', ['paper_id' => $id, 'question_id' => $q['id'], 'sort' => ++$max, 'score' => $q['score']]);
                }
            }
        });
        flash('试卷已更新' . (DB::val('SELECT COUNT(*) FROM scores WHERE paper_id=?', [$id]) ? '（注意：已导入的成绩按题目对应，若改了分值请核对或重新导入）' : ''));
        redirect("papers/$id");
    }

    public function clearScores($id)
    {
        Auth::paper($id);
        DB::exec('DELETE FROM scores WHERE paper_id=?', [$id]);
        flash('已清空本试卷的成绩');
        redirect("papers/$id");
    }

    public function destroy($id)
    {
        $p = Auth::paper($id);
        DB::exec('DELETE FROM papers WHERE id=?', [$id]);
        flash('试卷已删除');
        redirect('courses/' . $p['course_id'] . '/papers');
    }

    public function word($id)
    {
        $paper = Auth::paper($id);
        $course = Auth::course($paper['course_id']);
        $items = Repo::paperItems($id);
        $total = 0;
        foreach ($items as $it) {
            $total += (float)$it['full'];
        }
        $withKey = input('key') === '1';
        ob_start(); ?>
<h1><?= e($course['name']) ?> <?= e($paper['title']) ?></h1>
<p style="text-align:center">（满分 <?= e($total + 0) ?> 分）　　班级：________　学号：________　姓名：________</p>
<?php $lastType = null; $sec = 0; $cn = ['一','二','三','四','五','六','七','八','九','十'];
foreach ($items as $i => $it):
    if ($it['qtype'] !== $lastType): $lastType = $it['qtype']; ?>
<h2><?= $cn[$sec++] ?? $sec ?>、<?= e($it['qtype']) ?>题</h2>
<?php endif; ?>
<p><b><?= $i + 1 ?>.</b>（<?= e($it['full'] + 0) ?>分）<?= nl($it['stem']) ?></p>
<?php if (trim((string)$it['options']) !== ''): ?><p style="margin-left:2em"><?= nl($it['options']) ?></p><?php endif; ?>
<?php if ($withKey): ?><p style="color:#c00">【答案】<?= nl($it['answer']) ?><?php if ($it['analysis']): ?><br>【解析】<?= nl($it['analysis']) ?><?php endif; ?></p>
<?php elseif (!in_array($it['qtype'], ['单选','多选','判断','填空'], true)): ?><p><br><br><br><br></p><?php endif; ?>
<?php endforeach;
        LessonController::sendWord($course['name'] . '-' . $paper['title'] . ($withKey ? '-答案' : ''), ob_get_clean());
    }

    /** 成绩录入模板（Excel 可直接打开） */
    public function template($id)
    {
        $paper = Auth::paper($id);
        $items = Repo::paperItems($id);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="scores.csv"; filename*=UTF-8\'\'' . rawurlencode($paper['title'] . '-成绩模板.csv'));
        echo "\xEF\xBB\xBF";
        $h = ['学号'];
        foreach ($items as $i => $it) {
            $h[] = '第' . ($i + 1) . '题(' . ($it['full'] + 0) . '分)';
        }
        echo implode(',', $h) . "\n";
        echo '2024001' . str_repeat(',', count($items)) . "\n";
        exit;
    }

    public function importScores($id)
    {
        $paper = Auth::paper($id);
        $items = Repo::paperItems($id);
        if (empty($_FILES['csv']['tmp_name']) || !is_uploaded_file($_FILES['csv']['tmp_name'])) {
            flash('请选择 CSV 文件', 'err');
            redirect("papers/$id");
        }
        $raw = file_get_contents($_FILES['csv']['tmp_name']);
        $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
        if (!mb_check_encoding($raw, 'UTF-8')) {
            $raw = mb_convert_encoding($raw, 'UTF-8', 'GB18030'); // Excel 中文版默认存为 GBK
        }
        $lines = preg_split('/\r\n|\r|\n/', trim($raw));
        array_shift($lines); // 表头
        $k = count($items);
        $rows = [];
        $errors = [];
        foreach ($lines as $ln => $line) {
            if (trim($line) === '') {
                continue;
            }
            $cells = str_getcsv($line);
            $stu = trim($cells[0] ?? '');
            if ($stu === '') {
                continue;
            }
            $hasAny = false;
            for ($i = 0; $i < $k; $i++) {
                $v = trim($cells[$i + 1] ?? '');
                if ($v === '') {
                    $v = '0';
                } else {
                    $hasAny = true;
                }
                if (!is_numeric($v)) {
                    $errors[] = "第" . ($ln + 2) . "行 第" . ($i + 1) . "题 不是数字";
                    continue;
                }
                if ((float)$v > (float)$items[$i]['full'] + 0.001 || (float)$v < 0) {
                    $errors[] = "第" . ($ln + 2) . "行（{$stu}）第" . ($i + 1) . "题 得分 {$v} 超出 0–" . ($items[$i]['full'] + 0);
                    continue;
                }
                $rows[] = [$stu, (int)$items[$i]['item_id'], (float)$v];
            }
            if (!$hasAny) {
                // 空行（如模板示例行）忽略
                $rows = array_filter($rows, function ($r) use ($stu) {
                    return $r[0] !== $stu;
                });
            }
        }
        if ($errors) {
            flash('导入失败，请修正后重试：' . implode('；', array_slice($errors, 0, 8)) . (count($errors) > 8 ? ' 等' . count($errors) . '处' : ''), 'err');
            redirect("papers/$id");
        }
        if (!$rows) {
            flash('文件中没有有效成绩', 'err');
            redirect("papers/$id");
        }
        DB::tx(function () use ($id, $rows) {
            DB::exec('DELETE FROM scores WHERE paper_id=?', [$id]);
            foreach ($rows as $r) {
                DB::query('INSERT INTO scores (paper_id, student_no, item_id, score) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE score=VALUES(score)', [$id, $r[0], $r[1], $r[2]]);
            }
        });
        $n = count(array_unique(array_column($rows, 0)));
        flash("已导入 {$n} 名学生的逐题成绩，分析结果见下方");
        redirect("papers/$id");
    }
}
