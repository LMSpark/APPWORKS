# 布局目录说明

`src/layout/` 负责根应用的布局骨架、导航容器和主题相关 UI，不承载具体业务页面逻辑。

## 当前内容

- `AppLayout.vue`：应用主布局容器。
- `AppHeader.vue`、`AppSidebar.vue`、`AppFooter.vue`、`AppTabBar.vue`：导航与壳层组成部分。
- `NavHeaderBar.vue`、`NavContextSelector.vue`：导航上下文切换与平台头部交互。
- `ThemeConfigurator.vue`：主题配置入口。

## 放置原则

- 与“页面壳层”和“导航骨架”直接相关的组件放这里。
- 只在某个单页里使用的业务组件不要放这里，应回到对应 `views/` 或业务域目录。
- 通用导航状态与 tab/page 管理优先复用 `@spark-appworks/spark-app`，不要在这里再复制一层基础设施。

## 相关入口

- [../views/README.md](../views/README.md)
- [../../packages/spark-app/README.md](../../packages/spark-app/README.md)
