# 静态资源目录索引

`public/` 存放需要以静态文件方式直接暴露给前端的资源，不经过应用源码编译流程。

## 当前内容

- `favicon.*`：站点图标。
- `config/`：静态配置资源与默认配置文件。

## 结构约束

- 页面配置运行时只从 lowcode-jdk17 API 读取；`backend-api-contracts/characterization-fixtures/` 仅保存旧行为差分样本，不是运行时回退源。
- ClassModel 知识 JSON 真源在 **`generated/dts-class-model/`**（入库，开发中直接评审）；HTTP 由 Vite 插件映射到 `/dts-class-model/`。
- 只放静态资源，不放运行时业务代码。
- 如果某个资源需要参与类型检查、打包或模块引用，应优先放进 `src/`。

## 相关文档

- [../docs/guides/CONFIG_SYSTEM.md](../docs/guides/CONFIG_SYSTEM.md)
- [../packages/spark-lowcode-api/README.md](../packages/spark-lowcode-api/README.md)
