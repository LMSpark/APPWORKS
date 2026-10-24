# 顶栏溢出修复实施前独立复核

基线 `1f888531293a8677533173dfde97a243e5934acb`；只读复核，未改文件或运行浏览器/服务。

## 预检结论

方案符合边界：复用已安装 Element Plus horizontal `el-menu` 的 ellipsis 与一级 submenu teleport，只调整 `AppHeader` / `NavHeaderBar`，可保留单行 header/正文高度且不需改 `AppLayout` / `DevSystem`。当前 RED 明确是 `AppHeader.vue:283-289` 中心槽宽度有限且 `overflow:hidden`；`NavHeaderBar.vue` 将所有根入口横向展开，所以1280实测中心仅695px，根入口真实被裁切。

但 Element Plus 只解决容器超宽后的显示方式。实现冻结前必须证明以下行为仍成立；这些是当前产品合同，不是增加导航框架的要求。

## 必须覆盖的交互与布局

1. **父标题与子项各只导航一次。** 当前 `NavHeaderBar.vue:58-64` 点击均交给唯一 `nav.navigateTo(node)`；`useNavigation.ts:591` 自己处理父节点路由/动作/首个可见叶子。`el-sub-menu` 自带点击开合，父标题同时保留原导航是主要交互风险。需要真实 Element Plus 行为断言：点击可导航父标题恰好一次传入父 node；展开后点子项恰好一次传入 child；菜单内部 active/select 不能再触发第二次 `navigateTo`。现新测试的首例已列出这组预期，但必须针对最终组件通过。
2. **活动身份只来自正式导航状态。** `useNavigation.ts:125,206,697` 按路由更新 `_activePath` 并通过 `isNodeActive` 判断；Element Plus `el-menu` 在不启用 router 时会在点击后自行更新 `activeIndex`。最终实现须让显式 active 渲染继续由 `nav.isNodeActive`（或其同一正式 `activePath`）驱动，不能把内部 click state 当第二真源。测试应在不点击菜单的情况下模拟 browser/back 或外部路由切换，验证旧根项/子项（含 overflow popper 中项）取消 active、新项激活；特别覆盖导航系统页身份 query/nodeId 切换。
3. **hidden、disabled、徽标、分隔线跨 overflow 保真。** `useNavigation.ts:220` 过滤 hidden 根项；当前组件 `visibleChildren` 过滤 hidden/disabled 子项，根 disabled 不导航，`badge()` 只展示有 truthy badge，`dividerAfter` 在根/子项后渲染。Element Plus 的 `menu.js:235-255` 按根 `childNodes` 宽度切片、`menu.js:349-359` 将剩余 slot 节点原样塞进“更多”submenu。若 divider 是与 item 分开的兄弟节点，分隔线可能被独立切到 overflow 或留下悬空分隔；须将分隔语义与所属入口作为一体验证（包含切片正好落在分隔线前后的边界）。徽标改变会影响 item 宽度，但库只观察菜单根尺寸（`menu.js:283-285`），固定容器宽度下动态 badge/label/items 更新可能不触发重新切片；需要同一实例在宽度不变时修改 badge 与 items 的更新用例，确保没有入口丢失、错误多出/隐藏或残留旧项。禁止默默丢弃 badges/dividers。
4. **overflow popper 的动态重挂。** Element Plus horizontal 一级 submenu 默认 teleport 到 body（`sub-menu.js:99-110,225`）；menu ellipsis 建立 ResizeObserver。需要打开更多菜单后卸载 `NavHeaderBar`，确认 popper/监听清理；同一宿主重挂后重新测量并能打开仍溢出的入口，无 orphan body 节点、重复监听或 stale active 项。还应覆盖同组件 `items` prop 动态替换，因为菜单宽度未变化时需确认溢出切片跟着新数据重算。
5. **真实宿主视口验收。** JSDOM 的 mocked `clientWidth/offsetWidth` 只能测组件分支，不能证明 CSS 布局。按 ledger 测真实 SPA 默认1280×720、宽2300、窄宽（至少一档明显小于1280）及 sidebar 展开/收起：更多按钮本身可见可点，首页/中部/末尾入口可从主栏或更多菜单触达，弹层不被 `.app-header__center` 裁切；头栏仍单行且 header/body 高度与 `AppLayout`/`DevSystem` 不变。默认1280未实测通过前不能只凭2300宽通过声明问题解决。

## 当前进展 / 边界

当前 `tests/ui/component/nav-header-bar.test.ts` 已开始覆盖顶层/父/子单次导航、禁用与隐藏子项、外部 active path 变化、overflow 菜单选项单次导航；这是合适的窄范围。当前文件尚未覆盖徽标/分隔线溢出边界、固定宽度下 items/badge 更新、菜单 popper 卸载重挂，也不能替代真实 SPA 视口验收。正式组件的 Element Plus 本地声明确有 `mode=horizontal`、`ellipsis`、自定义 `ellipsisIcon` 与 `teleported` 合同，不存在必须换库或改公共导航路由协议的前置冲突。

没有发现必须改 `AppLayout`/`DevSystem` 或重写 `useNavigation` 的依据；上述限定测试通过后可进入冻结代码复审。当前产品尚未开放，不能据此声明已修复。

## Active 状态补充裁定

可用局部样式中性化 Element Plus `is-active` 的视觉层，再只由 `nav.isNodeActive(node)` 产生的项目类控制高亮；不必 key 重挂、计数版本或写 Element Plus 内部状态。源码中 `ElMenu` 点击会先改内部 `activeIndex`，`updateActiveIndex(val)` 对不存在的 val 回退旧项；`defaultActive` 只在 prop 值变化时 watch，因此被 route guard 拒绝的点击确有 stale `.is-active` 风险。设 `router=false` 并不阻止这个本地 class 状态变化。

最小做法：根菜单与 teleport popper 中分别覆盖菜单项 `.is-active` 的 active 字色和 submenu active underline/边框视觉；显式项目 class（由 `isNodeActive` 计算）保留当前产品高亮。注意 popper teleport 到 `body` 后不再是 `.nav-header-bar` 后代；需要给 `popper-class` 稳定命名并让同一局部样式作用于弹层，不能只写依赖 nav 根祖先的 scoped descendant 选择器。继续保留 hover、focus、disabled、open 等非 active 状态样式。

只给真正当前叶子项设置 `aria-current="page"`；父/祖先项虽可由 `isNodeActive` 高亮，不应一并宣布为当前页面。必测一条守卫拒绝或无路由变化的点击：ElMenu 内部即使留下 `.is-active`，根项/teleport 项都不得显示为活动；随后外部路由切换应只高亮新的 `isNodeActive` 项。无需额外导航状态副本。
