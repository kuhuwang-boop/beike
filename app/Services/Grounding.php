<?php
namespace App\Services;

use App\Core\DB;

/**
 * 出处核对（不调用 AI）：逐条比对课件内容与老师的原始资料。
 * - 每条要点：在资料里找最相近的一句，按字面重合度标为「有出处 / 部分有出处 / AI 补充」
 * - 数字、年份、百分比：资料里找不到的单独列出（讲错数据的代价最大）
 * 原理：把文字切成相邻两字（字符二元组），用倒排索引找重合最多的句子。
 */
class Grounding
{
    const SRC = 0.68;   // 重合度达到这个比例算「有出处」
    const PART = 0.38;  // 达到这个比例算「部分有出处」

    /** 资料原文：本课资料，没有就用自动匹配的资料库参考 */
    public static function sourceText($lessonId)
    {
        $rows = DB::all('SELECT filename, content FROM materials WHERE lesson_id=? ORDER BY id', [$lessonId]);
        if (!$rows) {
            $rows = Agents::libraryRefs($lessonId);
        }
        $t = '';
        foreach ($rows as $r) {
            $t .= "\n" . (string)$r['content'];
        }
        return mb_substr($t, 0, 400000);
    }

    public static function norm($s)
    {
        $s = mb_strtolower((string)$s, 'UTF-8');
        // 全角数字字母转半角
        $s = mb_convert_kana($s, 'as', 'UTF-8');
        return preg_replace('/[^\p{Han}\p{L}\p{N}%.]+/u', '', $s);
    }

    private static function grams($n)
    {
        $c = preg_split('//u', $n, -1, PREG_SPLIT_NO_EMPTY);
        $g = [];
        for ($i = 0, $L = count($c) - 1; $i < $L; $i++) {
            $g[$c[$i] . $c[$i + 1]] = true;
        }
        return $g;
    }

    /** 可能讲错的数据：两位以上数字、小数、百分比、年份 */
    public static function numbers($s)
    {
        $s = mb_convert_kana((string)$s, 'n', 'UTF-8');
        preg_match_all('/\d+(?:\.\d+)?%?/u', $s, $m);
        $out = [];
        foreach ($m[0] as $x) {
            if (strlen(rtrim($x, '%')) >= 2 || strpos($x, '.') !== false || substr($x, -1) === '%') {
                $out[$x] = true;
            }
        }
        return array_keys($out);
    }

    /**
     * @return array ['has'=>资料是否存在, 'items'=>[...], 'sum'=>统计]
     * item: page(1起), field, text, status(src|part|ai), score, quote, nums(资料里没有的数字)
     */
    public static function check($lessonId, array $slides)
    {
        $src = self::sourceText($lessonId);
        $res = ['has' => trim($src) !== '', 'items' => [], 'sum' => ['all' => 0, 'src' => 0, 'part' => 0, 'ai' => 0, 'nums' => 0]];
        if (!$res['has'] || !$slides) {
            return $res;
        }
        // 资料切句 + 倒排索引
        $sents = array_values(array_filter(array_map('trim', preg_split('/(?<=[。！？；!?;])|\r?\n/u', $src)), function ($x) {
            return mb_strlen($x) >= 4;
        }));
        $idx = [];
        $sentGrams = [];
        foreach ($sents as $k => $sn) {
            $g = self::grams(self::norm($sn));
            $sentGrams[$k] = count($g);
            foreach ($g as $bg => $_) {
                $idx[$bg][] = $k;
            }
        }
        $srcNorm = self::norm(mb_convert_kana($src, 'n', 'UTF-8'));
        $tooCommon = max(400, (int)(count($sents) * 0.08));

        foreach ($slides as $p => $s) {
            if (in_array($s['layout'] ?? '', ['title', 'section', 'video'], true)) {
                continue;
            }
            $cands = [];
            // 课堂提问的题目和干扰项本来就是编出来的，不判断出处
            foreach (['bullets' => '要点', 'left' => '左栏', 'right' => '右栏'] as $f => $fn) {
                foreach ((array)($s[$f] ?? []) as $b) {
                    $cands[] = [$fn, (string)$b];
                }
            }
            foreach ((array)($s['diagram']['items'] ?? []) as $it) {
                $cands[] = ['结构图', trim(($it['t'] ?? '') . '：' . ($it['d'] ?? ''), '：')];
            }
            foreach ($cands as list($fn, $text)) {
                $n = self::norm($text);
                $g = self::grams($n);
                if (count($g) < 4) {
                    continue; // 太短（如“定义”“小结”）不判断
                }
                $hits = [];
                foreach ($g as $bg => $_) {
                    if (isset($idx[$bg]) && count($idx[$bg]) <= $tooCommon) {
                        foreach ($idx[$bg] as $k) {
                            $hits[$k] = ($hits[$k] ?? 0) + 1;
                        }
                    }
                }
                arsort($hits);
                $best = null;
                $score = 0;
                foreach (array_slice($hits, 0, 8, true) as $k => $h) {
                    $sc = $h / count($g);
                    if ($sc > $score) {
                        $score = $sc;
                        $best = $k;
                    }
                }
                // 跨句的要点：再看整段资料里出现了多少（避免把概括两句话的要点判成 AI 补充）
                $cover = 0;
                foreach ($g as $bg => $_) {
                    if (isset($idx[$bg])) {
                        $cover++;
                    }
                }
                $score = max($score, 0.85 * $cover / count($g) - 0.15);
                $st = $score >= self::SRC ? 'src' : ($score >= self::PART ? 'part' : 'ai');
                $miss = [];
                foreach (self::numbers($text) as $num) {
                    if (strpos($srcNorm, self::norm($num)) === false) {
                        $miss[] = $num;
                    }
                }
                $res['sum']['all']++;
                $res['sum'][$st]++;
                if ($miss) {
                    $res['sum']['nums']++;
                }
                if ($st !== 'src' || $miss) {
                    $res['items'][] = ['page' => $p + 1, 'field' => $fn, 'text' => mb_substr($text, 0, 120), 'status' => $st, 'score' => round($score, 2),
                        'quote' => $best !== null && $score >= 0.3 ? mb_substr($sents[$best], 0, 90) : '', 'nums' => $miss];
                }
            }
            // 讲稿只查数字：老师会照着讲出来
            $miss = [];
            foreach (self::numbers(preg_replace('/【[^】]*】/u', '', (string)($s['notes'] ?? ''))) as $num) {
                if (strpos($srcNorm, self::norm($num)) === false) {
                    $miss[] = $num;
                }
            }
            if ($miss) {
                $res['sum']['nums']++;
                $res['items'][] = ['page' => $p + 1, 'field' => '讲稿', 'text' => '讲稿中的数字', 'status' => 'num', 'score' => 0, 'quote' => '', 'nums' => array_slice($miss, 0, 6)];
            }
        }
        // 数字问题和 AI 补充排在前面
        usort($res['items'], function ($a, $b) {
            $w = function ($x) {
                return ($x['nums'] ? 0 : 10) + ['ai' => 0, 'num' => 1, 'part' => 2, 'src' => 3][$x['status']];
            };
            return [$w($a), $a['page']] <=> [$w($b), $b['page']];
        });
        $res['items'] = array_slice($res['items'], 0, 80);
        return $res;
    }
}
