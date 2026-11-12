<?php
namespace App\Services;

use App\Core\Auth;
use App\Core\DB;

/**
 * 大模型调用。支持 DeepSeek、通义千问（OpenAI 兼容协议）与 MiniMax（Anthropic 兼容协议）。
 * 类名保留 DeepSeek 以兼容已有代码。
 */
class DeepSeek
{
    /** 最近一次调用的信息（供任务面板展示） */
    public static $last = ['model' => '', 'tokens' => 0];

    public static function providers()
    {
        return [
            'deepseek' => ['name' => 'DeepSeek', 'models' => ['deepseek-flash' => 'deepseek-flash（V4.1，快，推荐）', 'deepseek-v4-pro' => 'deepseek-v4-pro（效果最好，较慢较贵）']],
            'qwen' => ['name' => '通义千问', 'models' => ['qwen-plus' => 'qwen-plus（均衡，推荐）', 'qwen-max' => 'qwen-max（效果最好，较贵）', 'qwen-turbo' => 'qwen-turbo（最快最便宜）', 'qwen-plus-latest' => 'qwen-plus-latest（最新版）']],
            'minimax' => ['name' => 'MiniMax', 'models' => ['MiniMax-M3' => 'MiniMax-M3（快，推荐）', 'MiniMax-M3.1-Flash' => 'MiniMax-M3.1-Flash（深度思考，较慢）']],
        ];
    }

    public static function provider()
    {
        $p = setting('ai_provider', '');
        if ($p === '') {
            $p = 'deepseek';
            foreach (['deepseek', 'qwen', 'minimax'] as $x) {
                if (self::keyOf($x) !== '') {
                    $p = $x;
                    break;
                }
            }
        }
        return $p;
    }

    public static function keyOf($p)
    {
        if ($p === 'qwen') {
            return (string)setting('qwen_key', config('QWEN_API_KEY', ''));
        }
        if ($p === 'minimax') {
            return MiniMax::key();
        }
        $k = setting('deepseek_key', '');
        return $k !== '' ? $k : (string)config('DEEPSEEK_API_KEY', '');
    }

    public static function key()
    {
        return self::keyOf(self::provider());
    }

    public static function configured($p = null)
    {
        return self::keyOf($p ?: self::provider()) !== '';
    }

    public static function modelOf($p)
    {
        if ($p === 'minimax') {
            return setting('minimax_model', 'MiniMax-M3');
        }
        if ($p === 'qwen') {
            return setting('qwen_model', 'qwen-plus');
        }
        // DeepSeek 已改用 V4 系列模型名，旧设置自动对应
        $m = setting('deepseek_model', 'deepseek-flash');
        return ['deepseek-chat' => 'deepseek-flash', 'deepseek-reasoner' => 'deepseek-v4-pro', 'deepseek-v4-flash' => 'deepseek-flash'][$m] ?? $m;
    }

    /** 单次输出上限（tokens）：按各家模型能力设置 */
    public static function outCap($p)
    {
        return ['deepseek' => 32768, 'qwen' => 8192, 'minimax' => 16384][$p] ?? 8192;
    }

    public static function baseOf($p)
    {
        if ($p === 'qwen') {
            return setting('qwen_base', '') ?: 'https://dashscope.aliyuncs.com/compatible-mode/v1';
        }
        if ($p === 'minimax') {
            return MiniMax::host() . '/anthropic/v1';
        }
        return rtrim(setting('deepseek_base', '') ?: config('DEEPSEEK_BASE', 'https://api.deepseek.com'), '/');
    }

    /** 学科审核使用的模型（可设为另一家，实现交叉核查） */
    public static function reviewProvider()
    {
        $r = setting('review_provider', 'same');
        if (in_array($r, ['deepseek', 'qwen', 'minimax'], true) && self::configured($r)) {
            return $r;
        }
        return self::provider();
    }

    /**
     * @return array ['ok'=>bool, 'content'=>string, 'json'=>array|null, 'error'=>string]
     */
    /** 已填写 Key 的模型，按管理员选择的默认模型排在最前 */
    public static function available($first = null)
    {
        $out = [];
        foreach (array_merge([$first ?: self::provider()], array_keys(self::providers())) as $p) {
            if (isset(self::providers()[$p]) && self::configured($p) && !in_array($p, $out, true)) {
                $out[] = $p;
            }
        }
        return $out;
    }

    /** 最近一次调用是否发生了自动切换（供任务面板提示） */
    public static $fallback = '';

    /**
     * 调用大模型。指定的模型出错（连不上、超时、限流、欠费、返回格式坏掉）时，
     * 自动改用另一家已配置的模型重试，保证老师的操作不会因为某一家故障而中断。
     */
    public static function chat($action, array $messages, $wantJson = true, $temperature = 0.4, $maxTokens = 4000, $provider = null)
    {
        $p = $provider ?: self::provider();
        if (!function_exists('curl_init')) {
            return ['ok' => false, 'error' => '服务器缺少 PHP curl 扩展'];
        }
        $chain = $action === 'ping' ? [$p] : self::available($p);
        if (!self::configured($p) && $action === 'ping') {
            $name = self::providers()[$p]['name'] ?? $p;
            return ['ok' => false, 'error' => "尚未配置 {$name} 的 API Key，请管理员在「系统设置」中填写。"];
        }
        if (!$chain) {
            return ['ok' => false, 'error' => '尚未配置任何 AI 模型的 API Key，请管理员在「系统设置」中填写。'];
        }
        if ($action !== 'ping' && ($qe = Users::quotaError(Auth::id())) !== '') {
            return ['ok' => false, 'error' => $qe, 'quota' => true];
        }
        if (setting('ai_failover', '1') !== '1') {
            $chain = array_slice($chain, 0, 1);
        }
        self::$fallback = '';
        $errs = [];
        $first = null;
        foreach ($chain as $k => $q) {
            $res = self::once($q, $action, $messages, $wantJson, $temperature, $maxTokens);
            if (!empty($res['truncated'])) {
                // 输出被截断：先放宽长度上限重试一次；仍然截断就保留已完整生成的部分
                $cap = self::outCap($q);
                if ($maxTokens < $cap) {
                    $res = self::once($q, $action, $messages, $wantJson, $temperature, min($cap, (int)($maxTokens * 2.5)));
                }
                if (!empty($res['truncated'])) {
                    $j = self::repairJson($res['content']);
                    if ($j !== null) {
                        $res['ok'] = true;
                        $res['json'] = $j;
                        $res['partial'] = true;
                        $res['error'] = '';
                    }
                }
            }
            if ($res['ok'] || empty($res['retry'])) {
                if ($res['ok'] && $k > 0) {
                    self::$fallback = implode('；', $errs) . ' → 已自动改用 ' . (self::providers()[$q]['name'] ?? $q);
                    $res['fallback'] = self::$fallback;
                    self::$last['model'] .= '（自动切换）';
                }
                return $res;
            }
            $errs[] = self::providers()[$q]['name'] . '不可用';
            $first = $first ?? $res;
        }
        // 都失败：返回第一家的错误，并说明已尝试过其他模型
        if (count($chain) > 1) {
            $first['error'] .= '（已自动尝试 ' . implode('、', array_map(function ($q) {
                return self::providers()[$q]['name'];
            }, array_slice($chain, 1))) . '，也没有成功）';
        }
        return $first;
    }

    /** 调用一家模型；retry=true 表示换一家可能会成功 */
    private static function once($p, $action, array $messages, $wantJson, $temperature, $maxTokens)
    {
        $name = self::providers()[$p]['name'] ?? $p;
        $model = self::modelOf($p);
        $anth = $p === 'minimax';
        if ($anth) {
            // Anthropic 兼容：system 单独放，JSON 要求写进提示词；思考型模型需要更多 token 余量
            $sys = [];
            $msgs = [];
            foreach ($messages as $m) {
                if (($m['role'] ?? '') === 'system') {
                    $sys[] = (string)$m['content'];
                } else {
                    $msgs[] = ['role' => $m['role'] === 'assistant' ? 'assistant' : 'user', 'content' => (string)$m['content']];
                }
            }
            if ($wantJson) {
                $sys[] = '只输出一个合法的 JSON 对象，不要输出任何解释、前言或 Markdown 代码块。';
            }
            $think = $model === 'MiniMax-M3.1-Flash';
            $payload = ['model' => $model, 'max_tokens' => $think ? min($maxTokens + 6000, self::outCap($p)) : min($maxTokens, self::outCap($p)), 'messages' => $msgs];
            if ($sys) {
                $payload['system'] = implode("\n\n", $sys);
            }
            if ($think) {
                $payload['output_config'] = ['effort' => 'low'];
            }
            $url = self::baseOf($p) . '/messages';
        } else {
            $payload = ['model' => $model, 'messages' => $messages, 'temperature' => $temperature, 'max_tokens' => min($maxTokens, self::outCap($p)), 'stream' => false];
            if ($wantJson) {
                $payload['response_format'] = ['type' => 'json_object'];
            }
            if ($p === 'deepseek') {
                // V4 系列默认开启深度思考，思考内容会占用输出长度导致正文被截断；备课任务关闭思考
                $payload['thinking'] = ['type' => 'disabled'];
            } elseif ($p === 'qwen') {
                $payload['enable_thinking'] = false;
            }
            $url = rtrim(self::baseOf($p), '/') . '/chat/completions';
        }

        @set_time_limit(240);
        $t0 = microtime(true);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . self::keyOf($p)] + ($anth ? [2 => 'anthropic-version: 2023-06-01'] : []),
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => 200,
        ]);
        $raw = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        $ms = (int)((microtime(true) - $t0) * 1000);

        $res = ['ok' => false, 'content' => '', 'json' => null, 'error' => ''];
        $u = [];
        if ($raw === false) {
            $res['error'] = "无法连接 {$name}：" . $err;
            $res['retry'] = true;
        } else {
            $d = json_decode($raw, true);
            if ($anth && is_array($d) && isset($d['content']) && is_array($d['content'])) {
                // 转成统一格式：只取 text 块，跳过 thinking
                $txt = '';
                foreach ($d['content'] as $blk) {
                    if (($blk['type'] ?? '') === 'text') {
                        $txt .= (string)$blk['text'];
                    }
                }
                $d = ['choices' => [['message' => ['content' => $txt], 'finish_reason' => ($d['stop_reason'] ?? '') === 'max_tokens' ? 'length' : 'stop']],
                    'usage' => ['prompt_tokens' => (int)($d['usage']['input_tokens'] ?? 0), 'completion_tokens' => (int)($d['usage']['output_tokens'] ?? 0)]];
                if ($txt === '' && $d['choices'][0]['finish_reason'] === 'length') {
                    $d['choices'][0]['message']['content'] = '';
                }
            }
            if ($code !== 200 || !isset($d['choices'][0]['message']['content'])) {
                $m = $d['error']['message'] ?? ($d['message'] ?? ($d['base_resp']['status_msg'] ?? substr((string)$raw, 0, 200)));
                $hint = [401 => '（API Key 无效）', 402 => '（账户余额不足）', 403 => '（无权限或未开通该模型）', 429 => '（请求过于频繁，稍后再试）'][$code] ?? '';
                $res['error'] = "{$name} 返回错误 {$code}{$hint}：{$m}";
                $res['retry'] = $code === 0 || $code >= 500 || in_array($code, [401, 402, 403, 404, 408, 429], true);
            } else {
                $res['ok'] = true;
                $res['content'] = $d['choices'][0]['message']['content'];
                $u = $d['usage'] ?? [];
                if (($d['choices'][0]['finish_reason'] ?? '') === 'length' && $wantJson) {
                    $res['ok'] = false;
                    $res['truncated'] = true;
                    $res['error'] = 'AI 这次要写的内容太长，超出了单次输出上限。可以分两步说，例如先说“先做前半部分”，再说“继续完成剩余页面”';
                } elseif ($wantJson) {
                    $res['json'] = self::parseJson($res['content']);
                    if ($res['json'] === null) {
                        $res['ok'] = false;
                        $res['error'] = 'AI 返回的内容不是有效 JSON，请重试';
                        $res['retry'] = true;
                    }
                }
            }
        }
        self::$last = ['provider' => $p, 'model' => "{$name} · {$model}", 'tokens' => (int)($u['total_tokens'] ?? (($u['prompt_tokens'] ?? 0) + ($u['completion_tokens'] ?? 0)))];
        try {
            DB::insert('ai_logs', [
                'user_id' => Auth::id(), 'action' => mb_substr($p . ':' . $action, 0, 40), 'ok' => $res['ok'] ? 1 : 0,
                'prompt_tokens' => (int)($u['prompt_tokens'] ?? 0), 'completion_tokens' => (int)($u['completion_tokens'] ?? 0), 'ms' => $ms,
            ]);
        } catch (\Throwable $e) {
        }
        return $res;
    }

    /**
     * 修复被截断的 JSON：从后往前找最后一个完整的数组元素 / 对象成员，补齐括号。
     * 例如课件写到第 12 页中途被截断，就保留前 11 页。
     */
    public static function repairJson($s)
    {
        $s = trim((string)$s);
        if (preg_match('/```(?:json)?\s*(.*)$/s', $s, $m)) {
            $s = rtrim(preg_replace('/```\s*$/', '', $m[1]));
        }
        $a = strpos($s, '{');
        if ($a === false) {
            return null;
        }
        $s = substr($s, $a);
        $stack = [];
        $cuts = []; // [位置, 当时未闭合的括号]
        $inStr = false;
        $esc = false;
        $len = strlen($s);
        for ($i = 0; $i < $len; $i++) {
            $c = $s[$i];
            if ($inStr) {
                if ($esc) {
                    $esc = false;
                } elseif ($c === '\\') {
                    $esc = true;
                } elseif ($c === '"') {
                    $inStr = false;
                }
                continue;
            }
            if ($c === '"') {
                $inStr = true;
            } elseif ($c === '{' || $c === '[') {
                $stack[] = $c === '{' ? '}' : ']';
            } elseif ($c === '}' || $c === ']') {
                array_pop($stack);
                $cuts[] = [$i + 1, $stack];
                if (!$stack) {
                    break;
                }
            } elseif ($c === ',') {
                $cuts[] = [$i, $stack];
            }
        }
        // 优先在“一个完整元素刚结束”的位置截断（避免留下半页），不行再退到逗号处
        foreach ([true, false] as $wholeOnly) {
            for ($k = count($cuts) - 1, $n = 0; $k >= 0 && $n < 400; $k--) {
                list($pos, $st) = $cuts[$k];
                $isClose = in_array($s[$pos - 1] ?? '', ['}', ']'], true);
                if ($wholeOnly !== $isClose) {
                    continue;
                }
                $n++;
                $try = rtrim(substr($s, 0, $pos), " \t\r\n,") . implode('', array_reverse($st));
                $d = json_decode($try, true);
                if (is_array($d)) {
                    return $d;
                }
            }
        }
        return null;
    }

    public static function parseJson($s)
    {
        $s = trim($s);
        if (preg_match('/```(?:json)?\s*(.*?)```/s', $s, $m)) {
            $s = trim($m[1]);
        }
        $d = json_decode($s, true);
        if (!is_array($d)) {
            $a = strpos($s, '{');
            $b = strrpos($s, '}');
            if ($a !== false && $b > $a) {
                $d = json_decode(substr($s, $a, $b - $a + 1), true);
            }
        }
        return is_array($d) ? $d : null;
    }
}
