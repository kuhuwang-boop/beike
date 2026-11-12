<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\DB;
use App\Core\View;

class AuthController
{
    public function loginForm()
    {
        if (Auth::check()) {
            redirect('');
        }
        View::render('auth/login', ['allowReg' => setting('allow_register', '0') === '1'], 'layout/bare');
    }

    public function login()
    {
        // 简单防爆破：同一会话 5 次失败后需等待 60 秒
        $fails = $_SESSION['login_fails'] ?? 0;
        $last = $_SESSION['login_last'] ?? 0;
        if ($fails >= 5 && time() - $last < 60) {
            flash('尝试次数过多，请 1 分钟后再试', 'err');
            redirect('login');
        }
        if (Auth::attempt(strtolower(input('email')), input('password'))) {
            unset($_SESSION['login_fails']);
            $u = Auth::user();
            if ($u && (int)$u['must_change'] === 1) {
                flash('你正在使用管理员设置的初始密码，请先改成自己的密码', 'err');
                redirect('account');
            }
            redirect('');
        }
        if (Auth::$reason === 'disabled') {
            flash('该账号已被管理员停用，如有疑问请联系管理员', 'err');
            redirect('login');
        }
        if (Auth::$reason === 'pending') {
            flash('账号正在等待管理员审核，审核通过后即可登录', 'err');
            redirect('login');
        }
        $_SESSION['login_fails'] = $fails + 1;
        $_SESSION['login_last'] = time();
        flash('邮箱或密码错误', 'err');
        redirect('login');
    }

    public function registerForm()
    {
        if (setting('allow_register', '0') !== '1') {
            flash('当前未开放注册，请联系管理员创建账号', 'err');
            redirect('login');
        }
        View::render('auth/register', [], 'layout/bare');
    }

    public function register()
    {
        if (setting('allow_register', '0') !== '1') {
            redirect('login');
        }
        $code = setting('invite_code', '');
        if ($code !== '' && input('invite') !== $code) {
            flash('邀请码不正确', 'err');
            redirect('register');
        }
        $name = input('name');
        $email = strtolower(input('email'));
        $pw = input('password');
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($pw) < 8) {
            flash('请填写姓名、有效邮箱，密码至少 8 位', 'err');
            redirect('register');
        }
        if (DB::val('SELECT id FROM users WHERE email=?', [$email])) {
            flash('该邮箱已注册', 'err');
            redirect('register');
        }
        $review = setting('register_review', '0') === '1';
        DB::insert('users', ['name' => mb_substr($name, 0, 50), 'email' => $email, 'password_hash' => password_hash($pw, PASSWORD_DEFAULT),
            'status' => $review ? 'pending' : 'active', 'note' => mb_substr(input('school'), 0, 100)]);
        if ($review) {
            flash('注册成功！管理员审核通过后即可用这个邮箱登录');
            redirect('login');
        }
        Auth::attempt($email, $pw);
        redirect('guide');
    }

    public function logout()
    {
        Auth::logout();
        redirect('login');
    }

    public function account()
    {
        View::render('auth/account', ['user' => Auth::user()]);
    }

    public function updateAccount()
    {
        $u = DB::one('SELECT * FROM users WHERE id=?', [Auth::id()]);
        $name = input('name');
        if ($name !== '') {
            DB::update('users', ['name' => $name], 'id=?', [$u['id']]);
        }
        $new = input('new_password');
        if ($new !== '') {
            if (!password_verify(input('old_password'), $u['password_hash'])) {
                flash('原密码不正确', 'err');
                redirect('account');
            }
            if (mb_strlen($new) < 8) {
                flash('新密码至少 8 位', 'err');
                redirect('account');
            }
            DB::update('users', ['password_hash' => password_hash($new, PASSWORD_DEFAULT), 'must_change' => 0], 'id=?', [$u['id']]);
        }
        flash('已保存');
        redirect('account');
    }
}
