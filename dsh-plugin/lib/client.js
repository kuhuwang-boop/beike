window.__ModuleLoader__.load({id:`dsh-beike`,factory:require=>{var module={exports:{}};var exports=module.exports;Object.defineProperty(exports,Symbol.toStringTag,{value:`Module`});
/*
 * 备课工作台 · DeepSeek Harness 浏览器端
 * 1) 左侧边栏：「备课工作台」入口，点开在主区域显示完整工作台
 * 2) 右侧边栏：「备课工作台」标签页，和 AI 对话的同时查看、修改课件
 * 网页版：嵌入同源的 /beike（沿用 DSH 的登录）。
 * 桌面版（界面从本地文件加载）：嵌入插件在本机开的 http://127.0.0.1:38127/beike/。
 * 手写的 ModuleLoader bundle，无需构建步骤；只依赖宿主共享的 react。
 */
const React = require("react");
const h = React.createElement;
const PANEL_ID = "dsh-beike";
const TAB_ID = "dsh-beike";
const TAB_KIND = "beike";
const BASE = "/beike";
const LOCAL = "http://127.0.0.1:38127/beike";
const LABEL = "备课工作台";

/** 网页版用同源地址；桌面版（file:// 等非 http 页面）用本机端口 */
function rootUrl() {
  try { if (/^https?:$/.test(location.protocol) && !window.dshDesktop) return BASE; } catch (e) {}
  return LOCAL;
}

/** 跟随 DSH 的浅色 / 深色主题：把当前主题传给工作台页面 */
function hostTheme() {
  try {
    const de = document.documentElement;
    const attr = de.getAttribute("data-theme") || de.getAttribute("data-color-scheme") || "";
    if (/dark/i.test(attr) || de.classList.contains("dark")) return "dark";
    if (/light/i.test(attr) || de.classList.contains("light")) return "light";
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch (e) { return "light"; }
}

const boxStyle = { position: "relative", flex: "1 1 auto", width: "100%", height: "100%", minHeight: 0, display: "flex" };
const tipStyle = { margin: "auto", maxWidth: 420, padding: 24, font: "14px/1.7 system-ui, sans-serif", color: "inherit", textAlign: "center", opacity: 0.85 };
const btnStyle = { margin: "12px 6px 0", padding: "6px 14px", borderRadius: 8, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer", font: "inherit", textDecoration: "none", display: "inline-block" };

function Frame(props) {
  const root = rootUrl();
  const [state, setState] = React.useState(root === BASE ? "ok" : "probe");
  const [n, setN] = React.useState(0);
  // 桌面版先探测本机网页是否在线（图片探测不受跨域限制）
  React.useEffect(() => {
    if (root === BASE) return;
    let live = true;
    const img = new Image();
    img.onload = () => live && setState("ok");
    img.onerror = () => live && setState("down");
    img.src = root + "/assets/vendor/icons.svg?probe=" + Date.now();
    const t = setTimeout(() => live && setState(s => (s === "probe" ? "down" : s)), 6000);
    return () => { live = false; clearTimeout(t); };
  }, [n]);
  const src = root + "/?embed=" + props.mode + "&theme=" + hostTheme();
  if (state === "down") {
    return h("div", { style: boxStyle }, h("div", { style: tipStyle },
      h("div", { style: { fontSize: 16, fontWeight: 600, marginBottom: 6 } }, "备课工作台还没有启动"),
      h("div", null, "插件的本机网页（" + root + "/）暂时连不上。请完全退出 DeepSeek Harness 后重新打开；如果仍然不行，让 AI 调用 beike_open，用它给出的链接在浏览器里打开。"),
      h("button", { type: "button", style: btnStyle, onClick: () => { setState("probe"); setN(n + 1); } }, "重试"),
      h("a", { href: root + "/", target: "_blank", rel: "noopener", style: btnStyle }, "在浏览器中打开")));
  }
  return h("div", { style: boxStyle },
    state === "ok" ? h("iframe", {
      src,
      title: LABEL,
      style: { flex: "1 1 auto", width: "100%", height: "100%", border: 0, display: "block", background: "transparent" },
      allow: "clipboard-write; fullscreen",
    }) : h("div", { style: tipStyle }, "正在打开备课工作台…"));
}
function MainPage() { return h(Frame, { mode: "main" }); }
function SidePage() { return h(Frame, { mode: "side" }); }
function TabTitle() { return LABEL; }

/** 左侧栏图标：一本打开的书 */
function BookIcon(props) {
  const s = (props && props.size) || 18;
  return h("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    h("path", { d: "M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" }),
    h("path", { d: "M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" }),
    h("path", { d: "M3 6l0 13" }), h("path", { d: "M12 6l0 13" }), h("path", { d: "M21 6l0 13" }));
}

const inject = ["slots"];
function apply(ctx) {
  // 左侧边栏入口 + 主区域页面（同一个 id 关联）
  ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: PANEL_ID, order: 15, label: () => LABEL }, BookIcon)), "beike: sidebar entry");
  ctx.effect(() => ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: PANEL_ID }, MainPage)), "beike: main page");
  // 右侧边栏标签页（有右侧栏的界面才注册）
  ctx.inject(["sidebarRightTabs"], (c) => {
    c.effect(() => c.sidebarRightTabs.register({
      id: TAB_ID, kind: TAB_KIND, multiple: false, keepMounted: true, priority: "extension",
      title: () => LABEL,
      guide: [{ id: "open", order: 40, title: () => LABEL, description: () => "在对话旁边看课件、改课件、核对出处、上课", icon: BookIcon }],
    }), "beike: right tab type");
    c.effect(() => c.slots.inject("sidebar.right.pane.tab", () => c.slots.register({ name: "sidebar.right.pane.tab", key: TAB_ID }, SidePage)), "beike: right tab body");
    c.effect(() => c.slots.inject("sidebar.right.pane.tab.title", () => c.slots.register({ name: "sidebar.right.pane.tab.title", key: TAB_ID }, TabTitle)), "beike: right tab title");
  });
}
exports.apply = apply; exports.inject = inject; exports.name = "beike-client";
return module.exports}});
