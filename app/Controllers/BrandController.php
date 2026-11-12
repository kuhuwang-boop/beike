<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\View;
use App\Services\Brand;
use App\Services\Templates;

/** 学校模板与校徽 */
class BrandController
{
    public function show()
    {
        $uid = Auth::id();
        View::render('brand/index', [
            'title' => '学校模板与校徽',
            'school' => Brand::school($uid),
            'prefs' => Brand::prefs($uid),
            'templates' => Templates::forUser($uid),
        ]);
    }

    /** 老师自己的学校名称、横版 Logo、校徽图标 */
    public function saveSchool()
    {
        $uid = Auth::id();
        $b = Brand::school($uid);
        $b['name'] = mb_substr(trim(input('name')), 0, 40);
        foreach (['logo', 'icon'] as $k) {
            if (input('remove_' . $k) === '1') {
                $b[$k] = null;
                continue;
            }
            $f = $_FILES[$k] ?? null;
            if ($f && !empty($f['tmp_name']) && is_uploaded_file($f['tmp_name'])) {
                if ($f['size'] > Brand::MAX_BYTES) {
                    flash(($k === 'logo' ? 'Logo' : '校徽图标') . '超过 5MB，请压缩后再上传', 'err');
                    redirect('brand');
                }
                $img = Brand::storeImage($uid, file_get_contents($f['tmp_name']));
                if (!$img) {
                    flash(($k === 'logo' ? 'Logo' : '校徽图标') . '只支持 PNG、JPG、WebP、GIF 图片（建议用透明底 PNG）', 'err');
                    redirect('brand');
                }
                $b[$k] = $img;
            }
        }
        Brand::setSchool($uid, $b);
        flash('学校信息已保存');
        redirect('brand');
    }

    /** 每位老师：课件上显示哪些标志、新课件默认样式 */
    public function savePrefs()
    {
        $uid = Auth::id();
        $p = Brand::prefs($uid);
        foreach (['cover_logo', 'corner_icon', 'footer_name', 'on_template'] as $k) {
            $p[$k] = input($k) === '1' ? 1 : 0;
        }
        $t = input('default_theme');
        $p['default_theme'] = Templates::validTheme($uid, $t) ? $t : 'blue';
        Brand::setPrefs($uid, $p);
        flash('已保存');
        redirect('brand');
    }
}
