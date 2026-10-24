# 参考页自动字段写入事件及恢复记录

日期：2026-10-24。状态：4 条原 ID 已恢复，独立正式回读通过；审计时间差异单独记录。

## 已捕获事实

本轮主控启动参考仓的 `pnpm dev:metadata --host 127.0.0.1`，通过实际服务打开 T 空间并查看 SourceScope 模型。主控未点击保存或删除，但被动网络记录捕获到 `8580.672`：`Base_DataModel_Field` 的 2 条 Changed、4 条 Deleted，响应 Code 200。发现后立即关闭参考页并停止 3000 前端；不再对该真实空间重开参考模型面板，也不把本轮操作记为只读验收通过。

| 范围 | 身份 |
| --- | --- |
| 应用 | D99A1DCE9894698799101EFD70F8FC76 |
| 目标 T | 944DEE5A0E5170F903E0E008172C4CD2 |
| 原 SourceScope 模型 | A7199374E11E24BB0FB6938407224304 |
| 请求修改 txt.AsName | 90DE022F38D067897FDC3E2975F60A83 |
| 请求修改 RetirementProbe_20261018.ValueFun | B65D0D55826587CFC571CD6967DC5E2C |
| 请求删除 exVal_2 | 36AA9C0871FED59900FFE5753599080C |
| 请求删除 exVal_1 | 794C1A795F8DC57864D3441208F2A2C8 |
| 请求删除 exVal_3 | B7B798B32B8610E9975DFA24CA527105 |
| 请求删除 exVal_4 | D09311045F22EF5FAB50630C59E77245 |

上述是请求内容与返回状态；两条更新是否改变最终业务值、四条删除的实际结果，须以独立正式查询核对。此前正式响应 `9000.1564` 保留了原 16 字段，配套响应保留原 3 模型及 0 关系；该快照早于临时生命周期模型的新增。原文件保存在 cache，SHA256 为 `9accd72042840d7f7a501f585e60da3be3bf7c6bcb3640756569f18470787f77`，不把权限凭据写入本证据。

## 源码归因与迁移裁决

参考仓 HEAD 为 `791c464b8c6b3c7049ea36ab57546c3481e4d889`。被检查的元数据页面及其数据模块与该 HEAD 一致；参考工作树另有其他任务修改，认证 UI 并非冻结 HEAD。本次未修改参考仓，也未启动或修改 Java。

参考 `use-data-set-design-node-panel.ts` 的 `currentModelId` immediate watcher 调用 `initializeCurrentModelPanelState → syncBoundModelFieldsOnOpen`。字典来源同步保留种子字段及计算字段，剔除不在来源集合中的其他字段；`syncDataModelFields` 随后直接保存差异。该路径与 4 个 exVal 的捕获删除相符。页签切换函数本身只构造本地呈现；没有事件时间线证明请求相对点击的毫秒顺序，不能把静态归因说成已捕获的点击调用栈。

裁决：打开即写、来源缺席即删不作为本仓迁移规则。当前已检查的本仓模型面板及 owner 链没有复用这一触发器；这只是对应源码范围的结论，不替代全平台真实验收。后续比较先使用源码及已留证画面，真实参考页须有隔离数据和已核定的写入边界。

## 恢复边界

恢复使用本仓正式 `openLowcodeDataSpaceDesignSession → metadata DataSet → Base_DataModel_Field DataView → DataSet.saveChanges`，配置空间 C 与目标 T 分别核验。根据最新正式查询确定实际需要恢复的记录；保留原 ID、原业务列和 null/空串语义。临时模型 `7026EA5EB0FC7DEE00E001C7031E3892` 及其 9 字段不参与恢复或删除。

默认预检及独立核验安装保存/文件写入保护。提交只允许精确目标的一次批次，未确认结果不自动重试。保存计数、原身份与字段值接纳、独立新实例回读分别记录；审计时间差异与业务值差异分开。普通页面保存的懒加载合同不因此改为全空间扫描；本次读取是已发生误写后的维护核对。

防写模式正式回读 `reference-restoration-preflight-r3` 得到 21 字段、4 模型、0 关系：4 个 exVal 原 ID 全部缺失；两个 Changed 目标实际仍是 baseline-null，业务差异为空；其他原字段及原三模型业务列一致。恢复范围据此收窄为 4 新增、0 更新、0 删除，两处 null 只核验。该结果不证明服务如何处理空字符串，不重复写入已正确的值。

最终防写预检 r5 通过：4 条原 payload 在本次查询权限下可暂存，精确四个 pending-create ID，无更新、删除或编辑覆盖，保存调用为 0。随后仅执行一次 DataSet 保存：4 新增、0 更新、0 删除；回执接纳后再次核对原 ID、业务值及其他记录。另开进程、重新认证和创建独立设计会话的正式 DataView 回读通过：原 16 字段与快照业务列逐项一致，合计 25 字段（含保留的临时 9 字段）、4 模型、0 关系；临时字段及四模型业务投影、pagedata 原文 hash 均未改变。过程、精确身份、回执和 hash 见 [恢复证据](a-reference-field-restoration.json)。这是一次 DataSet 提交调用，不冒称已统计 HTTP 写请求数。

审计差异保留：4 条重新新增字段的 `createtime/updatetime` 更新；原自动写入涉及的另 2 条字段仅 `updatetime` 与旧快照不同，业务值仍为 null，本次没有再更新它们。没有伪造或回写历史审计时间。新开本仓设计器也显示 SourceScope 九字段，保存按钮禁用；13 条 API 为 10 次 GetData、2 次文件读取和 1 次认证 refresh，无业务写入，见[恢复后画面](a-reference-fields-restored-ui.png)。恢复完成不代表参考整页对照或阶段 A 完成。

## 画面范围

保留的参考概览、模型结构、字段呈现、输入参数，以及本仓概览、输入参数截图，仅说明当时布局与入口。参考模型结构截图显示的是自动写入后的 5 个字段，不能拿它证明原定义应只有 5 字段。`a-current-model-structure.png` 实为灰屏，已移至 cache 标记无效，不作为验收证据。

- [参考概览](a-reference-design-overview.png)
- [参考模型结构](a-reference-model-structure.png)
- [参考字段呈现](a-reference-field-presentation.png)
- [参考输入参数](a-reference-input-parameters.png)
- [本仓概览](a-current-design-overview.png)
- [本仓输入参数](a-current-input-parameters.png)

完整自动写入归因、脚本审查及逐次预检 raw 日志保留于 `node_modules/.cache/metadata-integration-20261024/`。未完成的整页差距继续归唯一台账，不另建活动计划。
