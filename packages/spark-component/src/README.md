# src

根目录按“公开入口 + 领域分组”组织：

1. `index.ts`：公共 API 根入口
2. `core/`：基础内核分组入口
3. `system/`：Spark 命名空间、插件、注册表
4. `components/`：组件层
5. `page/`：页面编排层
6. `permission/`：权限解析与渲染策略

说明：

1. 外部消费优先使用 `index.ts`
2. 包内实现按职责进入 `core/`、`system/`、`components/`、`page/`、`permission/`
3. 不保留空壳 internal 聚合层；跨层共享能力从明确的领域入口导入
