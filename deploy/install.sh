#!/usr/bin/env bash
# =============================================================
# 备课工作台 一键安装 / 升级脚本
# 支持：Ubuntu/Debian、Alibaba Cloud Linux 2/3、CentOS 7/8、Rocky/Alma、宝塔面板
# 用法（root）：bash deploy/install.sh
# 重复运行 = 升级代码（保留数据库、配置和成绩数据）
# =============================================================
set -u

DOMAIN="${DOMAIN:-beike.sangeng.xyz}"
SERVER_IP="${SERVER_IP:-39.106.60.192}"
ADMIN_EMAIL="${ADMIN_EMAIL:-kuhuwang@gmail.com}"
APP_DIR="/var/www/beike"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
LOG=/root/beike-install.log

G='\033[32m'; Y='\033[33m'; R='\033[31m'; N='\033[0m'
say()  { echo -e "${G}==>${N} $*"; echo "[$(date '+%F %T')] $*" >>"$LOG"; }
warn() { echo -e "${Y}[注意]${N} $*"; echo "[WARN] $*" >>"$LOG"; }
die()  { echo -e "${R}[失败]${N} $*"; echo "[FAIL] $*" >>"$LOG"; echo "完整日志：$LOG"; exit 1; }
run()  { "$@" >>"$LOG" 2>&1; }

[ "$(id -u)" = 0 ] || die "请用 root 用户运行"
[ -f "$SRC/public/index.php" ] || die "找不到程序文件（$SRC）"
echo "" > "$LOG"

# ---------- 0. 环境识别 ----------
BT=0; [ -d /www/server/panel ] && BT=1
PM=""
if command -v apt-get >/dev/null; then PM=apt
elif command -v dnf >/dev/null; then PM=dnf
elif command -v yum >/dev/null; then PM=yum
else die "无法识别的系统（需要 apt / dnf / yum）"; fi
. /etc/os-release 2>/dev/null || true
say "系统：${PRETTY_NAME:-unknown}，包管理器：$PM，宝塔面板：$([ $BT = 1 ] && echo 是 || echo 否)"

pkg_install() {
  case $PM in
    apt) DEBIAN_FRONTEND=noninteractive run apt-get install -y "$@" ;;
    dnf) run dnf install -y "$@" ;;
    yum) run yum install -y "$@" ;;
  esac
}

php_ok() { # PHP >= 7.4 且有 pdo_mysql/mbstring/curl
  local bin="$1"
  [ -x "$bin" ] || return 1
  "$bin" -r 'exit(version_compare(PHP_VERSION,"7.4.0",">=") && extension_loaded("pdo_mysql") && extension_loaded("mbstring") && extension_loaded("curl") ? 0 : 1);' 2>/dev/null
}

# ---------- 1. 安装软件 ----------
NGINX_CONF_DIR=""; FPM_SOCK=""; PHP_BIN=""; MYSQL_BIN="mysql"
if [ $BT = 1 ]; then
  say "检测到宝塔面板，使用面板自带的 Nginx / PHP / MySQL"
  NGINX_CONF_DIR=/www/server/panel/vhost/nginx
  for v in 84 83 82 81 80 74; do
    if [ -S /tmp/php-cgi-$v.sock ] && php_ok /www/server/php/$v/bin/php; then FPM_SOCK=/tmp/php-cgi-$v.sock; PHP_BIN=/www/server/php/$v/bin/php; break; fi
  done
  [ -n "$FPM_SOCK" ] || die "宝塔中没有可用的 PHP 7.4+（需要 pdo_mysql、mbstring、curl 扩展）。请在面板“软件商店”安装 PHP 7.4 或 8.x 后重试。"
  [ -x /www/server/mysql/bin/mysql ] && MYSQL_BIN=/www/server/mysql/bin/mysql
  command -v nginx >/dev/null || export PATH=$PATH:/www/server/nginx/sbin
else
  say "安装 Nginx、PHP、MariaDB（首次约 2–5 分钟）…"
  case $PM in
    apt)
      run apt-get update
      pkg_install nginx php-fpm php-cli php-mysql php-mbstring php-curl php-xml mariadb-server curl ca-certificates openssl
      ;;
    dnf)
      # Alibaba Cloud Linux 3 / EL8+：启用较新的 PHP 模块流
      if dnf module list php >/dev/null 2>&1; then
        run dnf module reset -y php
        for s in 8.2 8.1 8.0 7.4; do run dnf module enable -y php:$s && break; done
      fi
      pkg_install nginx php-fpm php-cli php-mysqlnd php-mbstring php-xml php-json php-pdo php-common mariadb-server curl openssl tar
      ;;
    yum)
      pkg_install epel-release yum-utils curl openssl tar
      if ! php_ok "$(command -v php 2>/dev/null)"; then
        run yum install -y https://rpms.remirepo.net/enterprise/remi-release-7.rpm
        run yum-config-manager --disable 'remi-php*'
        run yum-config-manager --enable remi-php74
      fi
      pkg_install nginx php-fpm php-cli php-mysqlnd php-mbstring php-xml php-json php-pdo
      # CentOS 7 自带 MariaDB 5.5 太旧，若未安装 MySQL 则安装 MariaDB 10.6
      if ! command -v mysql >/dev/null; then
        cat >/etc/yum.repos.d/MariaDB.repo <<'REPO'
[mariadb]
name=MariaDB
baseurl=https://mirrors.aliyun.com/mariadb/yum/10.6/centos7-amd64
gpgkey=https://mirrors.aliyun.com/mariadb/yum/RPM-GPG-KEY-MariaDB
gpgcheck=1
REPO
        pkg_install MariaDB-server MariaDB-client
      fi
      ;;
  esac
  PHP_BIN="$(command -v php || true)"
  php_ok "$PHP_BIN" || die "PHP 安装失败或版本低于 7.4（见 $LOG）"
  PHPV=$("$PHP_BIN" -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')
  # 启动服务
  FPM_SVC=$(systemctl list-unit-files 2>/dev/null | grep -oE '^php[0-9.]*-fpm\.service' | head -1); FPM_SVC=${FPM_SVC:-php-fpm.service}
  DB_SVC=mariadb; systemctl list-unit-files | grep -q '^mariadb\.service' || DB_SVC=mysqld
  systemctl list-unit-files | grep -q "^$DB_SVC\.service" || DB_SVC=mysql
  for s in "$FPM_SVC" "$DB_SVC" nginx; do run systemctl enable "$s"; run systemctl restart "$s" || warn "服务 $s 启动失败"; done
  # PHP-FPM 套接字
  for f in /run/php/php$PHPV-fpm.sock /run/php/php-fpm.sock /run/php-fpm/www.sock /var/run/php-fpm/php-fpm.sock; do [ -S "$f" ] && FPM_SOCK="unix:$f" && break; done
  if [ -z "$FPM_SOCK" ]; then
    if ss -ltn 2>/dev/null | grep -q '127.0.0.1:9000'; then FPM_SOCK="127.0.0.1:9000"; else die "找不到 PHP-FPM 监听地址"; fi
  fi
  if [ -d /etc/nginx/conf.d ]; then NGINX_CONF_DIR=/etc/nginx/conf.d; else NGINX_CONF_DIR=/etc/nginx/sites-enabled; fi
fi
[ "${FPM_SOCK#unix:}" = "$FPM_SOCK" ] && [ "${FPM_SOCK#/}" != "$FPM_SOCK" ] && FPM_SOCK="unix:$FPM_SOCK"
say "PHP：$($PHP_BIN -r 'echo PHP_VERSION;')，PHP-FPM：$FPM_SOCK"

# ---------- 2. 部署代码 ----------
say "部署程序到 $APP_DIR"
mkdir -p "$APP_DIR"
if [ -f "$APP_DIR/config/.env" ]; then cp "$APP_DIR/config/.env" /root/beike.env.bak; fi
( cd "$SRC" && tar --exclude='./config/.env' --exclude='./storage/logs/*' --exclude='./public/uploads/img/*' --exclude='./public/uploads/tpl/*' --exclude='./public/uploads/brand/*' --exclude='./public/uploads/video' -cf - . ) | ( cd "$APP_DIR" && tar xf - )
[ -f /root/beike.env.bak ] && cp /root/beike.env.bak "$APP_DIR/config/.env"
mkdir -p "$APP_DIR/storage/logs"

# ---------- 3. 数据库 ----------
# 不需要知道 MySQL root 密码：依次尝试 本机免密登录 → /root/.my.cnf → debian.cnf → 宝塔记录的密码；
# 都不行时，临时以“跳过权限”模式重启 MySQL 约 10 秒，只创建 beike 专用账号，不修改 root 密码。
APP_SQL_CREATE() { # $1 = 新密码
  cat <<SQL
CREATE DATABASE IF NOT EXISTS beike DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'beike'@'localhost' IDENTIFIED BY '$1';
CREATE USER IF NOT EXISTS 'beike'@'127.0.0.1' IDENTIFIED BY '$1';
ALTER USER 'beike'@'localhost' IDENTIFIED BY '$1';
ALTER USER 'beike'@'127.0.0.1' IDENTIFIED BY '$1';
GRANT ALL PRIVILEGES ON beike.* TO 'beike'@'localhost';
GRANT ALL PRIVILEGES ON beike.* TO 'beike'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
}
mysql_app() { "$MYSQL_BIN" -ubeike -p"$DBPW" -h127.0.0.1 -P3306 "$@"; }

ROOT_ARGS=()
find_root_access() {
  local cands=() pw f
  cands+=("-uroot")
  [ -f /root/.my.cnf ] && cands+=("--defaults-extra-file=/root/.my.cnf")
  [ -f /etc/mysql/debian.cnf ] && cands+=("--defaults-file=/etc/mysql/debian.cnf")
  if [ $BT = 1 ]; then
    for f in /www/server/panel/data/default.db /www/server/panel/data/db/default.db; do
      [ -f "$f" ] || continue
      pw=$(sqlite3 "$f" "select mysql_root from config where id=1" 2>/dev/null || true)
      [ -z "$pw" ] && pw=$(python3 -c "import sqlite3;print(sqlite3.connect('$f').execute('select mysql_root from config where id=1').fetchone()[0])" 2>/dev/null || true)
      [ -n "$pw" ] && cands+=("-uroot -p$pw")
    done
  fi
  for c in "${cands[@]}"; do
    # shellcheck disable=SC2086,SC2206
    if "$MYSQL_BIN" $c -e "SELECT 1" >/dev/null 2>&1; then ROOT_ARGS=($c); return 0; fi
  done
  return 1
}

# 跳过权限表临时启动 MySQL，创建 beike 账号后恢复正常
create_via_skip_grant() {
  local svc="" s mysqld="" sock_dir
  for s in mysqld mysql mariadb; do systemctl is-active "$s" >/dev/null 2>&1 && svc=$s && break; done
  [ -z "$svc" ] && [ -x /etc/init.d/mysqld ] && svc=initd
  for s in /www/server/mysql/bin/mysqld "$(command -v mysqld 2>/dev/null)" /usr/sbin/mysqld /usr/libexec/mysqld /usr/sbin/mariadbd; do
    [ -n "$s" ] && [ -x "$s" ] && mysqld=$s && break
  done
  [ -n "$mysqld" ] || return 1
  say "临时重启 MySQL（约 10 秒，本机其他网站会短暂无法连接数据库；不修改 root 密码）"
  if [ "$svc" = initd ]; then /etc/init.d/mysqld stop >>"$LOG" 2>&1; elif [ -n "$svc" ]; then systemctl stop "$svc" >>"$LOG" 2>&1; else pkill -x mysqld; pkill -x mariadbd; fi
  for _ in $(seq 1 20); do pgrep -x mysqld >/dev/null || pgrep -x mariadbd >/dev/null || break; sleep 1; done
  for sock_dir in /var/run/mysqld /run/mysqld; do mkdir -p "$sock_dir" && chown mysql:mysql "$sock_dir" 2>/dev/null; done
  "$mysqld" --user=mysql --skip-grant-tables --skip-networking >>"$LOG" 2>&1 &
  local ok=0
  for _ in $(seq 1 30); do "$MYSQL_BIN" -uroot -e "SELECT 1" >/dev/null 2>&1 && ok=1 && break; sleep 1; done
  if [ $ok = 1 ]; then
    { echo "FLUSH PRIVILEGES;"; APP_SQL_CREATE "$DBPW"; } | "$MYSQL_BIN" -uroot >>"$LOG" 2>&1 || ok=0
    "$MYSQL_BIN" -uroot -e "SHUTDOWN" >>"$LOG" 2>&1 || pkill -x mysqld || pkill -x mariadbd
  fi
  for _ in $(seq 1 30); do pgrep -x mysqld >/dev/null || pgrep -x mariadbd >/dev/null || break; sleep 1; done
  if [ "$svc" = initd ]; then /etc/init.d/mysqld start >>"$LOG" 2>&1; elif [ -n "$svc" ]; then systemctl start "$svc" >>"$LOG" 2>&1
  else nohup "$mysqld" --user=mysql >>"$LOG" 2>&1 & fi
  for _ in $(seq 1 30); do mysql_app -e "SELECT 1" >/dev/null 2>&1 && return 0; sleep 1; done
  return 1
}

DB_OK=0
if [ -f "$APP_DIR/config/.env" ] && grep -q '^DB_PASS=.' "$APP_DIR/config/.env"; then
  DBPW=$(grep '^DB_PASS=' "$APP_DIR/config/.env" | cut -d= -f2-)
  mysql_app -e "SELECT 1" >/dev/null 2>&1 && DB_OK=1 && say "保留已有数据库配置（升级模式）"
fi
if [ $DB_OK = 0 ]; then
  DBPW=$(openssl rand -hex 12)
  if find_root_access; then
    say "已获得 MySQL 管理权限，创建 beike 数据库"
    APP_SQL_CREATE "$DBPW" | "$MYSQL_BIN" "${ROOT_ARGS[@]}" >>"$LOG" 2>&1
  else
    say "未找到 MySQL root 免密方式，改用临时安全模式创建数据库账号"
    create_via_skip_grant || true
  fi
  mysql_app -e "SELECT 1" >/dev/null 2>&1 || die "数据库账号创建失败（见 $LOG）。如果服务器装有宝塔，可在面板「数据库」里新建数据库 beike（用户名 beike），把密码写入 $APP_DIR/config/.env 的 DB_PASS= 后重新运行本脚本。"
  cat >"$APP_DIR/config/.env" <<ENV
APP_DEBUG=0
APP_TZ=Asia/Shanghai
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=beike
DB_USER=beike
DB_PASS=$DBPW
DEEPSEEK_API_KEY=
DEEPSEEK_BASE=https://api.deepseek.com
ENV
fi
(cd "$APP_DIR" && "$PHP_BIN" bin/migrate.php) >>"$LOG" 2>&1 || mysql_app beike < "$APP_DIR/database/schema.sql" || die "导入数据表失败（见 $LOG）"
tail -1 "$LOG"
# 程序自检：逐个检查 PHP 文件语法
BAD=0
while IFS= read -r f; do "$PHP_BIN" -l "$f" >/dev/null 2>>"$LOG" || { warn "语法错误：$f"; BAD=1; }; done < <(find "$APP_DIR/app" "$APP_DIR/public" "$APP_DIR/bin" "$APP_DIR/config" -name '*.php')
[ $BAD = 0 ] && say "程序文件自检通过"
say "数据库就绪"

# DeepSeek Key（首次安装时询问，可跳过）
if ! grep -q '^DEEPSEEK_API_KEY=sk-' "$APP_DIR/config/.env"; then
  echo; echo "请粘贴 DeepSeek API Key（以 sk- 开头；直接回车可跳过，之后在网页「系统设置」里填写）"
  read -rsp "API Key: " DSKEY; echo
  if [[ "$DSKEY" == sk-* ]]; then sed -i "s#^DEEPSEEK_API_KEY=.*#DEEPSEEK_API_KEY=$DSKEY#" "$APP_DIR/config/.env"; say "已写入 API Key"; fi
fi

# 管理员账号
ADMIN_PW=""
if [ "$(mysql_app -N beike -e "SELECT COUNT(*) FROM users WHERE role='admin'")" = "0" ]; then
  ADMIN_PW=$(openssl rand -base64 9 | tr -d '/+=' | cut -c1-10)
  (cd "$APP_DIR" && "$PHP_BIN" bin/create_admin.php "$ADMIN_EMAIL" "$ADMIN_PW" 管理员) >>"$LOG" 2>&1 || die "创建管理员失败"
  printf "网址: https://%s\n账号: %s\n密码: %s\n" "$DOMAIN" "$ADMIN_EMAIL" "$ADMIN_PW" > /root/beike-admin.txt
  chmod 600 /root/beike-admin.txt
fi

# ---------- 4. 权限 / SELinux / 防火墙 ----------
FPM_USER=""
for f in /www/server/php/*/etc/php-fpm.conf /etc/php/*/fpm/pool.d/www.conf /etc/php-fpm.d/www.conf; do
  [ -f "$f" ] || continue
  FPM_USER=$(awk -F= '/^[ \t]*user[ \t]*=/{gsub(/[ \t;]/,"",$2); print $2; exit}' "$f"); [ -n "$FPM_USER" ] && break
done
[ -z "$FPM_USER" ] && FPM_USER=$(ps -eo user:20,args | awk '/php-fpm: pool|php-cgi/ && $1!="root"{print $1; exit}')
[ -z "$FPM_USER" ] && [ $BT = 1 ] && FPM_USER=www
FPM_USER=${FPM_USER:-www-data}
say "PHP 运行用户：$FPM_USER"
mkdir -p "$APP_DIR/public/uploads/img" "$APP_DIR/public/uploads/tpl" "$APP_DIR/public/uploads/brand" "$APP_DIR/public/uploads/video"
chown -R root:root "$APP_DIR"; chown -R "$FPM_USER" "$APP_DIR/storage" "$APP_DIR/public/uploads" 2>/dev/null || chmod -R 777 "$APP_DIR/storage" "$APP_DIR/public/uploads"
chgrp "$FPM_USER" "$APP_DIR/config/.env" 2>/dev/null; chmod 640 "$APP_DIR/config/.env"
# 确认 PHP 进程确实能读到配置；不能则放宽为 644（文件不在网站目录内，网页无法访问）
if ! su -s /bin/sh "$FPM_USER" -c "test -r '$APP_DIR/config/.env'" 2>/dev/null; then chmod 644 "$APP_DIR/config/.env"; fi
chmod 755 "$APP_DIR" "$APP_DIR/config"
if command -v getenforce >/dev/null && [ "$(getenforce)" = Enforcing ]; then
  say "配置 SELinux"
  run setsebool -P httpd_can_network_connect 1
  run setsebool -P httpd_can_network_connect_db 1
  run chcon -R -t httpd_sys_content_t "$APP_DIR"
  run chcon -R -t httpd_sys_rw_content_t "$APP_DIR/storage" "$APP_DIR/public/uploads"
fi
if systemctl is-active firewalld >/dev/null 2>&1; then run firewall-cmd --permanent --add-service=http; run firewall-cmd --permanent --add-service=https; run firewall-cmd --reload; fi
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q active; then run ufw allow 80/tcp; run ufw allow 443/tcp; fi

# 清除 PHP 代码缓存（opcache），避免新旧代码混用
reload_php() {
  if [ $BT = 1 ]; then
    local v; v=$(echo "$FPM_SOCK" | grep -oE 'php-cgi-[0-9]+' | grep -oE '[0-9]+')
    if [ -x "/etc/init.d/php-fpm-$v" ]; then "/etc/init.d/php-fpm-$v" reload >>"$LOG" 2>&1 || "/etc/init.d/php-fpm-$v" restart >>"$LOG" 2>&1; return; fi
  fi
  local svc; svc=$(systemctl list-unit-files 2>/dev/null | grep -oE '^php[0-9.]*-fpm\.service' | head -1)
  if [ -n "$svc" ]; then systemctl reload "$svc" >>"$LOG" 2>&1 || systemctl restart "$svc" >>"$LOG" 2>&1
  else pkill -USR2 -f 'php-fpm: master' >>"$LOG" 2>&1 || true; fi
}
reload_php
say "已重载 PHP，清除旧代码缓存"

# ---------- 5. Nginx ----------
CONF="$NGINX_CONF_DIR/beike.conf"
[ $BT = 1 ] && CONF="$NGINX_CONF_DIR/$DOMAIN.conf"
CERT_DIR=/etc/beike-ssl
write_nginx() { # $1 = http | https
  local common="
    root $APP_DIR/public;
    index index.php;
    charset utf-8;
    client_max_body_size 20m;
    location ^~ /.well-known/acme-challenge/ { root $APP_DIR/public; default_type text/plain; try_files \$uri =404; }
    location ^~ /assets/ { expires 7d; access_log off; }
    location ^~ /uploads/ { expires 30d; access_log off; location ~ \.(php|phtml|phar|html?)$ { return 403; } }
    location / { try_files \$uri /index.php\$is_args\$args; }
    location = /index.php {
        fastcgi_pass $FPM_SOCK;
        fastcgi_param SCRIPT_FILENAME \$document_root/index.php;
        include fastcgi_params;
        fastcgi_read_timeout 240;
    }
    location ~ \.php\$ { return 404; }
    location ~ /\. { deny all; }
    gzip on; gzip_types text/css application/javascript application/json;"
  if [ "$1" = https ]; then
    cat >"$CONF" <<NG
server {
    listen 80;
    server_name $DOMAIN;
    location ^~ /.well-known/acme-challenge/ { root $APP_DIR/public; default_type text/plain; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    ssl_certificate     $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:BEIKE:10m;
    add_header Strict-Transport-Security "max-age=31536000" always;
    $common
}
NG
  else
    cat >"$CONF" <<NG
server {
    listen 80;
    server_name $DOMAIN;
    $common
}
NG
  fi
  # 依次尝试更兼容的写法
  local out
  out=$(nginx -t 2>&1); echo "$out" >>"$LOG"
  if ! echo "$out" | grep -q "test is successful"; then
    sed -i 's/listen 443 ssl http2;/listen 443 ssl;/' "$CONF"
    out=$(nginx -t 2>&1); echo "$out" >>"$LOG"
  fi
  if ! echo "$out" | grep -q "test is successful"; then
    sed -i 's#location ^~ /uploads/ {.*#location /uploads/ { expires 30d; access_log off; }#' "$CONF"
    out=$(nginx -t 2>&1); echo "$out" >>"$LOG"
  fi
  if ! echo "$out" | grep -q "test is successful"; then
    sed -i '/location \/uploads\//d; /gzip on;/d; /add_header Strict-Transport-Security/d' "$CONF"
    out=$(nginx -t 2>&1); echo "$out" >>"$LOG"
  fi
  if ! echo "$out" | grep -q "test is successful"; then
    echo -e "${R}Nginx 配置检查没有通过，错误信息：${N}"
    echo "$out" | grep -E "emerg|error|warn" | head -6
    if echo "$out" | grep -E "emerg|error" | grep -q "$CONF"; then
      if [ -f /root/beike-nginx.good ]; then
        cp /root/beike-nginx.good "$CONF"
        warn "已恢复本站上一次可用的 Nginx 配置，网站保持可用；程序和数据库已经更新完成。"
      fi
    else
      warn "报错的是服务器上其他网站的配置文件（不是本站）。本站配置已写好，请在宝塔「网站」中修复上面提到的站点后，重启 Nginx 即可。"
    fi
    NGINX_FAILED=1
    return 0
  fi
  nginx -s reload >>"$LOG" 2>&1 || systemctl reload nginx >>"$LOG" 2>&1 || systemctl restart nginx >>"$LOG" 2>&1
  cp "$CONF" /root/beike-nginx.good
}
NGINX_FAILED=0
# 服务器关闭了 IPv6 时，系统自带的默认站点 "listen [::]:80" 会让 nginx 无法启动
if nginx -t 2>&1 | grep -q 'Address family not supported'; then
  warn "服务器未启用 IPv6，已注释掉默认站点中的 IPv6 监听"
  for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf /etc/nginx/nginx.conf; do [ -f "$f" ] && sed -i 's/^\(\s*listen\s*\[::\]\)/#\1/' "$f"; done
fi
# 证书文件必须是有效的 PEM，坏文件会让 Nginx 整体加载失败
cert_ok() {
  [ -s "$CERT_DIR/fullchain.pem" ] && [ -s "$CERT_DIR/privkey.pem" ] || return 1
  command -v openssl >/dev/null || return 0
  openssl x509 -noout -in "$CERT_DIR/fullchain.pem" >/dev/null 2>&1
}
if [ -e "$CERT_DIR/fullchain.pem" ] && ! cert_ok; then
  LIVE="/etc/letsencrypt/live/$DOMAIN"
  if [ -s "$LIVE/fullchain.pem" ] && openssl x509 -noout -in "$LIVE/fullchain.pem" >/dev/null 2>&1; then
    cp -L "$LIVE/fullchain.pem" "$CERT_DIR/fullchain.pem"; cp -L "$LIVE/privkey.pem" "$CERT_DIR/privkey.pem"
    warn "发现损坏的证书文件，已用 certbot 保存的有效证书恢复"
  else
    mv -f "$CERT_DIR/fullchain.pem" "$CERT_DIR/fullchain.pem.bad" 2>/dev/null; mv -f "$CERT_DIR/privkey.pem" "$CERT_DIR/privkey.pem.bad" 2>/dev/null
    warn "发现损坏的证书文件，已移到 .bad 备份，稍后重新申请"
  fi
fi
if cert_ok; then write_nginx https; else write_nginx http; fi
pgrep -x nginx >/dev/null || systemctl restart nginx >>"$LOG" 2>&1 || nginx >>"$LOG" 2>&1
[ "$NGINX_FAILED" = 0 ] && say "Nginx 已配置：$CONF"

# 本机自检
sleep 1
if cert_ok; then
  CODE=$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/login")
else
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" http://127.0.0.1/login)
fi
if [ "$CODE" != 200 ] && [ "$CODE" != 301 ] && [ "$CODE" != 302 ]; then
  warn "本机访问 /login 返回 $CODE，最近的错误记录："
  tail -5 "$APP_DIR/storage/logs/error.log" 2>/dev/null
fi

# ---------- 6. HTTPS 证书（Let's Encrypt，免费，自动续期） ----------
issue_cert() {
  mkdir -p "$CERT_DIR" "$APP_DIR/public/.well-known/acme-challenge"
  local RELOAD="cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $CERT_DIR/fullchain.pem && cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $CERT_DIR/privkey.pem && (nginx -s reload || systemctl reload nginx)"
  # 方式一：certbot
  if ! command -v certbot >/dev/null; then
    case $PM in
      apt) pkg_install certbot ;;
      dnf) pkg_install certbot || { pkg_install epel-release && pkg_install certbot; } ;;
      yum) pkg_install certbot ;;
    esac
  fi
  if ! command -v certbot >/dev/null && command -v python3 >/dev/null; then
    run python3 -m pip install -i https://mirrors.aliyun.com/pypi/simple/ certbot && hash -r
  fi
  if command -v certbot >/dev/null; then
    if run certbot certonly --webroot -w "$APP_DIR/public" -d "$DOMAIN" --non-interactive --agree-tos \
         --register-unsafely-without-email --keep-until-expiring --deploy-hook "$RELOAD"; then
      bash -c "$RELOAD" >>"$LOG" 2>&1
      # 续期：certbot 自带定时器；没有则加 cron
      if ! systemctl list-timers 2>/dev/null | grep -q certbot; then
        (crontab -l 2>/dev/null | grep -v 'certbot renew'; echo "17 3 * * * certbot renew --quiet") | crontab -
      fi
      return 0
    fi
    warn "certbot 申请失败，尝试 acme.sh"
  fi
  # 方式二：acme.sh（从 gitee 镜像安装）
  if [ ! -x /root/.acme.sh/acme.sh ]; then
    rm -rf /tmp/acme.sh-src
    if command -v git >/dev/null || pkg_install git; then
      run timeout 120 git clone --depth 1 https://gitee.com/neilpang/acme.sh.git /tmp/acme.sh-src \
        || run timeout 120 git clone --depth 1 https://github.com/acmesh-official/acme.sh.git /tmp/acme.sh-src
      (cd /tmp/acme.sh-src && run ./acme.sh --install --nocron --accountemail "admin@$DOMAIN")
    fi
  fi
  if [ -x /root/.acme.sh/acme.sh ]; then
    run /root/.acme.sh/acme.sh --set-default-ca --server letsencrypt
    run /root/.acme.sh/acme.sh --issue -d "$DOMAIN" -w "$APP_DIR/public" --keylength ec-256 || true
    # 先装到临时位置并校验，避免没拿到证书时写出坏文件
    rm -rf /tmp/beike-acme && mkdir -p /tmp/beike-acme
    if run /root/.acme.sh/acme.sh --install-cert -d "$DOMAIN" --ecc --fullchain-file /tmp/beike-acme/fullchain.pem \
         --key-file /tmp/beike-acme/privkey.pem \
       && [ -s /tmp/beike-acme/fullchain.pem ] && openssl x509 -noout -in /tmp/beike-acme/fullchain.pem >/dev/null 2>&1; then
      cp /tmp/beike-acme/fullchain.pem /tmp/beike-acme/privkey.pem "$CERT_DIR/"
      run /root/.acme.sh/acme.sh --install-cert -d "$DOMAIN" --ecc --fullchain-file "$CERT_DIR/fullchain.pem" \
         --key-file "$CERT_DIR/privkey.pem" --reloadcmd "nginx -s reload || systemctl reload nginx" || true
      (crontab -l 2>/dev/null | grep -v acme.sh; echo "23 2 * * * /root/.acme.sh/acme.sh --cron --home /root/.acme.sh >/dev/null") | crontab -
      return 0
    fi
  fi
  return 1
}

RESOLVED=$(getent hosts "$DOMAIN" | awk '{print $1; exit}')
if [ "$RESOLVED" != "$SERVER_IP" ]; then
  warn "域名 $DOMAIN 当前解析到「${RESOLVED:-无}」，不是 $SERVER_IP。"
  warn "请在域名服务商处添加 A 记录：beike → $SERVER_IP，生效后运行：bash $APP_DIR/deploy/install.sh 即可自动签发证书。"
  HTTPS=0
else
  if cert_ok && command -v openssl >/dev/null && openssl x509 -checkend 2592000 -noout -in "$CERT_DIR/fullchain.pem" >/dev/null 2>&1; then
    # 现有证书还有 30 天以上有效期：不重复申请，续期交给定时任务
    write_nginx https; HTTPS=1; say "HTTPS 证书有效（$(openssl x509 -enddate -noout -in "$CERT_DIR/fullchain.pem" | cut -d= -f2) 到期），自动续期已开启"
  else
  say "申请免费 HTTPS 证书（Let's Encrypt）…"
  if issue_cert && cert_ok; then
    write_nginx https; HTTPS=1; say "HTTPS 已启用，证书会自动续期"
  else
    HTTPS=0
    warn "证书申请失败。常见原因：①阿里云安全组未放行 80/443 端口；②域名未完成 ICP 备案被阿里云拦截。处理后重新运行本脚本即可。"
  fi
  fi
fi

# ---------- 7. 完成 ----------
echo
echo "================================================================"
[ "$NGINX_FAILED" = 1 ] && echo -e " ${Y}注意：Nginx 配置未能更新（原因见上方），网站沿用原配置运行。${N}"
if [ "${HTTPS:-0}" = 1 ]; then echo -e " 访问地址：${G}https://$DOMAIN${N}"; else echo -e " 访问地址：${Y}http://$DOMAIN${N}（HTTPS 尚未启用，见上方提示）"; fi
if [ -n "$ADMIN_PW" ]; then
  echo " 管理员账号：$ADMIN_EMAIL"
  echo -e " 初始密码：  ${G}$ADMIN_PW${N}   （已保存在 /root/beike-admin.txt，登录后请修改）"
else
  echo " 管理员账号沿用之前的（忘记密码：cd $APP_DIR && php bin/create_admin.php 邮箱 新密码）"
fi
echo " 安装日志：$LOG"
echo "================================================================"
