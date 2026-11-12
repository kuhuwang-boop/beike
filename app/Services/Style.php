<?php
namespace App\Services;

/** 每位老师自己的备课风格：备课偏好、默认技能、常用指令；以及课型预设 */
class Style
{
    /** 课型预设：名称、一句说明、给 AI 团队的要求 */
    const TYPES = [
        'new' => ['新授课', '讲新知识：导入、讲解、练习、小结', ''],
        'review' => ['复习课', '梳理知识体系，抓易错点和典型题',
            '这是一节复习课：不要按新授课逐点重讲。先用结构图（分类树/分层结构等）梳理本单元知识体系，再集中处理易错点和典型题（每类给一道代表题和解题思路），安排一次限时检测，最后给出复习清单。'],
        'exercise' => ['习题课', '讲题为主：方法归纳、变式训练',
            '这是一节习题课：以题目为主线，按“题型 → 一道样例的完整思路 → 变式练习 → 方法小结”组织；每类题先让学生试做再讲解，讲稿里写出常见错误做法及纠正；课件上一页一题，答案和详细步骤放在讲稿备注。'],
        'lab' => ['实验 / 实训课', '任务驱动：任务书、操作步骤、安全与评分',
            '这是一节实验/实训课（理实一体）：按“任务导入 → 任务书（目标、器材/环境、成果要求）→ 关键操作步骤演示（用流程结构图）→ 安全与规范注意事项 → 学生分组实操 → 检查与评分标准 → 总结与工单/报告要求”组织；讲授压缩在 1/3 课时以内，学生动手不少于一半课时；评分标准用表格化的三栏对照呈现。'],
        'seminar' => ['研讨课', '围绕问题讨论，学生为主',
            '这是一节研讨课：围绕 2–3 个有争议或开放性的核心问题组织；课前给阅读材料和思考题，课上按“问题呈现 → 小组讨论（写明分组、时间、产出）→ 汇报与互评 → 教师点评提升”进行；课件页数宜少，重点呈现问题、讨论规则和总结框架。'],
        'open' => ['公开课 / 教学比赛', '全员精品打磨，环节完整、亮点突出',
            '这是一节公开课/教学比赛用课，请按精品流程全员打磨：教学环节完整（导入、目标、前测、参与式学习、后测、总结），时间分配精确到分钟，至少一处有记忆点的教学创新（情境、活动或信息化手段），课程思政自然融入，讲稿逐页写全并标注时间。'],
    ];

    const TONES = ['' => '不限', 'rigorous' => '严谨规范', 'friendly' => '亲切口语', 'lively' => '生动幽默'];
    const DENSITY = ['' => '不限', 'lean' => '精简：每页不超过 4 条、每条 18 字内', 'normal' => '适中：每页 4–5 条', 'rich' => '详细：要点写完整，方便学生课后复习'];
    const MUST = ['case' => '案例导入', 'interact' => '课堂互动 / 提问', 'ideology' => '课程思政', 'practice' => '随堂练习', 'task' => '实训任务', 'summary' => '小结与作业'];

    public static function profile($uid)
    {
        $p = json_decode((string)setting('style_profile_' . (int)$uid, ''), true) ?: [];
        return $p + ['tone' => '', 'density' => '', 'students' => '', 'cases' => '', 'must' => [], 'avoid' => '', 'notes' => ''];
    }

    public static function setProfile($uid, array $in)
    {
        $cut = function ($k, $n) use ($in) {
            return mb_substr(trim((string)($in[$k] ?? '')), 0, $n);
        };
        $p = [
            'tone' => array_key_exists((string)($in['tone'] ?? ''), self::TONES) ? (string)$in['tone'] : '',
            'density' => array_key_exists((string)($in['density'] ?? ''), self::DENSITY) ? (string)$in['density'] : '',
            'students' => $cut('students', 200), 'cases' => $cut('cases', 200),
            'must' => array_values(array_intersect((array)($in['must'] ?? []), array_keys(self::MUST))),
            'avoid' => $cut('avoid', 300), 'notes' => $cut('notes', 800),
        ];
        set_setting('style_profile_' . (int)$uid, json_encode($p, JSON_UNESCAPED_UNICODE));
    }

    /** 把备课偏好写成给 AI 团队的要求；没填返回空串 */
    public static function text($uid)
    {
        $p = self::profile($uid);
        $l = [];
        if ($p['students'] !== '') {
            $l[] = "我的学生：{$p['students']}（讲解深度、例子和练习难度都要与之匹配）";
        }
        if ($p['tone']) {
            $l[] = '语言风格：' . self::TONES[$p['tone']] . ['rigorous' => '，术语准确、表述规范', 'friendly' => '，像和学生聊天一样，少用书面套话', 'lively' => '，可以用类比、小故事和适度的幽默'][$p['tone']];
        }
        if ($p['density']) {
            $l[] = '每页信息量：' . self::DENSITY[$p['density']];
        }
        if ($p['must']) {
            $l[] = '每节课必须有：' . implode('、', array_map(function ($k) {
                return self::MUST[$k];
            }, $p['must']));
        }
        if ($p['cases'] !== '') {
            $l[] = "案例偏好：{$p['cases']}";
        }
        if ($p['avoid'] !== '') {
            $l[] = "不要这样做：{$p['avoid']}";
        }
        if ($p['notes'] !== '') {
            $l[] = "其他习惯：{$p['notes']}";
        }
        return $l ? "\n【这位老师的备课风格——所有产出都要符合】\n- " . implode("\n- ", $l) . "\n" : '';
    }

    public static function typeText($type)
    {
        return isset(self::TYPES[$type]) && self::TYPES[$type][2] !== '' ? "\n【课型】" . self::TYPES[$type][2] . "\n" : '';
    }

    /** 新课件默认启用的技能 id */
    public static function defaults($uid)
    {
        return array_values(array_filter(array_map('intval', explode(',', (string)setting('default_skills_' . (int)$uid, '')))));
    }

    public static function setDefaults($uid, array $ids)
    {
        $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', $ids)))), 0, Skills::MAX_PER_LESSON);
        set_setting('default_skills_' . (int)$uid, implode(',', $ids));
    }

    /** 常用指令（在课件工作室里一点就发） */
    public static function cmds($uid)
    {
        return array_values(array_filter((array)json_decode((string)setting('quick_cmds_' . (int)$uid, ''), true), 'is_string'));
    }

    public static function setCmds($uid, array $list)
    {
        $out = [];
        foreach ($list as $c) {
            $c = mb_substr(trim((string)$c), 0, 120);
            if ($c !== '' && !in_array($c, $out, true)) {
                $out[] = $c;
            }
        }
        set_setting('quick_cmds_' . (int)$uid, json_encode(array_slice($out, 0, 12), JSON_UNESCAPED_UNICODE));
        return array_slice($out, 0, 12);
    }
}
