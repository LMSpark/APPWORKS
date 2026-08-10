# 包目录索引

`packages/` 是 SPARK 的 monorepo 工作区。这里按“运行时包、AI 相关包、构建期包、插件包”分层组织，而不是把所有能力都堆在根应用里。

## 运行时主包

- [spark-app/README.md](spark-app/README.md)：应用层启动、路由、插件、日志与页面宿主。
- [spark-component/README.md](spark-component/README.md)：组件系统、能力链、渲染容器。
- [spark-data/README.md](spark-data/README.md)：DataSet、DataView、关系、树、聚合。
- [spark-project-model/README.md](spark-project-model/README.md)：项目蓝图、页面配置加载、脚本上下文与配置装配。
- [spark-lowcode-api/README.md](spark-lowcode-api/README.md)：对接 lowcode-jdk17 的前端领域 API（蓝图读、数据空间、权限、会话、实时）。
- [spark-utils/README.md](spark-utils/README.md)：公共底层工具和能力键。

## AI 生成物

- [vite-plugin-spark-catalog/README.md](vite-plugin-spark-catalog/README.md)：组件扫描配置与命名工具。
- `scripts/generate-dts-class-model.mjs`：`.d.ts` → `generated/dts-class-model`。

## 维护约束

- 新增工作区包时，必须同步更新这里和根 [../README.md](../README.md)。
- 运行时逻辑优先放进现有包，避免在根 `src/` 再长出平行基础设施。
- 构建期工具与运行时包分开维护，不把构建脚本塞进运行时源码目录。
- `backend-api-contracts/` 在仓库根目录：lowcode 端点台账与 characterization 样本，不是可运行客户端；勿与 `spark-lowcode-api` 混淆。
