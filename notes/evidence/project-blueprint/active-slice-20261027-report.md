# 2026-10-27 DevSystem/SPARK data 活动切片筛选报告

## 结论

本次从 clean HEAD `00cb3a116a5de4c0897015e1c90c2e1d5a43db5f` 对唯一台账的开放项做只读筛选。没有找到同时满足“有已确认生产调用者、DataSet/DataView 身份与权限/owner 合同已具备、可用 TDD 安全推进 DevSystem 蓝图整合”的新切片；未修改产品代码、未添加测试、未运行测试或业务写入。

## 已排除的候选

| 候选 | 源码证据 | 结论 |
| --- | --- | --- |
| DevSystem NavHost 项目关系编辑 | 唯一台账“DevSystem NavHost 关系维护”指出 UI 只读；无该关系 DataView 的写权限、行/字段权限、正式 CRUD owner 与读回证据。 | 合同未证实，保持只读。 |
| 平台应用目录 DataView 化 | `listApplications()` 仍走平台 API direct GetData；没有能证明等价的路由场景身份、租户/会话过滤和权限投影。详见唯一台账已引用的 `notes/evidence/data-space/app-catalog-dataview-20261027-report.md`。 | 身份和权限合同未证实。 |
| 物理表/视图预览 | 需物理资源身份的服务端正式查询与权限合同，台账明确未证实。 | 不制造模型身份或前端权限。 |
| WorkflowDesigns 文件读取 | 正式文件资源 DataView 身份、读权限和回执合同未证实。 | 不包装原文件 API。 |
| 蓝图兼容 gateway 写方法 | `src/lowcode/lowcode-runtime.ts:479` 创建通用 gateway；`582-620` 的 blueprint `addNode/updateNode/deleteNode/moveNode` 仍直接委托 `lowcodeApi.blueprint`。ProjectWorkspace factory 位于 `src/services/project/project-shell.ts:61-97`，以及 headless factories `src/services/page-design/page-design-headless.ts:21-29`、`src/services/project-planning/project-planning-headless.ts:28-53`。但对 `src` 搜索未发现这些 blueprint mutation 方法的直接生产调用；已知 PageDesign guard 与 ProjectPlanning tests 明确 fail closed / 不调用 `ProjectWorkspace.saveAll`，而 DevSystem 当前正式提交 owner 是 `src/views/app/dev-system/useDevState.ts:203-294` 建立并注册的 `BlueprintWorkspaceDataView` 外部 session。 | 直接变更 gateway 会影响通用 workspace 边界，当前没有活跃消费者合同可证明删改安全；headless provider 也没有确认的生产调用链。不能据此建一个空拒绝测试或包装器。 |

## 对应测试现状

既有测试已覆盖关键阻断行为：`tests/app/services/project-planning-agent-run-provider.test.ts:211` 验证未获准时 fail closed；`tests/app/services/project-planning-ai-runner.test.ts:225-257` 验证不经 ProjectWorkspace 投递并消费 DataView receipt；PageDesign gateway guard 测试也覆盖拒绝 raw gateway 写入。将相同断言另起切片不会形成有意义的 RED。

## 下一步解锁条件

- NavHost 关系：取得正式 DataView 查询权限投影、关系行/字段写入授权、资源 owner 及服务端读回回执证据。
- 目录、物理预览与工作流文件：先证实真实服务支持的资源身份、权限投影、过滤/分页或文件读取合同，并明确路由 scope 与生命周期。
- 蓝图 gateway：先找到一个真实生产调用者及其业务读写语义；再判断其是否可迁移到现存正式 `PageRuntime → DataSet/DataView` owner。若无调用点，不创建独立 owner。

筛选过程只读取源码、测试和唯一台账；没有读取或记录密码，也没有访问真实业务写接口。
