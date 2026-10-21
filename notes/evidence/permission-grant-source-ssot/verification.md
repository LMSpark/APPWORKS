# 授权配置来源 SSOT 验收

日期：2026-10-09。用户批准：“确认，按此范围开始”。本人实施和自审，未委派。批准范围与结果在此保留；完成计划按根 AGENTS.md 阶段 7 删除。

## 实现及兼容性

- PermissionDesignApi 删除 PermissionGrantSubjectKind、subjectKind 映射及 DTO 属性；包入口删除对应类型导出，不设别名。这是本轮明确批准的公开类型收窄，不能宣称仓外调用方无需调整。
- 授权 DTO 保留 grantId、pageId、featureTagIds、subjectIds、organizationScope、businessId、enabled、rawGrantType 共 8 项字段。标签与策略、全部授权记录、三种机构范围及固定机构优先级保持。
- rawGrantType 保持 number | null。有限数字及可转为有限数字的非空字符串继续归一化；缺失、空白、布尔值、数组、对象、非有限数字及非法文本变成 null 并诊断，不再伪造 0。未知有限数字原值保留并诊断。
- 现有数字码 0/1/2 仅用于记录可识别性诊断，不映射前端角色或数据读写权限。runtime.read 继续只消费后端 childFun/allowAdd；DataView 的原查询权限链未改。
- prepareMutation 保留原目标、formKey、preimage/change、journal/readback/compensation 语义；测试证明 prepare 不增加 HTTP 请求。没有执行授权配置持久化。

## 变更范围

生产文件仅 `packages/spark-lowcode-api/src/platform/permission/design/permission-design-api.ts` 与 `packages/spark-lowcode-api/src/index.ts`；对应 `permission-api.test.ts` 补合同回归。包 README 与数据空间主文档同步改为服务端配置事实。

生成产物由正式 generate:class-model-surface 更新，未手改生成器或 JSON。用户另行确认后，更新 knowledge/class-model-system.md 的现有生命周期规则，并向 knowledge/testing.md 补定向测试收集规则。未写个人记忆。

## 验证证据

| 验证 | 结果与证据 |
| --- | --- |
| 根类型基线 | 通过，[typecheck-before.log](typecheck-before.log) |
| 行为 RED | 原实现 21 失败 / 17 通过；缺失/非法值错误归零或漏诊断、DTO 仍带前端分类，[permission-behavior-red.log](permission-behavior-red.log) |
| 行为 GREEN | 38 项通过，[permission-green.log](permission-green.log) |
| 最终包级回归 | 19 文件 / 696 项通过，包含上述 38 项及原查询保存权限用例，[api-tests-final.log](api-tests-final.log)；不相加报总量 |
| 根类型最终 | 通过，[root-typecheck-final.log](root-typecheck-final.log) |
| API 包类型最终 | 通过，[api-typecheck-final.log](api-typecheck-final.log) |
| 根 lint | 通过，[lint.log](lint.log) |
| 架构 | 通过，[architecture.log](architecture.log) |
| AI 代码规则 | 1030 文件通过，[ai-codegen.log](ai-codegen.log) |
| 正式生成 | 760 文件投影完成，[class-model-regenerate.log](class-model-regenerate.log) |
| 生成后 ClassModel | 4 文件 / 49 项及 AI 包 lint/typecheck 通过，[class-model-final.log](class-model-final.log) |
| 源码与 schema 对账 | 八项保留字段类型一致；旧类型和属性从设计 shard、mutation 引用产物及 manifest 消失；排序、机构、标签、策略函数和 mutation/runtime/wire/聚合 owner 未改，[contract-audit.json](contract-audit.json) |
| 文档及差异 | 文档门禁与 git diff --check 通过；收口后再次核验 |

38 项包括有效码及数字字符串、15 类缺失/非法输入、未知有限数字、混合记录诊断归属、机构范围、服务端拒绝不被配置放行、upsert/remove prepare 和错目标/错 formKey 拒绝。

## 生成合同的实际核查

常规 verify:class-model 首次通过后，直接读取 schema 仍看到旧类型及 subjectKind。检查 ensure-class-model-bundle.mjs 证实：只有 manifest 缺失才调用生成器；已有文件仅检查完整性。此项旧产物证据见[generated-stale-before.json](generated-stale-before.json)。

随后执行正式全量生成，再运行门禁并直接核对 schema。前轮新增 ScenarioViewConfig.isViewProperty 与 FormalTableRequestConfig 也进入实际产物；此前门禁日志只证明当时检查通过，不能证明这些声明当时已刷新。

生成器产生的 30 个工作树产物差异已分类：[generated-diff-audit.json](generated-diff-audit.json)。其中 16 项仅时间戳或编译器符号编号变化；其余为现源码合同投影、三个新 shard、一个源码已不存在的旧 shard 删除，以及索引/报告更新。现有请求配置与布局合同的旧投影也随正式生成刷新，未顺手修改这些生产 owner。生成器及 ClassModel 测试验证产物，不将其等同在线页面验收。

## 中间诊断与自审

- 首次根 Vitest 命令返回 No test files found，日志 permission-red.log 保留；它不是行为 RED。实际使用 API 包配置后才复现上述 21 项失败。
- 参数化测试同时包含空对象及 valueOf 对象，包级 TypeScript 的重载推断失败。使用具名夹具的 unknown 输入修正；日志 api-typecheck.log 保留，不以类型断言或 any 绕过检查。
- 本人自审覆盖保留字段、已知/未知码、机构优先级、归一化边界、命令零写入、服务端 false 结果、导出及 schema。未发现本轮未解决的实现缺陷；这不是独立审查。
- 未修改请求、查询和 mutation owner；没有为清理分类建立另一套角色映射、授权缓存或写入通道。

## 验收边界

本轮验证为本地正式类与模拟 HTTP 传输合同，未在线修改配置，也未执行整页浏览器验收。公开类型删除属于已批准变更；仅在本轮覆盖面内未发现回归，不宣称整仓旧逻辑、数据空间整页或全部迁移已完成。未提交推送。
