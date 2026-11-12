<?php
namespace App\Services;

use App\Core\DB;

/**
 * 教学技能库。每个技能是一段可复用的教学方法说明，老师为某节课选中后，
 * 会作为“本节课要采用的教学方法”注入到相关 AI 成员的工作要求中。
 */
class Skills
{
    const MAX_PER_LESSON = 6;

    /** 把 database/skills.json 中尚未入库的内置技能写入数据库（按 skey 去重，不覆盖老师的修改） */
    public static function seed()
    {
        $f = BASE_PATH . '/database/skills.json';
        if (!is_file($f)) {
            return 0;
        }
        $list = json_decode(file_get_contents($f), true) ?: [];
        $have = array_column(DB::all('SELECT skey FROM skills'), 'skey');
        $n = 0;
        foreach ($list as $i => $s) {
            if (in_array($s['key'], $have, true)) {
                continue;
            }
            DB::insert('skills', [
                'skey' => $s['key'], 'name' => $s['name'], 'category' => $s['category'], 'summary' => $s['summary'],
                'instructions' => $s['instructions'], 'agents' => implode(',', $s['agents']), 'evidence' => $s['evidence'],
                'source' => $s['source'] . (!empty($s['original']) ? ' · ' . $s['original'] : ''), 'license' => $s['license'],
                'enabled' => 1, 'sort' => ($i + 1) * 10, 'builtin' => 1,
            ]);
            $n++;
        }
        return $n;
    }

    /** 系统教学方法（管理员维护，所有老师可用） */
    public static function all($enabledOnly = false)
    {
        return DB::all('SELECT * FROM skills WHERE user_id IS NULL' . ($enabledOnly ? ' AND enabled=1' : '') . ' ORDER BY sort, id');
    }

    /** 老师自己的技能 */
    public static function mine($uid)
    {
        return DB::all('SELECT * FROM skills WHERE user_id=? ORDER BY id DESC', [$uid]);
    }

    /** 老师可选用的全部技能：自己的在前，系统的在后 */
    public static function available($uid)
    {
        return array_merge(
            DB::all('SELECT * FROM skills WHERE user_id=? AND enabled=1 ORDER BY id DESC', [$uid]),
            self::all(true)
        );
    }

    public static function ownerOf($lessonId)
    {
        return (int)DB::val('SELECT c.user_id FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=?', [$lessonId]);
    }

    public static function lessonIds($lessonId)
    {
        $t = (string)DB::val('SELECT skills_text FROM lesson_meta WHERE lesson_id=?', [$lessonId]);
        return array_values(array_filter(array_map('intval', explode(',', $t))));
    }

    /** 只保留该老师有权使用的技能 */
    public static function filterIds($uid, array $ids)
    {
        $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', $ids)))), 0, self::MAX_PER_LESSON);
        if (!$ids) {
            return [];
        }
        $ok = array_map('intval', array_column(DB::all('SELECT id FROM skills WHERE enabled=1 AND (user_id IS NULL OR user_id=?) AND id IN (' . implode(',', $ids) . ')', [$uid]), 'id'));
        return array_values(array_filter($ids, function ($i) use ($ok) {
            return in_array($i, $ok, true);
        }));
    }

    public static function setLesson($lessonId, array $ids)
    {
        $ids = self::filterIds(self::ownerOf($lessonId), $ids);
        Agents::setMeta($lessonId, ['skills_text' => implode(',', $ids)]);
        return $ids;
    }

    public static function forLesson($lessonId)
    {
        $ids = self::lessonIds($lessonId);
        if (!$ids) {
            return [];
        }
        return DB::all('SELECT * FROM skills WHERE enabled=1 AND (user_id IS NULL OR user_id=?) AND id IN (' . implode(',', $ids) . ') ORDER BY (user_id IS NULL), sort, id', [self::ownerOf($lessonId)]);
    }

    /**
     * 生成给某位成员的附加要求：课型 + 老师的备课风格 + 本节课选定的技能。
     * 组长和学情分析师只需知道选了什么；其他成员拿到完整做法。
     */
    public static function prompt($lessonId, $agent)
    {
        if (!$lessonId) {
            return '';
        }
        $uid = self::ownerOf($lessonId);
        $type = (string)DB::val('SELECT lesson_type FROM lesson_meta WHERE lesson_id=?', [$lessonId]);
        $head = Style::typeText($type) . Style::text($uid);
        $list = self::forLesson($lessonId);
        $seen = [];
        $list = array_values(array_filter($list, function ($s) use (&$seen) {
            $k = $s['name'] . '|' . $s['instructions'];
            if (isset($seen[$k])) {
                return false;
            }
            return $seen[$k] = true;
        }));
        if (!$list) {
            return $head;
        }
        if ($agent === 'leader' || $agent === 'analyst') {
            return $head . "\n【老师为本节课选定的方法与风格技能】" . implode('、', array_column($list, 'name')) . "。安排任务时请让相关成员落实。\n";
        }
        $out = '';
        foreach ($list as $s) {
            $ag = array_filter(explode(',', (string)$s['agents']));
            if ($ag && !in_array($agent, $ag, true) && $agent !== 'reviewer') {
                continue;
            }
            $out .= "\n◆ {$s['name']}" . ($s['user_id'] ? '（老师自己的要求，优先遵守）' : '') . "：{$s['instructions']}";
        }
        if ($out === '') {
            return $head;
        }
        if ($agent === 'reviewer') {
            return $head . "\n【老师为本节课选定的方法与风格技能——请检查课件是否真正落实，没落实的直接补上】" . $out . "\n";
        }
        return $head . "\n【老师为本节课选定的方法与风格技能——你的产出必须具体体现以下做法】" . $out . "\n";
    }

    /** 统一清洗表单输入 */
    public static function clean(array $in)
    {
        $agents = array_intersect((array)($in['agents'] ?? []), array_keys(Agents::roles()));
        return [
            'name' => mb_substr(trim((string)($in['name'] ?? '')), 0, 60),
            'category' => mb_substr(trim((string)($in['category'] ?? '')) ?: '我的方法', 0, 40),
            'summary' => mb_substr(trim((string)($in['summary'] ?? '')), 0, 500),
            'instructions' => mb_substr(trim((string)($in['instructions'] ?? '')), 0, 4000),
            'agents' => implode(',', $agents),
            'evidence' => mb_substr(trim((string)($in['evidence'] ?? '')), 0, 300),
            'source' => mb_substr(trim((string)($in['source'] ?? '')), 0, 200),
            'license' => mb_substr(trim((string)($in['license'] ?? '')), 0, 100),
            'enabled' => !empty($in['enabled']) ? 1 : 0,
        ];
    }
}
