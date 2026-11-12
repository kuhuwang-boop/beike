<?php
namespace App\Services;

use App\Core\Auth;
use App\Core\DB;

/**
 * MiniMax 开放平台：H3 视频生成、H3-Image 图片生成（文字模型走 DeepSeek::chat 的 minimax 分支）。
 * 一个 API Key 通用，管理员在「系统设置」中填写。
 */
class MiniMax
{
    const HOSTS = ['https://api.minimax.cn' => '国内站 api.minimax.cn', 'https://api.minimax.io' => '国际站 api.minimax.io'];
    const VIDEO_MODELS = [
        'MiniMax-H3' => 'MiniMax-H3（效果最好，推荐）',
        'MiniMax-H3-Highspeed' => 'MiniMax-H3-Highspeed（更快）',
        'MiniMax-H3-Lite' => 'MiniMax-H3-Lite（更便宜）',
        'MiniMax-H3-Max' => 'MiniMax-H3-Max（最强，较慢较贵）',
    ];
    const IMAGE_MODELS = ['MiniMax-H3-Image' => 'MiniMax-H3-Image（效果最好）', 'MiniMax-H3-Image-Highspeed' => 'MiniMax-H3-Image-Highspeed（更快）'];
    const RATIOS = ['16:9', '4:3', '1:1', '9:16'];
    const MAX_VIDEO_BYTES = 157286400; // 150MB

    public static function key()
    {
        return trim((string)setting('minimax_key', config('MINIMAX_API_KEY', '')));
    }

    public static function configured()
    {
        return self::key() !== '';
    }

    public static function host()
    {
        $o = (string)config('MINIMAX_BASE', ''); // 仅用于本地测试或自建代理，只能在 config/.env 里设置
        if ($o !== '') {
            return rtrim($o, '/');
        }
        $h = setting('minimax_host', '');
        return isset(self::HOSTS[$h]) ? $h : 'https://api.minimax.cn';
    }

    public static function videoOn()
    {
        return self::configured() && setting('video_on', '1') === '1';
    }

    public static function videoModel()
    {
        $m = setting('video_model', 'MiniMax-H3');
        return isset(self::VIDEO_MODELS[$m]) ? $m : 'MiniMax-H3';
    }

    public static function videoResolution()
    {
        $r = setting('video_resolution', '768P');
        if ($r === '2K' && self::videoModel() !== 'MiniMax-H3') {
            return '768P';
        }
        return in_array($r, ['480P', '768P', '2K'], true) ? $r : '768P';
    }

    public static function imageModel()
    {
        $m = setting('minimax_image_model', 'MiniMax-H3-Image');
        return isset(self::IMAGE_MODELS[$m]) ? $m : 'MiniMax-H3-Image';
    }

    private static function http($method, $path, $body = null, $timeout = 30)
    {
        if (!function_exists('curl_init')) {
            return [0, ['_err' => '服务器缺少 PHP curl 扩展']];
        }
        $ch = curl_init(self::host() . $path);
        $opt = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . self::key(), 'Content-Type: application/json'],
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => $timeout,
        ];
        if ($method === 'POST') {
            $opt[CURLOPT_POST] = true;
            $opt[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE);
        }
        curl_setopt_array($ch, $opt);
        $raw = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            return [0, ['_err' => '无法连接 MiniMax：' . $err]];
        }
        $d = json_decode($raw, true);
        return [$code, is_array($d) ? $d : ['_raw' => mb_substr((string)$raw, 0, 200)]];
    }

    /** 把各种错误格式整理成一句老师能看懂的话 */
    public static function errText($code, $d)
    {
        if (!empty($d['_err'])) {
            return $d['_err'];
        }
        $m = $d['error']['message'] ?? ($d['base_resp']['status_msg'] ?? ($d['message'] ?? ($d['_raw'] ?? '')));
        $hint = [401 => 'API Key 无效', 402 => '账户余额不足，请到 MiniMax 开放平台充值', 403 => '没有开通该模型的权限', 422 => '请求内容不符合要求', 429 => '请求太频繁或并发已满，请稍后再试'][$code] ?? '';
        if (stripos((string)$m, 'sensitive') !== false) {
            $hint = '描述里有平台不允许的内容，请换个说法';
        }
        return 'MiniMax 返回错误 ' . $code . ($hint ? "（{$hint}）" : '') . ($m !== '' ? '：' . mb_substr((string)$m, 0, 160) : '');
    }

    private static function log($action, $ok, $ms)
    {
        try {
            DB::insert('ai_logs', ['user_id' => Auth::id(), 'action' => mb_substr('minimax:' . $action, 0, 40), 'ok' => $ok ? 1 : 0, 'prompt_tokens' => 0, 'completion_tokens' => 0, 'ms' => $ms]);
        } catch (\Throwable $e) {
        }
    }

    /** 连接测试：查询一个不存在的任务，不产生费用 */
    public static function ping()
    {
        if (!self::configured()) {
            return ['ok' => false, 'msg' => '还没有填写 MiniMax 的 API Key'];
        }
        $t0 = microtime(true);
        list($c, $d) = self::http('GET', '/v2/query/video_generation/1', null, 15);
        $ms = (int)((microtime(true) - $t0) * 1000);
        if ($c === 0 || in_array($c, [401, 403], true)) {
            return ['ok' => false, 'msg' => self::errText($c, $d)];
        }
        return ['ok' => true, 'msg' => '连接正常（' . $ms . ' ms），API Key 有效'];
    }

    /* ---------------- 视频 ---------------- */

    /** 提交视频生成任务，返回 [task_id, 错误] */
    public static function createVideo($prompt, $duration, $ratio, $firstFrameDataUrl = null)
    {
        $model = self::videoModel();
        $duration = max($model === 'MiniMax-H3-Max' ? 5 : 4, min(15, (int)$duration));
        $content = [['type' => 'text', 'text' => mb_substr(trim($prompt), 0, 6000)]];
        if ($firstFrameDataUrl) {
            $content[] = ['type' => 'image_url', 'image_url' => ['url' => $firstFrameDataUrl], 'role' => 'first_frame'];
        }
        $body = ['model' => $model, 'content' => $content, 'resolution' => self::videoResolution(), 'duration' => $duration,
            'ratio' => $firstFrameDataUrl ? 'adaptive' : (in_array($ratio, self::RATIOS, true) ? $ratio : '16:9')];
        $t0 = microtime(true);
        list($c, $d) = self::http('POST', '/v2/video_generation', $body, 60);
        $ok = $c === 200 && !empty($d['task_id']);
        self::log('video', $ok, (int)((microtime(true) - $t0) * 1000));
        return $ok ? [(string)$d['task_id'], ''] : ['', self::errText($c, $d)];
    }

    /** 查询任务：['status'=>queued|running|succeeded|failed|cancelled, 'url'=>..., 'error'=>..., 'progress'=>0-1] */
    public static function queryVideo($taskId)
    {
        list($c, $d) = self::http('GET', '/v2/query/video_generation/' . rawurlencode($taskId), null, 20);
        if ($c !== 200 || empty($d['task'])) {
            return ['status' => 'unknown', 'error' => self::errText($c, $d)];
        }
        $t = $d['task'];
        $err = '';
        if (!empty($t['error'])) {
            $err = self::errText((int)($t['error']['code'] ?? 0), ['message' => $t['error']['message'] ?? '']);
            if (stripos((string)($t['error']['message'] ?? ''), 'sensitive') !== false) {
                $err = '视频描述里有平台不允许的内容，请换个说法再试';
            }
        }
        return ['status' => (string)($t['status'] ?? 'unknown'), 'url' => (string)($t['content']['url'] ?? ''), 'error' => $err,
            'progress' => isset($t['progress']) ? (float)$t['progress'] : null, 'seconds' => (int)($t['usage']['output_seconds'] ?? ($t['duration'] ?? 0))];
    }

    /** 下载成片保存到本服务器（平台的链接会过期） */
    public static function saveVideo($lessonId, $url, $name)
    {
        if (!preg_match('#^https://#i', $url) && !(config('MINIMAX_BASE', '') !== '' && preg_match('#^http://#i', $url))) {
            return null;
        }
        $dir = BASE_PATH . '/public/uploads/video/' . (int)$lessonId;
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $file = $dir . '/' . preg_replace('/[^a-z0-9_-]/i', '', $name) . '.mp4';
        $fp = @fopen($file . '.part', 'wb');
        if (!$fp) {
            return null;
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_FILE => $fp, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 180,
            CURLOPT_NOPROGRESS => false, CURLOPT_PROGRESSFUNCTION => function ($c, $dlTotal, $dl) {
                return $dl > self::MAX_VIDEO_BYTES ? 1 : 0;
            }]);
        $ok = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        fclose($fp);
        $size = (int)@filesize($file . '.part');
        $head = (string)@file_get_contents($file . '.part', false, null, 4, 4);
        if (!$ok || $code !== 200 || $size < 1000 || !in_array($head, ['ftyp', 'moov', 'mdat', 'free', 'wide'], true)) {
            @unlink($file . '.part');
            return null;
        }
        rename($file . '.part', $file);
        return ['src' => '/uploads/video/' . (int)$lessonId . '/' . basename($file), 'bytes' => $size];
    }

    public static function purge($lessonId)
    {
        $d = BASE_PATH . '/public/uploads/video/' . (int)$lessonId;
        if (!is_dir($d)) {
            return;
        }
        if ((int)DB::val('SELECT COUNT(*) FROM decks WHERE slides LIKE ?', ['%/uploads/video/' . (int)$lessonId . '/%'])) {
            return;
        }
        foreach (glob($d . '/*') ?: [] as $f) {
            @unlink($f);
        }
        @rmdir($d);
    }

    /* ---------------- 图片 ---------------- */

    /** H3-Image：逐条生成（同步接口），返回 [index => 图片URL] */
    public static function imageBatch(array $prompts)
    {
        $res = [];
        if (!self::configured()) {
            return $res;
        }
        @set_time_limit(300);
        $deadline = time() + 200;
        foreach ($prompts as $i => $pr) {
            if (time() > $deadline) {
                break;
            }
            $t0 = microtime(true);
            list($c, $d) = self::http('POST', '/v1/images/generations', [
                'model' => self::imageModel(), 'prompt' => mb_substr($pr, 0, 2000) . '。画面中不要出现任何文字、字母、水印或标志。',
                'size' => '1600x900', 'n' => 1, 'output_format' => 'jpeg', 'output_compression' => 88, 'response_format' => 'url',
            ], 120);
            $u = (string)($d['data'][0]['url'] ?? '');
            self::log('image', $c === 200 && $u !== '', (int)((microtime(true) - $t0) * 1000));
            if ($u !== '') {
                $res[$i] = $u;
            }
        }
        return $res;
    }

    /* ---------------- 视频额度 ---------------- */

    /** 每位老师每月可生成的视频条数：0 = 不限；管理员不限 */
    public static function videoQuota($uid)
    {
        $u = DB::one('SELECT role FROM users WHERE id=?', [$uid]);
        if (!$u || $u['role'] === 'admin') {
            return 0;
        }
        return max(0, (int)setting('video_quota_default', '5'));
    }

    public static function videosThisMonth($uid)
    {
        return (int)DB::val("SELECT COUNT(*) FROM videos WHERE user_id=? AND status<>'failed' AND created_at>=?", [$uid, Users::monthStart()]);
    }
}
