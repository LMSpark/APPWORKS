状态：implementing

## 任务目标
宿主外壳（src/layout、src/components）不再直接使用 Element Plus，全部改用 spark-component 标准组件；标准库缺口先在组件层补齐。

## 阶段与业务语义
- 用户 2026-11-14 选择：现在做（先扩展标准组件，再替换 9 个宿主文件）；宿主无业务 DataView 的开关/选择器用本地 static-data DataSet + FieldSwitch/FieldSelect 绑定（不持久化），值变化同步回宿主状态。
- 分工：另一会话负责 src/views/features 的第三方直调清理；本会话负责 app/platform/FileDataManager 外壳页与宿主布局。
- 业务结果：侧栏/顶部导航、头部工具与用户菜单、主题抽屉、项目上下文选择器的可见行为与导航结果不变。

## 影响范围
- spark-component：
  - 新增 `containers/layout/navigation/RendererMenu/`（r-menu：vertical/horizontal、collapse、activeIndex、子菜单/分组、图标/徽标/禁用/分隔、宿主判定的激活与 aria-current、子菜单标题可选中、横向省略与重新测量、select 事件）。
  - `DisplayIcon` 补齐导航旧图标别名与 fallback/文本兜底（承接 NavIcon 逻辑）。
  - `RendererDropdown` 补 `command` 事件与默认插槽触发区；`RendererPopover`/`RendererTooltip` 补 reference/default 插槽。
  - 注册（register-renderers、各级 index 导出）、API.md 表行、组件测试、ClassModel 正式生成。
- 宿主：AppSidebar（删 AppSidebarNode）、NavHeaderBar、AppHeader、ThemeConfigurator、NavContextSelector、AppBreadcrumb/AppTabBar/HomePage 等 NavIcon 消费者改 DisplayIcon（删 NavIcon）。
- 删除死代码：IconPicker（仅残留测试桩）、ModuleContextBadge（r-module-context-badge 无配置使用；同步 main.ts 注册、components/README）。

## 验证计划
- `pnpm run generate:class-model-surface`、`pnpm run typecheck`、`pnpm run lint`（相关目录）、`pnpm run verify:rules`。
- 组件测试：RendererMenu、DisplayIcon 别名、RendererDropdown command。
- 宿主测试：app-sidebar-nav、lowcode-runtime-navigation、application-switch 等受影响用例。
- 只读烟测：侧栏/顶部导航跳转、用户菜单、主题抽屉开关、项目选择器。

## 风险项
- 宿主样式依赖 el-menu 内部类名：组件内部仍封装 el-menu，宿主样式改用组件稳定类名。
- 并发会话修改同仓：只提交本会话 hunk。
