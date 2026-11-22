# 备课工作台 · DeepSeek Harness 插件（dsh-beike）

让 DeepSeek 像一支 **AI 课件团队** 那样帮高校老师备课：读你的讲义、教材、旧课件 → 写教学设计（逆向设计 + BOPPPS）→ 做课件（含结构图、课堂提问）→ 写讲稿 → **逐条核对出处** → 浏览器里直接上课，或导出可编辑的 PPT。

课件和资料都保存在你自己的电脑上；插件自带一个「备课工作台」网页，用来预览、修改、核对和上课。

## 有什么

**给 AI 的 11 个工具**

| 工具 | 作用 |
|---|---|
| `beike_list` | 列出已有课次 |
| `beike_create_lesson` | 新建课次（课题、课程、课时） |
| `beike_add_material` | 添加资料：.docx / .pptx / .txt / .md 文件，或直接给文字 |
| `beike_read_materials` | 分段通读资料原文 |
| `beike_get_lesson` | 查看课次：教学设计、每页内容、每页建议时长 |
| `beike_save_slides` | 保存课件：整套替换，或逐页修改（新增 / 修改 / 删除），每次都可撤销 |
| `beike_save_plan` | 保存教学设计 |
| `beike_set_lesson` | 改课题、课程、课时、配色（36 套） |
| `beike_check` | 课件体检 + 出处核对（不调用 AI） |
| `beike_export_pptx` | 导出 .pptx 到工作区 |
| `beike_open` | 给出备课工作台网页地址 |

**一份备课技能 `beike`**：把“课件团队”的做法写成步骤和规则——共同原则（以资料为准、不编造）、教学设计、课件版式、13 种结构图选型、课堂提问、讲稿写法、质量督导与出处核对。AI 遇到备课任务时自动加载。

**备课工作台网页**（放在 DeepSeek Harness 的左侧边栏和右侧边栏里）

- 课次列表（按课程分组、可搜索），新建、删除
- 课件预览与逐页编辑：改文字、新增 / 删除 / 调整顺序、上传配图、撤销
- 36 套内置配色（经典、学科、中国色、清新、现代、深色）
- **体检与出处**：按讲稿估算课时；逐条对照你的资料，标出“有出处 / 部分有出处 / AI 补充”，单独列出资料里查不到的数字、年份、百分比，附上最接近的资料原文；一键复制核对指令发给 AI
- 资料管理：拖入文件或粘贴文字，查看、删除
- 教学设计：目标、重难点、误区、BOPPPS 过程、作业、板书、课后反思
- **上课**：浏览器全屏放映，翻页笔可用；按 A 显示答案、B 黑屏；按 P 进入演讲者视图（讲稿、下一页、计时、“比计划快 / 慢几分钟”）；可打开投影窗口，两边同步翻页
- 下载 PPT（16:9，文字可编辑，结构图是原生形状，讲稿和答案在备注里）
- AI 每改一次，网页自动刷新；手机上也能看

## 安装

需要：Node.js 20 或以上，DeepSeek Harness 0.2.x（`npx @deepseek-ai/dsh web` 能正常打开）。

把插件装进 `web` 配置（下面任选一种）：

```bash
# 1) 用安装包（.tgz）
dsh plugin --profile web add ./dsh-beike-1.1.0.tgz

# 2) 用解压后的文件夹（方便自己改代码；先在文件夹里执行一次 npm install）
dsh plugin --profile web add ./dsh-beike

# 3) 从 GitHub 安装（仓库地址换成你实际存放插件的仓库）
dsh plugin --profile web add github:你的账号/dsh-beike
```

> 没有全局安装 `dsh` 时，在命令前加 `npx @deepseek-ai/dsh`，例如 `npx @deepseek-ai/dsh plugin --profile web add ./dsh-beike-1.1.0.tgz`。

确认已装上：

```bash
dsh --profile web --dump-config | grep -A3 "dsh-beike"
```

然后启动：

```bash
dsh web
```

浏览器会打开 DeepSeek Harness，备课工作台已经放进侧边栏：

- **左侧边栏**：「备课工作台」入口（在 Plugins、Automation tasks 下面）。点开就在主区域显示完整的工作台。
- **右侧边栏**：在任意对话里打开右侧栏，点「+」新建标签，选「备课工作台」。一边和 AI 对话，一边看课件；AI 新建或修改了哪节课，右侧会自动切过去。

工作台也可以单独打开：**http://127.0.0.1:3080/beike/**（需要先通过 `dsh web` 打印的链接登录一次）。

卸载：`dsh plugin --profile web remove dsh-beike`（课件和资料会保留在数据目录里）。

**命令行模式**（`dsh tui` 等没有网页界面的配置）也能用：同样用 `dsh plugin --profile <配置名> add ...` 安装；调用 `beike_open` 时插件会在本机临时开一个网页，链接里带访问口令，只有拿到链接的人能打开。

## 怎么用

在 DeepSeek Harness 的对话框里直接说，例如：

- 用备课工作台，把 `D:\讲义\第三章 排序.docx` 做成一节 45 分钟的课件，课程是《数据结构》
- 继续完善《冒泡排序》：给每页写讲稿，再加两道课堂提问
- 核对《冒泡排序》的出处，把资料里找不到依据的内容改正
- 第 4 页改成结构图；整套换成“中国红”配色
- 把《冒泡排序》导出成 PPT 放到当前工作区

AI 做完会给你工作台链接。在网页里看效果、自己改几处、看「体检与出处」，然后点「上课」。

## 设置

在 `dsh --profile web --dump-config` 找到 `dsh-beike` 这一行，或在你的配置里覆盖：

```yaml
- insert:
    - id: beike
      name: dsh-beike
      config:
        dataDir: D:/备课数据      # 课件和资料保存位置，默认：用户主目录/备课工作台
        webPath: /beike           # 网页路径
        standalonePort: 0         # 命令行模式下独立网页的端口，0 = 自动
```

## 数据与隐私

- 每节课一个文件夹：`<数据目录>/lessons/<课次编号>/`，里面是 `lesson.json`（课件、教学设计）、`materials/`（资料提取出的文字）、`images/`（配图）。可以直接备份或拷贝到另一台电脑。
- 插件本身不联网、不上传任何内容。AI 读取的资料和生成的内容，只经过你在 DeepSeek Harness 里配置的模型服务。
- 网页沿用 DeepSeek Harness 的登录保护；所有修改请求都需要自定义请求头，其他网站无法伪造。

## 开发

```bash
npm install
dsh plugin --profile web add ./        # 以链接方式安装，改代码后重启 dsh web 即可
npm pack                               # 打包成 dsh-beike-<版本>.tgz 分发
```

目录：`index.js`（插件入口：工具、技能、网页挂载）、`lib/client.js`（浏览器端：左侧边栏入口、右侧边栏标签页）、`lib/`（课件规则、存储、资料提取、PPT 导出、网页接口）、`web/`（工作台网页与渲染内核）、`skills/beike/SKILL.md`（备课技能）。

渲染内核（`web/deckkit.js`、`web/diagram.js`）与网页版备课工作台共用；结构图版式目录改编自 pptx-compose-skill（MIT）。

## 许可

MIT
