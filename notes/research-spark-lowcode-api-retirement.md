# spark-lowcode-api 退役研读

## 目标

按语义清退独立 `packages/spark-lowcode-api/` 项目，并保证：

- SPARK Data 是唯一业务数据与后端交互入口。
- DataTable 持有资源、模型、接口、CRUD 与 owner adapter 契约。
- DataView 持有本次查询、权限、编辑、保存基线与回执。
- lowcode 业务不再作为并行 API 门面存在。

## 当前事实

- 包内有约 160 个 Git 跟踪文件，包含源码、测试、配置与文档。
- 公共入口 `src/index.ts` 聚合会话、平台、目录、设计、数据空间、权限、蓝图、实时、上传和资源 owner。
- 全仓存在数百个包名与内部路径引用。
- `data-space/runtime/**` 同时包含应归 SPARK Data 的执行语义和 wire/协议细节。
- `project-blueprint` 包含 wire、领域模型和宿主 API 三类职责。
- `realtime` 包含 spark-ai 编排、宿主连接和 DataView owner 三类职责。
- `platform/resources/**` 大多是特定服务 adapter，不能搬成通用 CRUD。

## 语义归属

### SPARK Data

- DataTable 执行配置与 owner adapter。
- DataView query/save 生命周期。
- 数据空间查询上下文、权限基线、保存 guard/order/result。
- 文件、命令、逻辑视图 owner 通过 DataView resource binding 执行。
- 已有 modelBinding/resourceType/resourceId/api/crudConfig 的模型级配置。

### spark-project-model

- 低代码蓝图 wire 的领域归一化后模型。
- 蓝图版本、文件版本语义中属于项目模型的部分。
- 项目级领域验证与投影。

### spark-ai

- Agent turn/resource/config 编排。
- AI data-entry session、draft runner。
- realtime 事件中属于 Agent 的合同，业务数据仍回到 DataView。

### spark-utils

- 仅通用 HTTP、错误、wire 解包、缓存、事件与 JSON 原语。
- 不接收特定平台业务逻辑、权限计算或数据空间保存规则。

### src/lowcode

- 当前应用/租户会话与宿主请求 scope。
- 应用/平台目录服务装配。
- 设计文件上传与业务资源客户端。
- 平台权限设计、缓存、恢复、企业初始化、PDF 等领域适配。
- 这些 adapter 最终必须装配到 DataSet/DataTable/DataView，不向页面开放并行数据 API。

### backend-api-contracts

- wire 类型事实、AjaxResult、验证码、查询操作符和平台接口台账。
- parity 规则与 endpoint consumer ledger。
- 不承载运行 owner 或页面查询实现。

## 依赖方向

```text
backend-api-contracts
  -> 提供 wire/接口事实

spark-utils
  -> 通用原语

spark-data
  -> DataSet/DataTable/DataView
  -> 数据查询、保存、权限基线、owner adapter

spark-project-model
  -> 蓝图/页面/场景领域

spark-ai
  -> Agent/Workflow/AI turn

src/lowcode
  -> 平台、会话、资源与特定服务 adapter
  -> 将 adapter 装配进 SPARK Data
```

`spark-data` 不反向依赖宿主。`src/lowcode` 不形成第二业务数据入口。

## 关键迁移原则

1. 不能把整个 `spark-lowcode-api/src/**` 搬入一个新目录。
2. 不能为了删除包把页面直接 import `src/lowcode/**` 后继续手调查询/保存。
3. `DataSpaceRuntimeApi` 的业务数据执行职责必须归 SPARK Data；宿主只注入 scope、HTTP 与 wire adapter。
4. `LowcodeApi` 聚合门面必须删除，消费者按能力依赖明确 DataSet 或宿主 service。
5. 内部测试路径迁移不能替代公开合同；测试与实现同域迁移。
6. 公开 wire parity 测试改为新归属后的同形校验。
7. 生成的 ClassModel、consumer ledger、alias、workspace 配置只在源码迁移后按生成器更新。

## 已知阻塞

- 全仓数百个 import 尚未分组迁移。
- 平台会话、应用 store、权限设计与资源服务的宿主归属需逐项确认。
- DataSpaceRuntimeApi 的 adapter 接口须先稳定。
- blueprints/realtime 的领域边界需与现有 `spark-project-model`/`spark-ai` 合并。
- 当前工作树包含其他未提交及新提交改动，迁移必须分阶段、逐包验证。

