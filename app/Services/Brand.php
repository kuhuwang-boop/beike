<?php
namespace App\Services;

/**
 * 学校标志：每位老师自己学校的名称、横版 Logo、方形校徽图标，只用在他自己的课件上；
 * 以及显示偏好（课件上显示哪些、新课件默认样式）。网站本身的标志不受影响。
 */
class Brand
{
    const MAX_BYTES = 5242880;

    /** 每位老师自己的学校信息（不同老师可以来自不同学校，互不影响） */
    public static function school($uid)
    {
        static $c = [];
        $uid = (int)$uid;
        if (!isset($c[$uid])) {
            $raw = (string)setting('school_brand_' . $uid, '');
            if ($raw === '') {
                $raw = self::adoptLegacy($uid);
            }
            $c[$uid] = (json_decode($raw, true) ?: []) + ['name' => '', 'logo' => null, 'icon' => null];
        }
        return $c[$uid];
    }

    public static function setSchool($uid, array $b)
    {
        set_setting('school_brand_' . (int)$uid, json_encode($b, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    /** 早期版本把学校信息存成全站共用；转给管理员账号，并清除全站设置 */
    private static function adoptLegacy($uid)
    {
        $old = (string)setting('school_brand', '');
        if ($old === '' || \App\Core\DB::val('SELECT role FROM users WHERE id=?', [$uid]) !== 'admin') {
            return '';
        }
        foreach (\App\Core\DB::all("SELECT id FROM users WHERE role='admin'") as $a) {
            if ((string)setting('school_brand_' . $a['id'], '') === '') {
                set_setting('school_brand_' . $a['id'], $old);
            }
        }
        \App\Core\DB::exec('DELETE FROM settings WHERE k=?', ['school_brand']);
        return $old;
    }

    public static function prefs($uid)
    {
        $p = json_decode((string)setting('brand_prefs_' . (int)$uid, ''), true) ?: [];
        return $p + ['cover_logo' => 1, 'corner_icon' => 1, 'footer_name' => 1, 'on_template' => 0, 'default_theme' => 'blue'];
    }

    public static function setPrefs($uid, array $p)
    {
        set_setting('brand_prefs_' . (int)$uid, json_encode($p, JSON_UNESCAPED_UNICODE));
    }

    /** 给前端渲染课件用 */
    public static function forUser($uid)
    {
        $s = self::school($uid);
        return ['name' => $s['name'], 'logo' => $s['logo'], 'icon' => $s['icon'], 'prefs' => self::prefs($uid)];
    }

    /** 保存一张标志图片；WebP/GIF 转 PNG（保留透明），过大的图片缩到 1600 像素以内 */
    public static function storeImage($uid, $bytes)
    {
        $info = @getimagesizefromstring($bytes);
        if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP, IMAGETYPE_GIF], true)) {
            return null;
        }
        $w = $info[0];
        $h = $info[1];
        $ext = $info[2] === IMAGETYPE_JPEG ? 'jpg' : 'png';
        $needConvert = in_array($info[2], [IMAGETYPE_WEBP, IMAGETYPE_GIF], true) || max($w, $h) > 1600;
        if ($needConvert && function_exists('imagecreatefromstring') && ($im = @imagecreatefromstring($bytes))) {
            if (max($w, $h) > 1600) {
                $k = 1600 / max($w, $h);
                $nw = (int)round($w * $k);
                $nh = (int)round($h * $k);
                $dst = imagecreatetruecolor($nw, $nh);
                imagealphablending($dst, false);
                imagesavealpha($dst, true);
                imagecopyresampled($dst, $im, 0, 0, 0, 0, $nw, $nh, $w, $h);
                imagedestroy($im);
                $im = $dst;
                $w = $nw;
                $h = $nh;
            }
            imagesavealpha($im, true);
            ob_start();
            if ($ext === 'jpg') {
                imagejpeg($im, null, 90);
            } else {
                imagepng($im);
            }
            $bytes = ob_get_clean();
            imagedestroy($im);
        } elseif ($needConvert && $info[2] !== IMAGETYPE_JPEG && $info[2] !== IMAGETYPE_PNG) {
            return null;
        }
        $dir = BASE_PATH . '/public/uploads/brand/' . (int)$uid;
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $name = substr(sha1($bytes), 0, 20) . '.' . $ext;
        file_put_contents($dir . '/' . $name, $bytes);
        return ['src' => '/uploads/brand/' . (int)$uid . '/' . $name, 'w' => $w, 'h' => $h];
    }
}
