<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\View;
use App\Services\Agents;

/** 对外的介绍页与使用手册（无需登录） */
class SiteController
{
    public function about()
    {
        View::render('site/about', ['team' => Agents::roles(), 'skillCount' => self::skillCount(), 'logged' => Auth::check(), 'page' => 'about', 'title' => '备课工作台 · AI 课件团队帮大学老师备好一节课'], 'layout/site');
    }

    public function manual()
    {
        View::render('site/manual', ['team' => Agents::roles(), 'logged' => Auth::check(), 'page' => 'manual', 'title' => '使用手册 · 备课工作台'], 'layout/site');
    }

    private static function skillCount()
    {
        try {
            return (int)\App\Core\DB::val('SELECT COUNT(*) FROM skills WHERE enabled=1');
        } catch (\Throwable $e) {
            return 0;
        }
    }
}
