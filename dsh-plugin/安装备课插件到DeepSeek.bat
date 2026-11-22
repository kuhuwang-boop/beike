@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title 安装备课工作台插件到 DeepSeek Harness
cd /d "%~dp0"

set "PKG=%~dp0dsh-beike-1.2.0.tgz"
if not exist "%PKG%" (
  echo [错误] 没找到安装包 dsh-beike-1.2.0.tgz，请把它和本脚本放在同一个文件夹。
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
    set FOUND=1
    echo.
    echo ==== 安装到配置：%%~nxP ====
    call %DSH% plugin --profile %%~nxP remove dsh-beike >nul 2>nul
    call %DSH% plugin --profile %%~nxP add "%PKG%"
    if errorlevel 1 (echo [失败] 配置 %%~nxP 安装失败) else (echo [完成] 已装进配置 %%~nxP)
  )
)
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
