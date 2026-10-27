# Task 2 — NavHost `selectPid` 项目层级候选

## 目标

继续 DevSystem NavHost 项目切换切片，按参考 AppWorks 的 `selectPid` 语义支持层级候选。当前切片只能处理平面候选，并对非空 `selectPid` 明确拒绝；这只是过渡状态，不是最终合同。

## 实施前必须确认

1. 搜索本机可用的参考仓 `apps/appworks/src/ui/` 及 NavHost 相关实现/测试，确认 `selectPid` 到候选父字段、查询过滤、选中值和多级行为的真实映射；不能根据字段名猜语义。
2. 若参考实现不可访问，先检查仓内正式 `RendererTree` / `RendererTable` / DataView 级联合同和 ClassModel 目录、概要、指南；仍不能证明时停止实现并报告缺少的真实合同，不引入自创树协议。

## 现有合同

- DevSystem 由当前路由 `__sparkNavigationId` 精确定位宿主关系 DataView。
- 宿主关系 `dataSetId + DataName` 定位项目候选 DataSet、模型；值/文案字段来自 `selectValParam/selectTextParam`。
- 所有业务读取必须沿 SPARK data 的 PageRuntime → DataSet → DataView 链；组件绑定 DataView。禁止直连 API、网关、平台目录查询、手传候选数组，禁止改 Java。
- 选择后调用既有 `state.openEditingProject({tenantId, projectId})`，保留当前 dirty/pending/unknown 切换守卫；不更新导航 URL，不增加第二套保存或 workspace 真源。
- 对关系身份、完整读取、层级父子关系、候选主键/值唯一性和字段可见权限做 fail-closed 检查；无有效选择时不能打开项目。
- 层级交互必须用仓内正式标准组件与 DataView 查询/过滤/级联合同；不得把候选 DataView 的行复制成业务数组真源。
- 不写入任何 SPA 元数据或业务数据；当前真实路由 `appworks-tool-dev` 的宿主关系读回 0 条，成功路径只能用自动化合同测试验证，不能宣称真实成功切换。

## 验收

- 先提交 RED 原始输出，再实现，提交 GREEN 原始输出。
- 基础平面映射仍通过；父项未选/已切换、子候选过滤、层级选择与取消、不可读父字段、父子身份不匹配、重复值/主键、查询不完整、候选变化期间路由或项目身份过期均覆盖。
- 确认只把最终选中的项目 ID 交给既有切换命令，不由旧异步结果解锁或改写新项目。
- 只改本任务所需组件/合同/测试/证据，不改 ledger；主控复核后再更新唯一 ledger、跑工程门禁、SPA 只读烟测并提交推送。
- 实施者不改 Java，不创建或修改外部/线上配置，不派生新的子代理，不提交或推送未复核代码。

## 基线

- 基线提交：`c007a363e`。
- 已知真实 SPA：账号王涛登录态，`NewApp/D99A1DCE9894698799101EFD70F8FC76` 的 DevSystem 路由 `__sparkNavigationId=appworks-tool-dev`；关系 DataView 返回 0 条。
