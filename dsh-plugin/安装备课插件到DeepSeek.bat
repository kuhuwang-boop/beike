@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title 安装备课工作台插件到 DeepSeek Harness
cd /d "%~dp0"

set "PKG=%~dp0dsh-beike-1.3.0.tgz"
if not exist "%PKG%" (
  echo [错误] 没找到安装包 dsh-beike-1.3.0.tgz，请把它和本脚本放在同一个文件夹。
  goto :end
)

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 这台电脑没有 Node.js。请先到 https://nodejs.org 安装 LTS 版本，再运行本脚本。
  goto :end
)

rem 国内网络用 npmmirror 镜像下载依赖，速度更快
set "npm_config_registry=https://registry.npmmirror.com"

rem 优先用已安装的 dsh 命令，没有就用 npx 临时运行
set "DSH=dsh"
where dsh >nul 2>nul
if errorlevel 1 set "DSH=npx -y @deepseek-ai/dsh"

set "PROFILES=%USERPROFILE%\.dsh\profiles"
set FOUND=0
if exist "%PROFILES%" (
  for /d %%P in ("%PROFILES%\*") do (
    rem 跳过不是配置的文件夹（node_modules、以点开头的缓存目录）
    set "PN=%%~nxP"
    set "SKIP=0"
    if /i "!PN!"=="node_modules" set "SKIP=1"
    if "!PN:~0,1!"=="." set "SKIP=1"
    if "!SKIP!"=="0" call :install "!PN!"
  )
)
goto :after

:install
    set FOUND=1
    echo.
    echo ==== 安装到配置：%~1 ====
    call %DSH% plugin --profile %~1 remove dsh-beike >nul 2>nul
    call %DSH% plugin --profile %~1 add "%PKG%"
    if errorlevel 1 (echo [失败] 配置 %~1 安装失败，多半是网络中断，可以再运行一次本脚本) else (echo [完成] 已装进配置 %~1)
    goto :eof

:after
if "!FOUND!"=="0" (
  echo.
  echo ==== 没有找到已有配置，安装到 web 配置 ====
  call %DSH% plugin --profile web add "%PKG%"
)

echo.
echo ============================================================
echo  安装结束。请完全关闭 DeepSeek Harness 后重新打开
echo  （网页版：关掉运行 dsh web 的窗口，再运行 dsh web）。
echo  打开后：左侧边栏会出现「备课工作台」；
echo  在对话里打开右侧栏，点「+」也能选「备课工作台」。
echo ============================================================
:end
echo.
pause
