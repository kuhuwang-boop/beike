<?php
namespace App\Services;

use App\Core\DB;

/** 学校 PPT 模板：保存浏览器解析出的版面数据和图片，供课件预览与导出使用 */
class Templates
{
    const MAX_FILES = 24;
    const MAX_BYTES = 8388608;

    public static function forUser($uid)
    {
        try {
            return array_map(function ($r) {
                return ['id' => (int)$r['id'], 'name' => $r['name'], 'data' => json_decode($r['data'], true) ?: null];
            }, DB::all('SELECT id, name, data FROM templates WHERE user_id=? ORDER BY id DESC', [$uid]));
        } catch (\Throwable $e) {
            return [];
        }
    }

    public static function owned($uid, $theme)
    {
        if (!preg_match('/^tpl:(\d+)$/', (string)$theme, $m)) {
            return false;
        }
        return (bool)DB::val('SELECT id FROM templates WHERE id=? AND user_id=?', [(int)$m[1], $uid]);
    }

    /** 允许的课件配色：内置五种，或本人上传的模板 */
    public static function validTheme($uid, $theme)
    {
        return Themes::valid($theme) || self::owned($uid, $theme);
    }

    public static function dir($uid)
    {
        $d = BASE_PATH . '/public/uploads/tpl/' . (int)$uid;
        if (!is_dir($d)) {
            @mkdir($d, 0775, true);
        }
        return $d;
    }

    /** 保存一张模板图片，返回网址；不是 PNG/JPG/GIF 返回 null */
    public static function storeImage($uid, $bytes)
    {
        $info = @getimagesizefromstring($bytes);
        if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF], true)) {
            return null;
        }
        $ext = $info[2] === IMAGETYPE_JPEG ? 'jpg' : 'png';
        if ($info[2] === IMAGETYPE_GIF) {
            if (!function_exists('imagecreatefromstring') || !($im = @imagecreatefromstring($bytes))) {
                return null;
            }
            ob_start();
            imagepng($im);
            $bytes = ob_get_clean();
            imagedestroy($im);
        }
        $name = substr(sha1($bytes), 0, 20) . '.' . $ext;
        file_put_contents(self::dir($uid) . '/' . $name, $bytes);
        return '/uploads/tpl/' . (int)$uid . '/' . $name;
    }

    /** 清洗版面数据：数值限幅、颜色校验、图片只能引用本次上传的文件 */
    public static function clean(array $d, array $urls)
    {
        $num = function ($v, $min, $max) {
            return round(max($min, min($max, (float)$v)), 3);
        };
        $col = function ($v, $def = null) {
            return is_string($v) && preg_match('/^[0-9A-Fa-f]{6}$/', $v) ? strtoupper($v) : $def;
        };
        $box = function ($b, $def) use ($num) {
            if (!is_array($b)) {
                return $def;
            }
            $x = $num($b['x'] ?? 0, 0, 13.2);
            $y = $num($b['y'] ?? 0, 0, 7.4);
            return ['x' => $x, 'y' => $y, 'w' => $num($b['w'] ?? 1, 0.3, 13.333 - $x), 'h' => $num($b['h'] ?? 1, 0.2, 7.5 - $y)];
        };
        $src = function ($s) use ($urls) {
            return is_string($s) && isset($urls[ltrim($s, '@')]) ? $urls[ltrim($s, '@')] : null;
        };
        $layout = function ($L, $cover) use ($box, $col, $num, $src) {
            $L = is_array($L) ? $L : [];
            $bg = (array)($L['bg'] ?? []);
            $out = ['bg' => array_filter(['img' => $src($bg['img'] ?? null), 'color' => $col($bg['color'] ?? null, 'FFFFFF')])];
            $out['pics'] = [];
            foreach (array_slice((array)($L['pics'] ?? []), 0, 12) as $p) {
                $u = $src($p['src'] ?? null);
                if ($u) {
                    $out['pics'][] = ['src' => $u] + $box($p, null);
                }
            }
            $out['rects'] = [];
            foreach (array_slice((array)($L['rects'] ?? []), 0, 20) as $r) {
                if ($c = $col($r['fill'] ?? null)) {
                    $out['rects'][] = $box($r, null) + ['fill' => $c, 'r' => $num($r['r'] ?? 0, 0, 1)];
                }
            }
            $t = (array)($L['title'] ?? []);
            $out['title'] = $box($t, $cover ? ['x' => 0.9, 'y' => 2.6, 'w' => 9, 'h' => 1.4] : ['x' => 0.6, 'y' => 0.4, 'w' => 12.1, 'h' => 0.9])
                + ['size' => $num($t['size'] ?? ($cover ? 40 : 28), 16, 54), 'color' => $col($t['color'] ?? null)];
            $out['body'] = $box($L['body'] ?? null, $cover ? ['x' => 0.9, 'y' => 4.1, 'w' => 9, 'h' => 0.8] : ['x' => 0.6, 'y' => 1.6, 'w' => 12.1, 'h' => 5.3]);
            return $out;
        };
        $c = (array)($d['colors'] ?? []);
        $font = preg_replace('/[^\p{Han}\w \-]/u', '', (string)($d['font'] ?? ''));
        return [
            'v' => 1,
            'font' => mb_substr($font, 0, 40) ?: 'Microsoft YaHei',
            'colors' => [
                'primary' => $col($c['primary'] ?? null, '1E3A8A'), 'accent' => $col($c['accent'] ?? null, 'F97316'),
                'text' => $col($c['text'] ?? null, '1F2937'), 'bg' => $col($c['bg'] ?? null, 'FFFFFF'),
                'coverText' => $col($c['coverText'] ?? null, 'FFFFFF'), 'coverBg' => $col($c['coverBg'] ?? null, '1E3A8A'),
            ],
            'cover' => $layout($d['cover'] ?? null, true),
            'content' => $layout($d['content'] ?? null, false),
        ];
    }

    /** 删除模板：用到它的课件改回学院蓝，不再被引用的图片一起删掉 */
    public static function destroy($uid, $id)
    {
        $row = DB::one('SELECT * FROM templates WHERE id=? AND user_id=?', [$id, $uid]);
        if (!$row) {
            return false;
        }
        DB::query('UPDATE decks d JOIN lessons l ON l.id=d.lesson_id JOIN courses c ON c.id=l.course_id SET d.theme=? WHERE c.user_id=? AND d.theme=?', ['blue', $uid, 'tpl:' . (int)$id]);
        DB::query('DELETE FROM templates WHERE id=?', [$id]);
        $p = Brand::prefs($uid);
        if ($p['default_theme'] === 'tpl:' . (int)$id) {
            $p['default_theme'] = 'blue';
            Brand::setPrefs($uid, $p);
        }
        $keep = implode(' ', array_column(DB::all('SELECT data FROM templates WHERE user_id=?', [$uid]), 'data'));
        preg_match_all('#/uploads/tpl/\d+/([a-f0-9]{20}\.(?:png|jpg))#', (string)$row['data'], $m);
        foreach (array_unique($m[1]) as $f) {
            if (strpos($keep, $f) === false) {
                @unlink(self::dir($uid) . '/' . $f);
            }
        }
        return true;
    }
}
