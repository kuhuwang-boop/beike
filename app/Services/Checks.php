<?php
namespace App\Services;

/**
 * 确定性的对齐检查 —— 不依赖 AI，规则透明可复核。
 * 每条结果: ['level'=>'error'|'warn'|'info', 'msg'=>string]
 */
class Checks
{
    public static function lesson(array $lesson, array $segments, array $lessonObjIds, array $objectives, array $qStats)
    {
        $out = [];
        $objById = [];
        foreach ($objectives as $o) {
            $objById[(int)$o['id']] = $o;
        }
        $dur = (int)$lesson['duration_min'];
        $sum = 0;
        $phasesSeen = [];
        $activeMin = 0;
        foreach ($segments as $s) {
            $sum += (int)$s['minutes'];
            $phasesSeen[$s['phase']] = true;
            if (trim((string)$s['student_act']) !== '') {
                $activeMin += (int)$s['minutes'];
            }
        }

        // 1 时间预算
        if (!$segments) {
            $out[] = ['level' => 'error', 'msg' => '还没有任何教学环节。'];
        } elseif ($sum !== $dur) {
            $diff = $sum - $dur;
            $out[] = ['level' => 'error', 'msg' => sprintf('环节时长合计 %d 分钟，与课时 %d 分钟不符（%s%d 分钟）。', $sum, $dur, $diff > 0 ? '超出 ' : '还差 ', abs($diff))];
        }

        // 2 目标
        if (!$lessonObjIds) {
            $out[] = ['level' => 'error', 'msg' => '本课次没有关联任何课程目标——逆向设计的第一步是先确定目标。'];
        }
        foreach ($lessonObjIds as $oid) {
            if (!isset($objById[$oid])) {
                continue;
            }
            $o = $objById[$oid];
            $assessed = false;
            $practiced = false;
            foreach ($segments as $s) {
                if ((int)$s['objective_id'] !== $oid) {
                    continue;
                }
                if ($s['phase'] === 'P3' || trim((string)$s['assess_method']) !== '') {
                    $assessed = true;
                }
                if (trim((string)$s['student_act']) !== '') {
                    $practiced = true;
                }
            }
            if (!$assessed) {
                $out[] = ['level' => 'warn', 'msg' => "目标 {$o['code']} 在课堂上没有任何评价方式（后测或任一环节的“检测方式”），无法知道是否达成。"];
            }
            if ((int)$o['bloom'] >= 3 && !$practiced) {
                $out[] = ['level' => 'warn', 'msg' => "目标 {$o['code']} 属于「" . bloom_name($o['bloom']) . "」层级，但没有对应的学生练习活动——听讲只能到“理解”层级。"];
            }
            if (empty($qStats[$oid])) {
                $out[] = ['level' => 'info', 'msg' => "目标 {$o['code']} 在题库中还没有题目，期末将无法评价达成度。"];
            }
        }

        // 3 BOPPPS 完整性
        if ($segments) {
            $missing = [];
            foreach (['B', 'O', 'P1', 'P2', 'P3', 'S'] as $p) {
                if (empty($phasesSeen[$p])) {
                    $missing[] = phase_name($p);
                }
            }
            if ($missing) {
                $out[] = ['level' => in_array(phase_name('P3'), $missing, true) ? 'warn' : 'info', 'msg' => '缺少环节：' . implode('、', $missing) . '。'];
            }
        }

        // 4 学生主动学习时间
        if ($sum > 0) {
            $ratio = $activeMin / $sum;
            if ($ratio < 0.3) {
                $out[] = ['level' => 'warn', 'msg' => sprintf('学生有明确活动的时间只占 %.0f%%（建议 ≥30%%）。', $ratio * 100)];
            }
        }
        foreach ($segments as $s) {
            if ((int)$s['minutes'] > 20 && trim((string)$s['student_act']) === '') {
                $out[] = ['level' => 'warn', 'msg' => sprintf('「%s」连续讲授 %d 分钟且没有学生活动，超过一般注意力持续时长（约 15–20 分钟），建议插入提问或小练习。', phase_name($s['phase']), $s['minutes'])];
            }
        }

        // 5 专家习惯
        if (trim((string)$lesson['misconceptions']) === '') {
            $out[] = ['level' => 'info', 'msg' => '没有写“预判学生误区”——提前写下学生最可能错在哪，是区分新手和资深教师的关键。'];
        }
        if (trim((string)$lesson['ideology']) === '') {
            $out[] = ['level' => 'info', 'msg' => '没有写课程思政融入点。'];
        }
        if ($lesson['status'] === 'taught' && trim((string)$lesson['reflection']) === '') {
            $out[] = ['level' => 'info', 'msg' => '本课已上完，记得写教学反思，复制到新学期时会一起带过去。'];
        }
        return $out;
    }

    public static function course(array $course, array $objectives, array $gradReqs, array $matrix, array $lessonCounts, array $qStats, array $lessons)
    {
        $out = [];
        if (!$objectives) {
            return [['level' => 'error', 'msg' => '还没有课程目标。可在「目标与矩阵」页手工填写，或让 AI 从大纲中提取。']];
        }
        $w = 0;
        foreach ($objectives as $o) {
            $w += (float)$o['weight'];
        }
        if (abs($w - 100) > 0.01) {
            $out[] = ['level' => 'error', 'msg' => sprintf('课程目标权重合计为 %s%%，应为 100%%。', rtrim(rtrim(number_format($w, 2), '0'), '.'))];
        }
        foreach ($objectives as $o) {
            $id = (int)$o['id'];
            if ($gradReqs && empty($matrix[$id])) {
                $out[] = ['level' => 'warn', 'msg' => "目标 {$o['code']} 没有支撑任何毕业要求指标点。"];
            }
            if (empty($lessonCounts[$id])) {
                $out[] = ['level' => 'warn', 'msg' => "目标 {$o['code']} 没有被任何课次覆盖。"];
            }
            if (empty($qStats[$id])) {
                $out[] = ['level' => 'warn', 'msg' => "目标 {$o['code']} 题库中没有题目。"];
            } elseif ((int)$qStats[$id]['maxbloom'] < (int)$o['bloom']) {
                $out[] = ['level' => 'warn', 'msg' => "目标 {$o['code']} 要求「" . bloom_name($o['bloom']) . "」，但题库中最高只到「" . bloom_name($qStats[$id]['maxbloom']) . "」——评价层级低于目标层级。"];
            }
        }
        foreach ($gradReqs as $g) {
            $has = false;
            foreach ($matrix as $row) {
                if (isset($row[$g['id']])) {
                    $has = true;
                }
            }
            if (!$has) {
                $out[] = ['level' => 'warn', 'msg' => "毕业要求指标点 {$g['code']} 没有课程目标支撑。"];
            }
        }
        if ((int)$course['hours'] > 0 && $lessons) {
            $planned = 0;
            foreach ($lessons as $l) {
                $planned += (int)$l['duration_min'];
            }
            $need = (int)$course['hours'] * 45;
            if ($planned !== $need) {
                $out[] = ['level' => 'info', 'msg' => sprintf('已排课次合计 %d 分钟，课程 %d 学时 ≈ %d 分钟。', $planned, $course['hours'], $need)];
            }
        }
        return $out;
    }

    public static function counts(array $checks)
    {
        $c = ['error' => 0, 'warn' => 0, 'info' => 0];
        foreach ($checks as $x) {
            $c[$x['level']]++;
        }
        return $c;
    }
}
