# 前端服务目录索引

`src/services/` 存放根应用层的前端服务与协议适配，负责把认证、路由、HTTP、页面缓存和 SSE 事件等能力组织成可调用接口。

## 当前内容特征

- 请求与路径：HTTP 封装、API 路径拼装、租户路径工具。
- 平台级能力：项目切换、页面缓存、SSE 事件订阅。

## 放置原则

- 应用层集成逻辑放这里。
- 纯基础工具优先沉到 `packages/spark-utils/`。
- 如果某个服务只属于单一业务域，后续可迁入对应页面域目录。

## 相关目录

- [../components/README.md](../components/README.md)
- [../views/README.md](../views/README.md)
- [../../packages/spark-utils/README.md](../../packages/spark-utils/README.md)
