<?php
namespace App\Services;

use App\Core\DB;

/**
 * 课件配图：优先从正版图库搜索真实照片，搜不到再用 AI 生成（MiniMax H3-Image 或通义万相）。
 * 所有图片都下载保存到本服务器（public/uploads/img），并记录来源署名。
 */
class Images
{
    const MAX_BYTES = 6291456; // 6MB

    public static function dir($lessonId)
    {
        $d = BASE_PATH . '/public/uploads/img/' . (int)$lessonId;
        if (!is_dir($d)) {
            @mkdir($d, 0775, true);
        }
        return $d;
    }

    /** 删除课次的图片目录（被其他课件复制引用的图片保留） */
    public static function purge($lessonId)
    {
        $d = BASE_PATH . '/public/uploads/img/' . (int)$lessonId;
        if (!is_dir($d)) {
            return;
        }
        $used = (int)DB::val('SELECT COUNT(*) FROM decks WHERE slides LIKE ?', ['%/uploads/img/' . (int)$lessonId . '/%']);
        if ($used) {
            return;
        }
        foreach (glob($d . '/*') ?: [] as $f) {
            @unlink($f);
        }
        @rmdir($d);
    }

    /** 当前可用的 AI 生图服务：minimax / wanx / '' */
    public static function aiProvider()
    {
        $s = setting('img_source', 'auto');
        $mm = MiniMax::configured();
        $wx = DeepSeek::keyOf('qwen') !== '';
        if ($s === 'minimax') {
            return $mm ? 'minimax' : '';
        }
        if ($s === 'wanx') {
            return $wx ? 'wanx' : '';
        }
        return $mm ? 'minimax' : ($wx ? 'wanx' : '');
    }

    public static function aiName()
    {
        return self::aiProvider() === 'minimax' ? 'MiniMax H3-Image' : '通义万相';
    }

    public static function aiCredit()
    {
        return 'AI 生成图片（' . self::aiName() . '），仅作示意';
    }

    /** 批量 AI 生图，返回 [index => 远程URL] */
    public static function aiBatch(array $prompts)
    {
        return self::aiProvider() === 'minimax' ? MiniMax::imageBatch($prompts) : self::wanxBatch($prompts);
    }

    /** 配图来源顺序；'ai' 代表 AI 生成 */
    public static function sources()
    {
        $s = setting('img_source', 'auto');
        if ($s === 'off') {
            return [];
        }
        if (in_array($s, ['wanx', 'minimax'], true)) {
            return self::aiProvider() ? ['ai'] : [];
        }
        if ($s !== 'auto') {
            return [$s];
        }
        $list = [];
        if (setting('pexels_key', '') !== '') {
            $list[] = 'pexels';
        }
        if (setting('pixabay_key', '') !== '') {
            $list[] = 'pixabay';
        }
        $list[] = 'openverse';
        if (self::aiProvider() !== '') {
            $list[] = 'ai';
        }
        return $list;
    }

    /** 本次请求中连接失败的主机，后续直接跳过，避免反复超时 */
    private static $dead = [];

    private static function http($url, $headers = [], $post = null, $timeout = 12)
    {
        $host = (string)parse_url($url, PHP_URL_HOST);
        if (isset(self::$dead[$host])) {
            return [0, ''];
        }
        $ch = curl_init($url);
        $opt = [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_TIMEOUT => $timeout, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_USERAGENT => 'BeikeWorkbench/1.0', CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        ];
        if ($post !== null) {
            $opt[CURLOPT_POST] = true;
            $opt[CURLOPT_POSTFIELDS] = $post;
        }
        curl_setopt_array($ch, $opt);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code === 0) {
            self::$dead[$host] = true;
        }
        return [$code, $body === false ? '' : $body];
    }

    /** 搜索：返回候选 [['url'=>..., 'credit'=>..., 'link'=>...]] */
    public static function search($source, $q_en, $q_zh, $page = 1, $per = 6)
    {
        $out = [];
        if ($source === 'pexels') {
            $q = $q_en ?: $q_zh;
            $loc = preg_match('/\p{Han}/u', $q) ? '&locale=zh-CN' : '';
            list($c, $b) = self::http(setting('pexels_base', 'https://api.pexels.com') . '/v1/search?per_page=' . (int)$per . '&orientation=landscape&page=' . (int)$page . $loc . '&query=' . rawurlencode($q), ['Authorization: ' . setting('pexels_key', '')]);
            foreach ((array)(json_decode($b, true)['photos'] ?? []) as $p) {
                $out[] = ['url' => $p['src']['large'] ?? ($p['src']['landscape'] ?? ''), 'thumb' => $p['src']['medium'] ?? ($p['src']['small'] ?? ''), 'credit' => '摄影：' . ($p['photographer'] ?? '') . ' / Pexels', 'link' => $p['url'] ?? ''];
            }
        } elseif ($source === 'pixabay') {
            list($c, $b) = self::http(setting('pixabay_base', 'https://pixabay.com') . '/api/?image_type=photo&orientation=horizontal&safesearch=true&lang=zh&per_page=' . max(3, (int)$per) . '&page=' . (int)$page . '&key=' . rawurlencode(setting('pixabay_key', '')) . '&q=' . rawurlencode($q_en ?: $q_zh));
            foreach ((array)(json_decode($b, true)['hits'] ?? []) as $p) {
                $out[] = ['url' => $p['largeImageURL'] ?? ($p['webformatURL'] ?? ''), 'thumb' => $p['webformatURL'] ?? ($p['previewURL'] ?? ''), 'credit' => '作者：' . ($p['user'] ?? '') . ' / Pixabay', 'link' => $p['pageURL'] ?? ''];
            }
        } elseif ($source === 'openverse') {
            list($c, $b) = self::http(setting('openverse_base', 'https://api.openverse.org') . '/v1/images/?page_size=' . (int)$per . '&mature=false&aspect_ratio=wide&page=' . (int)$page . '&q=' . rawurlencode($q_en ?: $q_zh));
            foreach ((array)(json_decode($b, true)['results'] ?? []) as $p) {
                $lic = strtoupper((string)($p['license'] ?? ''));
                $out[] = ['url' => $p['url'] ?? '', 'thumb' => $p['thumbnail'] ?? ($p['url'] ?? ''), 'credit' => '作者：' . ($p['creator'] ?? '未知') . ' / ' . ($p['source'] ?? 'Openverse') . ($lic ? "（CC {$lic}）" : ''), 'link' => $p['foreign_landing_url'] ?? ''];
            }
        }
        foreach ($out as &$o) {
            $o['source'] = $source;
            if (empty($o['thumb'])) {
                $o['thumb'] = $o['url'];
            }
        }
        unset($o);
        return array_values(array_filter($out, function ($x) {
            return preg_match('#^https?://#', $x['url']);
        }));
    }

    /** 通义万相：并行提交多个生成任务并等待结果 */
    public static function wanxBatch(array $prompts)
    {
        $key = DeepSeek::keyOf('qwen');
        if ($key === '' || !$prompts) {
            return [];
        }
        $intl = strpos(setting('qwen_base', ''), 'intl') !== false;
        $base = setting('wanx_base', '') ?: ($intl ? 'https://dashscope-intl.aliyuncs.com' : 'https://dashscope.aliyuncs.com');
        $model = setting('wanx_model', 'wanx2.1-t2i-turbo');
        $tasks = [];
        foreach ($prompts as $i => $pr) {
            list($c, $b) = self::http($base . '/api/v1/services/aigc/text2image/image-synthesis', [
                'Authorization: Bearer ' . $key, 'Content-Type: application/json', 'X-DashScope-Async: enable',
            ], json_encode(['model' => $model, 'input' => ['prompt' => mb_substr($pr, 0, 500), 'negative_prompt' => '文字, 水印, logo, 低质量, 变形'], 'parameters' => ['size' => '1280*720', 'n' => 1]], JSON_UNESCAPED_UNICODE), 20);
            $id = json_decode($b, true)['output']['task_id'] ?? '';
            if ($id) {
                $tasks[$i] = $id;
            }
        }
        $res = [];
        $deadline = time() + 120;
        while ($tasks && time() < $deadline) {
            sleep(3);
            foreach ($tasks as $i => $id) {
                list($c, $b) = self::http($base . '/api/v1/tasks/' . $id, ['Authorization: Bearer ' . $key]);
                $o = json_decode($b, true)['output'] ?? [];
                $st = $o['task_status'] ?? '';
                if ($st === 'SUCCEEDED') {
                    $res[$i] = $o['results'][0]['url'] ?? '';
                    unset($tasks[$i]);
                } elseif (in_array($st, ['FAILED', 'CANCELED', 'UNKNOWN'], true)) {
                    unset($tasks[$i]);
                }
            }
        }
        return $res;
    }

    /** 下载远程图片并保存，返回站内路径或 null */
    public static function download($lessonId, $url)
    {
        if (!preg_match('#^https?://#i', $url)) {
            return null;
        }
        $host = parse_url($url, PHP_URL_HOST);
        $ip = gethostbyname((string)$host);
        if (!$host || !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            if (setting('img_allow_private', '0') !== '1') {
                return null; // 防止访问内网地址
            }
        }
        list($c, $b) = self::http($url, [], null, 25);
        if ($c !== 200 || $b === '' || strlen($b) > self::MAX_BYTES) {
            return null;
        }
        return self::store($lessonId, $b);
    }

    /** 校验并保存图片二进制，统一转存为 jpg/png */
    public static function store($lessonId, $bytes)
    {
        $info = @getimagesizefromstring($bytes);
        if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP, IMAGETYPE_GIF], true)) {
            return null;
        }
        $ext = $info[2] === IMAGETYPE_PNG ? 'png' : 'jpg';
        // WebP / GIF 转成 JPG（PowerPoint 对 WebP 支持不好）
        if (in_array($info[2], [IMAGETYPE_WEBP, IMAGETYPE_GIF], true)) {
            if (!function_exists('imagecreatefromstring') || !($im = @imagecreatefromstring($bytes))) {
                return null;
            }
            ob_start();
            imagejpeg($im, null, 86);
            $bytes = ob_get_clean();
            imagedestroy($im);
            $ext = 'jpg';
        }
        $name = substr(sha1($bytes), 0, 20) . '.' . $ext;
        file_put_contents(self::dir($lessonId) . '/' . $name, $bytes);
        return ['src' => '/uploads/img/' . (int)$lessonId . '/' . $name, 'w' => $info[0], 'h' => $info[1]];
    }

    /**
     * 为一页找图。$want = ['query_en','query_zh','ai_prompt','page']
     * 返回 image 数组或 null，$log 记录尝试过程
     */
    public static function find($lessonId, array $want, &$log, $wanxUrl = null)
    {
        $page = max(1, (int)($want['page'] ?? 1));
        foreach (self::sources() as $src) {
            if ($src === 'ai') {
                $url = $wanxUrl;
                if ($url === null) {
                    $r = self::aiBatch([$want['ai_prompt'] ?: ($want['query_zh'] . '，写实摄影风格')]);
                    $url = $r[0] ?? null;
                }
                if ($url && ($img = self::download($lessonId, $url))) {
                    $log[] = self::aiName() . '生成';
                    return $img + ['credit' => self::aiCredit(), 'source' => self::aiProvider(), 'query_en' => $want['query_en'], 'query_zh' => $want['query_zh'], 'ai_prompt' => $want['ai_prompt'], 'page' => $page];
                }
                $log[] = self::aiName() . '未成功';
                continue;
            }
            $cands = self::search($src, $want['query_en'], $want['query_zh'], $page);
            foreach (array_slice($cands, 0, 3) as $cand) {
                if ($img = self::download($lessonId, $cand['url'])) {
                    $log[] = $src . ' 搜到';
                    return $img + ['credit' => $cand['credit'], 'link' => $cand['link'], 'source' => $src, 'query_en' => $want['query_en'], 'query_zh' => $want['query_zh'], 'ai_prompt' => $want['ai_prompt'], 'page' => $page];
                }
            }
            $log[] = $src . ($cands ? ' 下载失败' : ' 无结果');
        }
        return null;
    }
}
