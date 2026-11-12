<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Services\Templates;

class TemplateController
{
    public function create()
    {
        $uid = Auth::id();
        if ((int)DB::val('SELECT COUNT(*) FROM templates WHERE user_id=?', [$uid]) >= 20) {
            json_out(['error' => '最多保存 20 个模板，请先删除不用的'], 400);
        }
        $data = json_decode((string)($_POST['data'] ?? ''), true);
        if (!is_array($data) || empty($data['content'])) {
            json_out(['error' => '模板数据无效，请重新上传'], 400);
        }
        $urls = [];
        $n = 0;
        foreach ($_FILES as $key => $f) {
            if (!preg_match('/^i\d{1,2}$/', $key) || ++$n > Templates::MAX_FILES) {
                continue;
            }
            if (empty($f['tmp_name']) || !is_uploaded_file($f['tmp_name']) || $f['size'] > Templates::MAX_BYTES) {
                continue;
            }
            $u = Templates::storeImage($uid, file_get_contents($f['tmp_name']));
            if ($u) {
                $urls[$key] = $u;
            }
        }
        $clean = Templates::clean($data, $urls);
        $name = mb_substr(trim((string)($_POST['name'] ?? '')), 0, 40) ?: '学校模板';
        $id = DB::insert('templates', ['user_id' => $uid, 'name' => $name, 'data' => json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        json_out(['ok' => true, 'template' => ['id' => (int)$id, 'name' => $name, 'data' => $clean]]);
    }

    public function rename($id)
    {
        $name = mb_substr(trim((string)(json_body()['name'] ?? '')), 0, 40);
        if ($name === '') {
            json_out(['error' => '名称不能为空'], 400);
        }
        DB::update('templates', ['name' => $name], 'id=? AND user_id=?', [$id, Auth::id()]);
        json_out(['ok' => true]);
    }

    public function destroy($id)
    {
        if (!Templates::destroy(Auth::id(), (int)$id)) {
            json_out(['error' => '模板不存在'], 404);
        }
        json_out(['ok' => true]);
    }
}
