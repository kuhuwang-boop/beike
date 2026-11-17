<?php
define('BASE_PATH', dirname(__DIR__));

spl_autoload_register(function ($cls) {
    if (strpos($cls, 'App\\') !== 0) {
        return;
    }
    $f = BASE_PATH . '/app/' . str_replace('\\', '/', substr($cls, 4)) . '.php';
    if (is_file($f)) {
        require $f;
    }
});
require BASE_PATH . '/app/Core/helpers.php';
ini_set('display_errors', '0');

date_default_timezone_set(config('APP_TZ', 'Asia/Shanghai'));
$debug = config('APP_DEBUG') === '1';
ini_set('display_errors', $debug ? '1' : '0');
error_reporting(E_ALL);

set_exception_handler(function ($e) use ($debug) {
    $where = str_replace(BASE_PATH, '', $e->getFile()) . ':' . $e->getLine();
    @file_put_contents(
        BASE_PATH . '/storage/logs/error.log',
        date('c') . ' ' . ($_SERVER['REQUEST_METHOD'] ?? '') . ' ' . ($_SERVER['REQUEST_URI'] ?? '') . ' | ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $where . "\n",
        FILE_APPEND
    );
    http_response_code(500);
    $isAdmin = !empty($_SESSION['is_admin']);
    $msg = ($debug || $isAdmin) ? $e->getMessage() . '（' . $where . '）' : '服务器出错了，请稍后重试';
    if ($isAdmin && !$debug) {
        $msg .= '　—— 只有管理员能看到这段详情，完整记录见「系统设置 → 错误日志」';
    }
    if (strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false || strpos($_SERVER['REQUEST_URI'] ?? '', '/ai/') === 0) {
        json_out(['error' => $msg], 500);
    }
    echo '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div style="font-family:sans-serif;padding:40px;max-width:900px;line-height:1.7"><h2>出错了</h2><p style="word-break:break-all">' . e($msg) . '</p><a href="/">返回首页</a></div>';
});
set_error_handler(function ($no, $str, $file, $line) {
    if (!(error_reporting() & $no)) {
        return false;
    }
    // 只记录不中断，便于在「系统设置 → 错误日志」中排查
    if (in_array($no, [E_WARNING, E_USER_WARNING, E_RECOVERABLE_ERROR], true)) {
        @file_put_contents(BASE_PATH . '/storage/logs/error.log', date('c') . ' ' . ($_SERVER['REQUEST_URI'] ?? '') . ' | Warning: ' . $str . ' @ ' . str_replace(BASE_PATH, '', $file) . ':' . $line . "\n", FILE_APPEND);
    }
    return false;
});

$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => $secure]);
session_name('BEIKESESS');
session_start();

header('X-Frame-Options: SAMEORIGIN');
header('X-Content-Type-Options: nosniff');

use App\Controllers as C;

$r = new App\Core\Router();
$g = ['guest' => true];
$j = ['json' => true];

$r->get('/login', [C\AuthController::class, 'loginForm'], $g);
$r->post('/login', [C\AuthController::class, 'login'], $g);
$r->get('/register', [C\AuthController::class, 'registerForm'], $g);
$r->post('/register', [C\AuthController::class, 'register'], $g);
$r->post('/logout', [C\AuthController::class, 'logout']);
$r->get('/account', [C\AuthController::class, 'account']);
$r->post('/account', [C\AuthController::class, 'updateAccount']);

$r->get('/', [C\StudioController::class, 'home'], $g);
$r->get('/about', [C\SiteController::class, 'about'], $g);
$r->get('/manual', [C\SiteController::class, 'manual'], $g);
$r->post('/studio', [C\StudioController::class, 'create'], $j);
$r->get('/studio/{id}', [C\StudioController::class, 'show']);
$r->get('/studio/{id}/present', [C\StudioController::class, 'present']);
$r->get('/studio/{id}/state', [C\StudioController::class, 'state'], $j);
$r->post('/studio/{id}/materials', [C\StudioController::class, 'addMaterial'], $j);
$r->post('/studio/{id}/materials/{mid}/delete', [C\StudioController::class, 'deleteMaterial'], $j);
$r->get('/studio/{id}/materials/{mid}', [C\StudioController::class, 'material'], $j);
$r->post('/studio/{id}/materials/{mid}', [C\StudioController::class, 'updateMaterial'], $j);
$r->post('/studio/{id}/clear', [C\StudioController::class, 'clearChat'], $j);
$r->post('/studio/{id}/chat', [C\StudioController::class, 'chat'], $j);
$r->post('/studio/{id}/agent', [C\StudioController::class, 'agent'], $j);
$r->post('/studio/{id}/retry', [C\StudioController::class, 'retry'], $j);
$r->post('/studio/{id}/cancel', [C\StudioController::class, 'cancel'], $j);
$r->get('/studio/{id}/tasks', [C\StudioController::class, 'tasks'], $j);
$r->post('/studio/{id}/image', [C\StudioController::class, 'imageReplace'], $j);
$r->post('/studio/{id}/image/search', [C\StudioController::class, 'imageSearch'], $j);
$r->post('/studio/{id}/image/pick', [C\StudioController::class, 'imagePick'], $j);
$r->post('/studio/{id}/image/upload', [C\StudioController::class, 'imageUpload'], $j);
$r->post('/studio/{id}/image/remove', [C\StudioController::class, 'imageRemove'], $j);
$r->post('/studio/{id}/undo', [C\StudioController::class, 'undo'], $j);
$r->get('/studio/{id}/video', [C\VideoController::class, 'info'], $j);
$r->post('/studio/{id}/video/draft', [C\VideoController::class, 'draft'], $j);
$r->post('/studio/{id}/video', [C\VideoController::class, 'create'], $j);
$r->get('/studio/{id}/video/{vid}', [C\VideoController::class, 'status'], $j);
$r->get('/library', [C\MineController::class, 'library']);
$r->get('/library/list', [C\MineController::class, 'libraryList'], $j);
$r->post('/library', [C\MineController::class, 'libraryAdd'], $j);
$r->get('/library/{id}', [C\MineController::class, 'libraryGet'], $j);
$r->post('/library/{id}', [C\MineController::class, 'libraryUpdate'], $j);
$r->post('/library/{id}/delete', [C\MineController::class, 'libraryDelete'], $j);
$r->get('/style', [C\MineController::class, 'style']);
$r->post('/style', [C\MineController::class, 'saveStyle']);
$r->post('/style/defaults', [C\MineController::class, 'saveDefaults']);
$r->post('/style/cmds', [C\MineController::class, 'saveCmds'], $j);
$r->post('/style/learn', [C\MineController::class, 'learnStyle'], $j);
$r->post('/myskills', [C\MineController::class, 'skillCreate']);
$r->post('/myskills/draft', [C\MineController::class, 'skillDraft'], $j);
$r->post('/myskills/{id}', [C\MineController::class, 'skillSave']);
$r->post('/myskills/{id}/delete', [C\MineController::class, 'skillDelete']);
$r->post('/studio/{id}/library', [C\StudioController::class, 'attachLibrary'], $j);
$r->post('/studio/{id}/type', [C\StudioController::class, 'setType'], $j);
$r->get('/brand', [C\BrandController::class, 'show']);
$r->post('/brand/school', [C\BrandController::class, 'saveSchool']);
$r->post('/brand/prefs', [C\BrandController::class, 'savePrefs']);
$r->post('/templates', [C\TemplateController::class, 'create'], $j);
$r->post('/templates/{id}/rename', [C\TemplateController::class, 'rename'], $j);
$r->post('/templates/{id}/delete', [C\TemplateController::class, 'destroy'], $j);
$r->post('/studio/{id}/skills', [C\StudioController::class, 'skills'], $j);
$r->post('/studio/{id}/theme', [C\StudioController::class, 'theme'], $j);
$r->post('/studio/{id}/rename', [C\StudioController::class, 'rename'], $j);
$r->post('/studio/{id}/delete', [C\StudioController::class, 'destroy']);
$r->get('/courses', [C\DashboardController::class, 'index']);
$r->get('/guide', [C\DashboardController::class, 'guide'], $g);

$r->get('/courses/new', [C\CourseController::class, 'create']);
$r->post('/courses', [C\CourseController::class, 'store']);
$r->get('/courses/{id}', [C\CourseController::class, 'show']);
$r->get('/courses/{id}/edit', [C\CourseController::class, 'edit']);
$r->post('/courses/{id}', [C\CourseController::class, 'update']);
$r->post('/courses/{id}/delete', [C\CourseController::class, 'destroy']);
$r->post('/courses/{id}/clone', [C\CourseController::class, 'cloneCourse']);
$r->post('/courses/{id}/schedule', [C\CourseController::class, 'schedule']);
$r->get('/courses/{id}/export', [C\CourseController::class, 'exportAll']);

$r->get('/courses/{id}/objectives', [C\ObjectiveController::class, 'index']);
$r->post('/courses/{id}/gradreqs', [C\ObjectiveController::class, 'saveGradReqs']);
$r->post('/courses/{id}/objectives', [C\ObjectiveController::class, 'saveObjectives']);
$r->post('/courses/{id}/matrix', [C\ObjectiveController::class, 'saveMatrix']);

$r->get('/courses/{id}/lessons/new', [C\LessonController::class, 'create']);
$r->post('/courses/{id}/lessons', [C\LessonController::class, 'store']);
$r->get('/lessons/{id}', [C\LessonController::class, 'edit']);
$r->post('/lessons/{id}', [C\LessonController::class, 'update']);
$r->post('/lessons/{id}/delete', [C\LessonController::class, 'destroy']);
$r->post('/lessons/{id}/duplicate', [C\LessonController::class, 'duplicate']);
$r->get('/lessons/{id}/print', [C\LessonController::class, 'printView']);
$r->get('/lessons/{id}/word', [C\LessonController::class, 'word']);
$r->get('/lessons/{id}/slides', [C\SlideController::class, 'edit']);
$r->post('/lessons/{id}/slides', [C\SlideController::class, 'save'], $j);
$r->post('/lessons/{id}/slides/from-lesson', [C\SlideController::class, 'fromLesson'], $j);

$r->get('/courses/{id}/questions', [C\QuestionController::class, 'index']);
$r->post('/courses/{id}/questions', [C\QuestionController::class, 'store']);
$r->post('/courses/{id}/questions/batch', [C\QuestionController::class, 'storeBatch'], $j);
$r->get('/questions/{id}/edit', [C\QuestionController::class, 'edit']);
$r->post('/questions/{id}', [C\QuestionController::class, 'update']);
$r->post('/questions/{id}/delete', [C\QuestionController::class, 'destroy']);

$r->get('/courses/{id}/papers', [C\PaperController::class, 'index']);
$r->post('/courses/{id}/papers', [C\PaperController::class, 'store']);
$r->get('/papers/{id}', [C\PaperController::class, 'show']);
$r->post('/papers/{id}/delete', [C\PaperController::class, 'destroy']);
$r->post('/papers/{id}/edit', [C\PaperController::class, 'edit']);
$r->post('/papers/{id}/scores/clear', [C\PaperController::class, 'clearScores']);
$r->get('/papers/{id}/word', [C\PaperController::class, 'word']);
$r->get('/papers/{id}/template', [C\PaperController::class, 'template']);
$r->post('/papers/{id}/scores', [C\PaperController::class, 'importScores']);

$r->get('/courses/{id}/analysis', [C\AnalysisController::class, 'index']);

$r->post('/ai/objectives/{id}', [C\AiController::class, 'objectives'], $j);
$r->post('/ai/lesson/{id}', [C\AiController::class, 'lessonDraft'], $j);
$r->post('/ai/review/{id}', [C\AiController::class, 'review'], $j);
$r->post('/ai/questions/{id}', [C\AiController::class, 'questions'], $j);
$r->post('/ai/improve/{id}', [C\AiController::class, 'improve'], $j);
$r->post('/ai/slides/{id}', [C\AiController::class, 'slides'], $j);
$r->post('/ai/ping', [C\AiController::class, 'ping'], $j);

$admin = ['admin' => true];
$r->get('/admin', [C\AdminController::class, 'index'], $admin);
$r->post('/admin/settings', [C\AdminController::class, 'saveSettings'], $admin);
$r->get('/admin/users', [C\UserAdminController::class, 'index'], $admin);
$r->get('/admin/users/export', [C\UserAdminController::class, 'export'], $admin);
$r->get('/admin/users/{id}', [C\UserAdminController::class, 'show'], $admin);
$r->post('/admin/users', [C\UserAdminController::class, 'create'], $admin);
$r->post('/admin/users/batch', [C\UserAdminController::class, 'batch'], $admin);
$r->post('/admin/users/bulk', [C\UserAdminController::class, 'bulk'], $admin);
$r->post('/admin/users/register', [C\UserAdminController::class, 'saveRegister'], $admin);
$r->post('/admin/users/{id}/status', [C\UserAdminController::class, 'setStatus'], $admin);
$r->post('/admin/log/clear', [C\AdminController::class, 'clearLog'], $admin);
$r->post('/admin/skills', [C\AdminController::class, 'createSkill'], $admin);
$r->post('/admin/skills/import', [C\AdminController::class, 'importSkill'], $admin);
$r->post('/admin/skills/{id}', [C\AdminController::class, 'updateSkill'], $admin);
$r->post('/admin/skills/{id}/delete', [C\AdminController::class, 'deleteSkill'], $admin);
$r->post('/admin/team', [C\AdminController::class, 'saveTeam'], $admin);
$r->post('/admin/users/{id}', [C\UserAdminController::class, 'update'], $admin);
$r->post('/admin/users/{id}/reset', [C\UserAdminController::class, 'reset'], $admin);
$r->post('/admin/users/{id}/delete', [C\UserAdminController::class, 'delete'], $admin);

$r->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI']);
