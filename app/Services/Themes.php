<?php
namespace App\Services;

/** 内置配色（与 public/assets/deckkit.js 的 THEMES 保持一致） */
class Themes
{
    const ALL = [
        'blue' => ['学院蓝', '经典'],
        'green' => ['松石绿', '经典'],
        'red' => ['中国红', '经典'],
        'ink' => ['水墨灰', '经典'],
        'navy' => ['藏青', '经典'],
        'burgundy' => ['酒红', '经典'],
        'science' => ['科技青', '学科'],
        'medical' => ['医学蓝绿', '学科'],
        'law' => ['法学棕', '学科'],
        'finance' => ['金融金', '学科'],
        'engineering' => ['工程橙', '学科'],
        'agri' => ['农林绿', '学科'],
        'daiqing' => ['黛青', '中国色'],
        'zhusha' => ['朱砂', '中国色'],
        'tianqing' => ['天青', '中国色'],
        'tenghuang' => ['藤黄', '中国色'],
        'dianlan' => ['靛蓝', '中国色'],
        'mojin' => ['墨金', '中国色'],
        'mint' => ['薄荷', '清新'],
        'coral' => ['珊瑚', '清新'],
        'lavender' => ['薰衣草', '清新'],
        'sky' => ['晴空', '清新'],
        'sand' => ['沙丘', '清新'],
        'sakura' => ['樱粉', '清新'],
        'mono' => ['极简黑白', '现代'],
        'slate' => ['石板灰', '现代'],
        'violet' => ['科技紫', '现代'],
        'emerald' => ['翡翠', '现代'],
        'orange' => ['活力橙', '现代'],
        'magazine' => ['杂志', '现代'],
        'dark' => ['深色', '深色'],
        'night' => ['夜空蓝', '深色'],
        'forest' => ['墨绿', '深色'],
        'wine' => ['暗红', '深色'],
        'graphite' => ['石墨', '深色'],
        'purple' => ['暗夜紫', '深色'],
    ];

    public static function valid($k)
    {
        return isset(self::ALL[$k]);
    }

    /** 按分组：['经典' => ['blue' => '学院蓝', ...], ...] */
    public static function grouped()
    {
        $out = [];
        foreach (self::ALL as $k => $v) {
            $out[$v[1]][$k] = $v[0];
        }
        return $out;
    }
}
