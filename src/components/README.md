# 应用组件索引

`src/components/` 存放根应用层直接使用的少量应用壳层 UI，而不是通用运行时基础组件。

## 当前内容特征

- 应用壳层组件：错误兜底、页面加载态。
- 运行时上下文展示：如 `ModuleContextBadge.vue`（低代码页可用的 `r-module-context-badge`）。
- 图标统一使用标准组件 `DisplayIcon`，不在应用层另建图标组件。

## 放置原则

- 仅属于根应用的组件放这里。
- 可复用的运行时通用组件应优先沉到 `packages/spark-component/`。
- 如果组件开始围绕单一业务域聚集，优先考虑就近放到对应页面域目录。

## 相关目录

- [../views/README.md](../views/README.md)
- [../services/README.md](../services/README.md)
- [../../packages/spark-component/README.md](../../packages/spark-component/README.md)
