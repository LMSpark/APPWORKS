状态：implementing

## 任务目标

在 `D:\SPARK_AppWorks` 恢复业务审批流程页面骨架、lowcode FlowManage 包装、导航与场景配置，并从流程监控接通运行详情路由。

## 阶段与业务语义

- W1：流程模型目录查询、筛选、增删改、设计入口、复制 KEY/workFormId
- W2：运行详情/办理页接收 `wfid`+`flowid`；监控列表可跳转详情
- 设计子面板：节点/边列表只读占位，完整图编辑属后续阶段

## 影响范围

- `src/views/features/workflow/**`（8+ Vue）
- `src/lowcode/resources/workflow/**`
- `config/pages/workflow/**/pagedata.json`
- `config/navigation/vue-pages.json`、`config/pages/system-scenarios.json`、`src/registries/system-scenario-registry.ts`
- `src/views/features/system/flow-monitor/ui/flow-monitor-page.vue`
- `tests/runtime/page/workflow/**`
- `notes/research-workflow-approval.md`

## 验证计划

- `pnpm run typecheck`
- `pnpm exec vitest run tests/runtime/page/workflow`