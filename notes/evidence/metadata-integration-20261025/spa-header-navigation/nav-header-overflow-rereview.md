# 顶栏导航溢出独立复审

基线：`1f8885312`。按冻结报告复核三文件；报告中的 SHA 与本轮冻结指纹相符。未运行测试、浏览器或服务。结论：存在 3 项可达的样式/导航状态缺口，须在真实 SPA 入口验收前修正；jsdom 不能代替像素验收。

## Findings

1. **P2 — More 弹层中的根导航项没有应用本仓 active 样式，拒绝导航后可能残留库 active。** [`NavHeaderBar.vue:96-101`](../../../../src/layout/NavHeaderBar.vue) 为所有项（包括被 Element Plus ellipsis 移入弹层的根项）赋 `nav-header-bar__item--active`，但这类根项没有 `nav-header-bar__dropdown-item`。其 active 绘制规则是 scoped `:deep(.el-menu--horizontal .nav-header-bar__item--active)`（第 240 行）。实际 teleported popup 容器确有 `.el-menu--horizontal`，但没有组件 `data-v` 祖先（仅 li 本身带 `data-v`），因此 Vue scoped/deep 编译后的祖先限定选择器不匹配；popper 全局样式仅给 dropdown child 类设 active（第 300 行）。根项点击后若 `navigateTo` 被路由守卫拒绝，Element Plus 可先更新自身 `.is-active`，而 `activePath` 未变、`default-active` 未变化；当前 popper 没有针对库 active 与 `isNodeActive` 不一致的中性化规则，可能把拒绝项显示成活动项。主控随后提供的真实 SPA 复现已确认 More 中根项活动样式缺失：点击“企业管理”后同 SPA 导航成功，弹层 li 有自定义 active 类及 `aria-current=page`，但 computed `fontWeight=400`、`boxShadow=none`、颜色为普通文本色。该证据确认本仓 active 样式未命中 teleport popup。现有测试第 143–175 行只断言可见和调用一次，没有拒绝导航/旧 active 保持测试。建议在稳定 popper 范围内按 `isNodeActive` 的自定义类绘制根项 active，并中性化不匹配的库 `.is-active`；补一个 `navigateTo` 不更新 activePath 的溢出项反例。

2. **P2 — `dividerAfter` 对溢出项不显示，测试也未验证分隔线随项进入 More。** 类在 [`NavHeaderBar.vue:99`](../../../../src/layout/NavHeaderBar.vue) 绑定到实际菜单项，但伪元素规则 [`NavHeaderBar.vue:252`](../../../../src/layout/NavHeaderBar.vue) 要求其祖先为 `.el-menu--horizontal`。teleport 后 popup 容器仍带 `.el-menu--horizontal`，但缺少组件 `data-v` 祖先；该 scoped/deep 选择器编译后的祖先限定无法匹配 popup 中的入口，因此项移入 More 后分隔线消失。测试第 188 行设置了 `dividerAfter`，第 229 行只断言旧独立 divider 节点不存在，没有断言对应入口上有可见分隔符或移入 More 后仍有分隔符。应给 popper 中相应项提供匹配样式并覆盖根项/子项的原有分隔语义。

3. **P2 — 顶层父菜单活动态被错误的 `:not()` 选择器压掉。** `nav-header-bar__item--active` 由 [`NavHeaderBar.vue:30`](../../../../src/layout/NavHeaderBar.vue) 放在 `<el-sub-menu>` 根节点；第 273 行却在 `.el-sub-menu__title` 子节点上判断 `:not(.nav-header-bar__item--active)`。标题节点永远没有该类，所以即使父项是 `isNodeActive` 的真实活动项，也会被设为 `font-weight:400; opacity:.75`。根节点的 active 样式虽添加阴影，但标题文本仍按非活动态显示。应将选择器条件放在带类的 submenu 根节点上，或直接以根节点的自定义活动类控制标题样式；测试补充父项活动路径的标题类/状态断言。

## 已核范围

父标题点击使用 `@click.stop` 并直接调用 `navigateTo`，子项由菜单 select 回查原始 item 后调用一次；对应组件测试第 76–97 行覆盖两者。disabled/hidden 测试覆盖入口过滤，动态 badge/items 和 popper 卸载测试覆盖重新测量及卸载清理。已有 More 测试验证了溢出入口可达及单次导航，但没有验证它在 teleport 后的 active、divider 样式。AppHeader 改动只使导航中心允许 Popper 溢出，未改变标题/右侧操作结构；是否在真实 1280px/2300px 视口发生覆盖或裁切，仍须由主控 SPA 截图/交互验收，不以本报告或 jsdom 通过代替。


主控现场另观察到目标页面原注册缺少 SYSTEM PAGE MAPPING，属于存量页面注册缺口，不计入本组导航溢出实现发现，也不建议在此组扩范围处理。


## Round 1 修复复审

冻结核对：`NavHeaderBar.vue`、测试与 `AppHeader.vue` SHA 分别为 `141E12C410FF7FA4E3C2D86DB9B0CD6DC7B6F366659F3679CE82ECDEA8592C5B`、`CAEAFE9F97FDCECEE1D642D3267C6BB4E564001AE932FFDC613F8DC9001427E4`、`5888AA244F79DFB7062D5AC368F59AE40AF0613F914A4A8843EB4244E4A08143`，与冻结 brief 一致。

- **More active / stale Element Plus active：ADDRESSED。** popper 全局样式现按 `.nav-header-bar__item--active` 给 overflow 根项绘制 active，并仅在库 `.is-active` 与该类不一致时中性化。新增回归让 `navigateTo` 保持原 `activePath`，确认点击后的库 `.is-active` 不会冒充当前业务 active；再切换真实活动路径才添加自定义 active 和 `aria-current`。主控提供的实服 SPA computed-style 复核也确认 More 中真实活动根项现为 `fontWeight=600`。
- **dividerAfter 随 More 项：ADDRESSED（代码/DOM合同）。** popper 有独立全局规则，不依赖组件 scoped 祖先；伪元素画在带 `dividerAfter` 的菜单项上。新增 overflow 根项与子项的分隔标志断言，避免被 ellipsis 分离。jsdom 只证明目标 DOM/类存在，不证明伪元素实际像素；真实 SPA 若本组验收要求看分隔线，仍应目视确认。
- **顶层父菜单 active 样式：ADDRESSED。** 规则改为检查含 `nav-header-bar__item--active` 的 submenu 根节点，再设置其 title 样式；陈旧库 active 的中性化条件也检查根节点。新增 active parent 渲染断言。
- **祖先与叶页 `aria-current`：ADDRESSED。** `isCurrentPage` 要求 `isNodeActive(node)` 且节点 ID 等于 `activePath` 末项；新增 parent+child 活动路径用例确认父模块不标成当前页，只有叶页有 `aria-current=page`。这与 parent 仍可有视觉 active 类分开处理，符合语义。

未见本轮引入的新核心冲突。6/6 组件、15/15 导航回归及 typecheck/scoped lint 的归档 exit 均为 0；本轮未重跑门禁。样式像素仍以真实 SPA 证据为准，不把 jsdom 断言当视觉验收。
