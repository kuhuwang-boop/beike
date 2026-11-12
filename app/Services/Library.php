<?php
namespace App\Services;

use App\Core\DB;

/** 个人资料库 */
class Library
{
    const MAX_ITEMS = 500;

    /** 存入资料库；内容完全相同的不重复保存。返回条目 id */
    public static function add($uid, $filename, $content, $folder = '')
    {
        $content = mb_substr(trim((string)$content), 0, 200000);
        if ($content === '') {
            return 0;
        }
        $hash = sha1($content);
        $id = (int)DB::val('SELECT id FROM library WHERE user_id=? AND hash=?', [$uid, $hash]);
        if ($id) {
            return $id;
        }
        if ((int)DB::val('SELECT COUNT(*) FROM library WHERE user_id=?', [$uid]) >= self::MAX_ITEMS) {
            return 0;
        }
        return DB::insert('library', [
            'user_id' => $uid, 'folder' => mb_substr(trim((string)$folder), 0, 60),
            'filename' => mb_substr(trim((string)$filename), 0, 200) ?: '资料',
            'content' => $content, 'chars' => mb_strlen($content), 'hash' => $hash,
        ]);
    }

    public static function listFor($uid, $q = '')
    {
        $q = trim((string)$q);
        if ($q !== '') {
            $like = '%' . addcslashes($q, '%_\\') . '%';
            return DB::all('SELECT id, folder, filename, chars, created_at FROM library WHERE user_id=? AND (filename LIKE ? OR folder LIKE ? OR content LIKE ?) ORDER BY folder, id DESC', [$uid, $like, $like, $like]);
        }
        return DB::all('SELECT id, folder, filename, chars, created_at FROM library WHERE user_id=? ORDER BY folder, id DESC', [$uid]);
    }

    /** 把课题拆成检索词：中文取相邻两字，英文数字取整词 */
    private static function terms($title)
    {
        $t = [];
        preg_match_all('/[A-Za-z0-9+#]{2,}/u', $title, $m);
        foreach ($m[0] as $w) {
            $t[mb_strtolower($w)] = 1;
        }
        preg_match_all('/\p{Han}+/u', $title, $m);
        foreach ($m[0] as $seg) {
            $n = mb_strlen($seg);
            for ($i = 0; $i < $n - 1; $i++) {
                $t[mb_substr($seg, $i, 2)] = 1;
            }
        }
        foreach (['的', '与', '和', '及'] as $stop) {
            foreach (array_keys($t) as $k) {
                if (mb_strpos($k, $stop) !== false && mb_strlen($k) <= 2) {
                    unset($t[$k]);
                }
            }
        }
        return array_keys($t);
    }

    /** 按课题推荐资料库里可能相关的资料（固定规则打分，不调用 AI） */
    public static function suggest($uid, $title, $limit = 5)
    {
        $terms = self::terms((string)$title);
        if (!$terms) {
            return [];
        }
        $rows = DB::all('SELECT id, folder, filename, chars, LEFT(content, 6000) head FROM library WHERE user_id=? ORDER BY id DESC LIMIT 300', [$uid]);
        $out = [];
        $need = count($terms) <= 2 ? count($terms) : (int)ceil(count($terms) * 0.6);
        foreach ($rows as $r) {
            $name = mb_strtolower($r['filename'] . ' ' . $r['folder']);
            $head = mb_strtolower((string)$r['head']);
            $score = 0;
            $hit = 0;
            foreach ($terms as $w) {
                $inName = mb_strpos($name, $w) !== false;
                $c = mb_substr_count($head, $w);
                if ($inName || $c) {
                    $hit++;
                }
                $score += ($inName ? 4 : 0) + min(3, $c);
            }
            // 课题里的关键词大部分都能在资料中找到才算相关（看覆盖面，不只看出现次数）
            if ($hit >= $need) {
                $out[] = ['id' => (int)$r['id'], 'folder' => $r['folder'], 'filename' => $r['filename'], 'chars' => (int)$r['chars'], 'score' => $score + $hit * 2];
            }
        }
        usort($out, function ($a, $b) {
            return $b['score'] <=> $a['score'];
        });
        return array_slice($out, 0, $limit);
    }

    /** 把资料库条目复制成某份课件的资料；返回复制的文件名 */
    public static function attach($uid, $lessonId, array $ids)
    {
        $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', $ids)))), 0, 20);
        if (!$ids) {
            return [];
        }
        $names = [];
        $have = array_column(DB::all('SELECT SHA1(content) h FROM materials WHERE lesson_id=?', [$lessonId]), 'h');
        foreach (DB::all('SELECT filename, content, hash FROM library WHERE user_id=? AND id IN (' . implode(',', $ids) . ')', [$uid]) as $r) {
            if (in_array($r['hash'], $have, true)) {
                continue;
            }
            DB::insert('materials', ['lesson_id' => $lessonId, 'filename' => $r['filename'], 'content' => $r['content']]);
            $names[] = $r['filename'];
        }
        return $names;
    }
}
