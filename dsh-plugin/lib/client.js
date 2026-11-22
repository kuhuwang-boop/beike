window.__ModuleLoader__.load({id:`dsh-beike`,factory:require=>{var module={exports:{}};var exports=module.exports;Object.defineProperty(exports,Symbol.toStringTag,{value:`Module`});
/*
 * 备课工作台 · DeepSeek Harness 浏览器端
 * 1) 左侧边栏：「备课工作台」入口，点开在主区域显示完整工作台
 * 2) 右侧边栏：「备课工作台」标签页，和 AI 对话的同时查看、修改课件
 * 两处都嵌入插件在 /beike 提供的工作台页面（同源，沿用 DSH 的登录）。
 * 手写的 ModuleLoader bundle，无需构建步骤；只依赖宿主共享的 react。
 */
const React = require("react");
const h = React.createElement;
const PANEL_ID = "dsh-beike";
const TAB_ID = "dsh-beike";
const TAB_KIND = "beike";
const BASE = "/beike";
const LABEL = "备课工作台";

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

function Frame(props) {
  const src = BASE + "/?embed=" + props.mode + "&theme=" + hostTheme();
  return h("div", { style: { position: "relative", flex: "1 1 auto", width: "100%", height: "100%", minHeight: 0, display: "flex" } },
    h("iframe", {
      src,
      title: LABEL,
      style: { flex: "1 1 auto", width: "100%", height: "100%", border: 0, display: "block", background: "transparent" },
      allow: "clipboard-write; fullscreen",
    }));
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
