# 顶栏导航溢出修复冻结记录

## 改动范围

- `src/layout/AppHeader.vue`：中心区改为左对齐并允许纵向溢出，让 Element Plus 的 Popper 能离开中心裁切容器；头部仍为单行，未改 header 高度、logo、用户区或 AppLayout/DevSystem。
- `src/layout/NavHeaderBar.vue`：以原 `items` 与唯一 `useNav()` 上下文渲染 Element Plus horizontal `el-menu`，开启内置 `ellipsis`；溢出沿库自带测宽及 teleported Popper 呈现。divider 作为菜单项伪元素随对应入口移动。内容/徽标/禁用/分隔线变化后，调用菜单公开 `handleResize()` 重算；不自建宽度算法或导航数据。
- `tests/ui/component/nav-header-bar.test.ts`：新增真实组件交互覆盖。

## 导航身份与样式

`RuntimeNavigationItem` 仍是唯一菜单数据源，`useNav().navigateTo` 是唯一选择动作。顶层叶子及子项由菜单 select 回查同一个原始 item 后导航一次；父标题保留既有直接导航，并停止冒泡。hidden 项不显示，disabled 项不可导航。`useNav().isNodeActive` 只决定本仓 `nav-header-bar__item--active` / dropdown active 类和当前叶子项的 `aria-current="page"`；Element Plus 内部 `activeIndex` 只作菜单交互状态，局部 CSS 中性化与本仓活动项不一致的库 `.is-active` 样式，避免路由外部切换时旧菜单项继续呈现为活动项。拒绝/未完成的导航不会因此被本地状态伪装成新活动路径。

父标题/子项没有用包裹整个 submenu 的 click 处理器，避免子项点击冒泡造成父项二次导航。More 菜单使用稳定 `popper-class=nav-header-bar__popper`，全局窄选择器作用于 teleported 节点；未改 Element Plus 全局样式或菜单行为。

## 验证

- `pnpm exec vitest run tests/ui/component/nav-header-bar.test.ts`：5/5 通过，日志 `node_modules/.cache/metadata-integration-20261024/nav-header-component.log`，exit `nav-header-component.exit`。
- `pnpm exec vitest run tests/auth-nav/navigation-platform-paths.test.ts tests/runtime/auth-nav/navigation-platform-paths.test.ts`：15/15 通过，日志 `nav-header-nav-regression.log`，exit `nav-header-nav-regression.exit`。
- `pnpm run typecheck`：通过，日志 `nav-header-typecheck2.log`，exit `nav-header-typecheck2.exit`。首轮 typecheck 曾因测试直接调用 Element Plus 类型未公开的 `handleResize` 而报错；测试已改为模拟真实 ResizeObserver 生命周期，不再直接访问该方法，复跑通过。
- `pnpm exec eslint src/layout/AppHeader.vue src/layout/NavHeaderBar.vue tests/ui/component/nav-header-bar.test.ts`：通过，日志 `nav-header-lint-final.log`，exit `nav-header-lint-final.exit`。
- 早期 `red3` 的子项失败由过宽 selector 误点父菜单导致，`green1/green2` 的失败由错误 popper selector /夹具造成，均不计为产品缺陷。定稿测试以真实 Element Plus more 节点 `.el-sub-menu__hide-arrow`、ResizeObserver回调及完整标题比对运行。

## 证据边界与待验收

主控已有 DOM/截图 RED：实际视口 `1280×720`，header center `x=392.875,width=695.125,height=24,overflow:hidden`，14个根入口中8个不可命中。新 jsdom 测试验证 Element Plus overflow 菜单存在、选择导航一次、动态 badge/items 更新、旧入口不残留及打开的 teleported popper 随卸载清理；它不证明真实浏览器中的 1280px 像素裁切、logo/account覆盖、Popper边界定位或登录态路由结果。由主控在现有 SPA 验证 1280px 首尾入口可达/无覆盖、More弹层未裁切，以及 2300px 下不需要溢出入口。未改正式导航配置。

应用壳 Vue 无本批 ClassModel/生成合同；本次公开输入与行为仍由源码 props、注入的 `useNav` 和 Element Plus 已安装组件 API 定义。没有运行 ClassModel 生成器。

## 冻结 SHA-256

- `src/layout/AppHeader.vue`: `5888AA244F79DFB7062D5AC368F59AE40AF0613F914A4A8843EB4244E4A08143`
- `src/layout/NavHeaderBar.vue`: `7FDF43B50F4B4C6539B597DC6E02A0445F382EAD8FEE67D9F76BD3A58A074E34`
- `tests/ui/component/nav-header-bar.test.ts`: `052ABFCE9F168D6DE4D26053F96F1A90ECB030941553420330C7CEE5D7D5CFF0`


## 独立复核 P2 修复（round 1）

- More popup 内按稳定 `.nav-header-bar__popper` 选择器为本仓 `nav-header-bar__item--active` 根项与子项提供 active 样式；若 Element Plus 内部 `.is-active` 与当前 `useNav` active 不一致，则将该 popup 项中性化。拒绝导航回归验证：点击溢出项后 `navigateTo` 被调用一次但 `activePath` 不变，库的 `.is-active` 可以存在，当前项仍无本仓 active 类和 `aria-current`；再将活动路径切到该项后，活动类及 `aria-current=page` 才出现。
- 溢出 popup 中 `dividerAfter` 继续附着原菜单项，不创建可被 ellipsis 切走的兄弟节点；横向 popup 列表使用行底分隔线，保留原垂直/横向方向语义。根溢出项和 dropdown child 都断言携带分隔标志。
- 顶层 submenu 的 active 样式选择器现检查带自定义 active 类的 submenu 根节点，再作用于标题；过期库 `is-active` 的中性化条件同样放在 submenu 根节点。测试验证父模块可保留 `useNav` 活动身份、父模块不被标记为当前页面，只有 activePath 末端子页面得到 `aria-current=page`。
- 测试 RED 证据：`nav-header-p2-red2.log/.exit` 的 computed-style 断言在 jsdom 报错；组件测试运行未加载 Vue SFC 样式，因而该 computed style 不是产品视觉反例。已去掉该不适用断言，保留语义行为断言。真实 popup/父菜单视觉效果仍由主控 SPA 验收。
- 最终 `pnpm exec vitest run tests/ui/component/nav-header-bar.test.ts`：6/6，原始日志 `nav-header-p2-final-component.log`，exit `nav-header-p2-final-component.exit`。
- 最终 `pnpm exec vitest run tests/auth-nav/navigation-platform-paths.test.ts tests/runtime/auth-nav/navigation-platform-paths.test.ts`：15/15，原始日志 `nav-header-p2-final-regression.log`，exit `nav-header-p2-final-regression.exit`。
- 最终 `pnpm run typecheck`：exit 0，日志/退出码 `nav-header-p2-final-typecheck.log/.exit`。
- 最终 `pnpm exec eslint src/layout/AppHeader.vue src/layout/NavHeaderBar.vue tests/ui/component/nav-header-bar.test.ts`：exit 0，日志/退出码 `nav-header-p2-final-lint.log/.exit`。

### P2 修复后的 SHA-256

- `src/layout/AppHeader.vue`: `5888AA244F79DFB7062D5AC368F59AE40AF0613F914A4A8843EB4244E4A08143`
- `src/layout/NavHeaderBar.vue`: `141E12C410FF7FA4E3C2D86DB9B0CD6DC7B6F366659F3679CE82ECDEA8592C5B`
- `tests/ui/component/nav-header-bar.test.ts`: `CAEAFE9F97FDCECEE1D642D3267C6BB4E564001AE932FFDC613F8DC9001427E4`
