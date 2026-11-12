<?php
namespace App\Services;

use App\Core\DB;

/**
 * 试题分析与课程目标达成度
 *  难度 P = 平均得分 / 满分（越大越容易）
 *  区分度 D = (高分组27%平均 - 低分组27%平均) / 满分
 *  信度 Cronbach α = k/(k-1) * (1 - Σσi² / σx²)
 *  目标达成度 = Σ(该目标各题平均分) / Σ(该目标各题满分)
 */
class Analytics
{
    /** @return array|null */
    public static function paper($paperId)
    {
        $items = Repo::paperItems($paperId);
        if (!$items) {
            return null;
        }
        $rows = DB::all('SELECT student_no, item_id, score FROM scores WHERE paper_id=?', [$paperId]);
        if (!$rows) {
            return ['items' => $items, 'n' => 0];
        }
        $mat = [];
        foreach ($rows as $r) {
            $mat[$r['student_no']][(int)$r['item_id']] = (float)$r['score'];
        }
        $students = array_keys($mat);
        $n = count($students);
        $totals = [];
        foreach ($students as $s) {
            $t = 0;
            foreach ($items as $it) {
                $t += $mat[$s][(int)$it['item_id']] ?? 0;
            }
            $totals[$s] = $t;
        }
        arsort($totals);
        $ranked = array_keys($totals);
        $g = max(1, (int)round($n * 0.27));
        $high = array_slice($ranked, 0, $g);
        $low = array_slice($ranked, -$g);
        $full = 0;
        foreach ($items as $it) {
            $full += (float)$it['full'];
        }

        $sumVar = 0;
        foreach ($items as &$it) {
            $id = (int)$it['item_id'];
            $vals = [];
            foreach ($students as $s) {
                $vals[] = $mat[$s][$id] ?? 0;
            }
            $f = max(0.0001, (float)$it['full']);
            $mean = array_sum($vals) / $n;
            $it['mean'] = $mean;
            $it['P'] = $mean / $f;
            $it['D'] = $n >= 4 ? (self::avgOf($mat, $high, $id) - self::avgOf($mat, $low, $id)) / $f : null;
            $it['var'] = self::variance($vals);
            $sumVar += $it['var'];
            $flags = [];
            if ($it['P'] < 0.3) {
                $flags[] = '偏难';
            } elseif ($it['P'] > 0.9) {
                $flags[] = '偏易';
            }
            if ($it['D'] !== null) {
                if ($it['D'] < 0) {
                    $flags[] = '负区分(检查答案/题意)';
                } elseif ($it['D'] < 0.2) {
                    $flags[] = '区分度差';
                }
            }
            $it['flags'] = $flags;
        }
        unset($it);

        $k = count($items);
        $varT = self::variance(array_values($totals));
        $alpha = ($k > 1 && $varT > 0) ? ($k / ($k - 1)) * (1 - $sumVar / $varT) : null;

        // 分数段（按总分百分比）
        $bands = ['<60' => 0, '60-69' => 0, '70-79' => 0, '80-89' => 0, '≥90' => 0];
        foreach ($totals as $t) {
            $pct = $full > 0 ? $t / $full * 100 : 0;
            if ($pct < 60) {
                $bands['<60']++;
            } elseif ($pct < 70) {
                $bands['60-69']++;
            } elseif ($pct < 80) {
                $bands['70-79']++;
            } elseif ($pct < 90) {
                $bands['80-89']++;
            } else {
                $bands['≥90']++;
            }
        }

        return [
            'items' => $items,
            'n' => $n,
            'full' => $full,
            'mean' => array_sum($totals) / $n,
            'sd' => sqrt($varT),
            'alpha' => $alpha,
            'bands' => $bands,
            'matrix' => $mat,
            'totals' => $totals,
        ];
    }

    /**
     * 课程目标达成度：合并所有已导入成绩的试卷
     * @return array objective_id => [mean_sum, full_sum, attain, items, below(学生个人达成度低于阈值人数), students]
     */
    public static function attainment($courseId, $threshold)
    {
        $papers = DB::all('SELECT id FROM papers WHERE course_id=?', [$courseId]);
        $agg = [];
        $perStudent = []; // objective => student => [got, full]
        foreach ($papers as $p) {
            $a = self::paper($p['id']);
            if (!$a || $a['n'] === 0) {
                continue;
            }
            foreach ($a['items'] as $it) {
                $oid = (int)$it['objective_id'];
                if (!$oid) {
                    continue;
                }
                if (!isset($agg[$oid])) {
                    $agg[$oid] = ['mean_sum' => 0, 'full_sum' => 0, 'items' => 0];
                }
                $agg[$oid]['mean_sum'] += $it['mean'];
                $agg[$oid]['full_sum'] += (float)$it['full'];
                $agg[$oid]['items']++;
                foreach ($a['matrix'] as $stu => $row) {
                    if (!isset($perStudent[$oid][$stu])) {
                        $perStudent[$oid][$stu] = [0, 0];
                    }
                    $perStudent[$oid][$stu][0] += $row[(int)$it['item_id']] ?? 0;
                    $perStudent[$oid][$stu][1] += (float)$it['full'];
                }
            }
        }
        foreach ($agg as $oid => &$x) {
            $x['attain'] = $x['full_sum'] > 0 ? $x['mean_sum'] / $x['full_sum'] : null;
            $below = 0;
            $cnt = 0;
            foreach ($perStudent[$oid] ?? [] as $gf) {
                $cnt++;
                if ($gf[1] > 0 && $gf[0] / $gf[1] < $threshold) {
                    $below++;
                }
            }
            $x['below'] = $below;
            $x['students'] = $cnt;
        }
        unset($x);
        return $agg;
    }

    private static function avgOf($mat, $group, $id)
    {
        $s = 0;
        foreach ($group as $stu) {
            $s += $mat[$stu][$id] ?? 0;
        }
        return $s / max(1, count($group));
    }

    public static function variance(array $v)
    {
        $n = count($v);
        if ($n === 0) {
            return 0;
        }
        $m = array_sum($v) / $n;
        $s = 0;
        foreach ($v as $x) {
            $s += ($x - $m) * ($x - $m);
        }
        return $s / $n;
    }
}
