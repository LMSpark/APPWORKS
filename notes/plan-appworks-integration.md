状态：draft（迭代计划 v2，2026-10-19；取代同文件 v1 阶段表。基线 04dcaf178..91f0a6580 已提交未推送）

## 任务目标
把参考仓 appworks（`E:\r\sparkproject` master `packages/ui/domain/metadata/src`）全部业务能力按语义整合进本仓唯一系统，直到下文“完成定义”全部满足。

按语义整合的含义：
- 先梳理参考页的业务语义（目的、输入输出、数据归属、操作、取消/异常、下游），再映射到本仓概念：数据空间=DataSet、模型=DataTable、字段=columns、请求设置=DataView、两类关系；参考页的分区、接口和数据结构不是迁移目标，语义才是。
- 同一语义在参考中重复或错误的，合并或纠正；本仓已有同语义能力的，复用而不重建；AGENTS 要求而参考没有的（命名视图、数据级联），按语义补入。
- 文件落点沿用参考相对路径（AGENTS 0.2）；布局与操作顺序服从语义，参考页作为对照，不机械照抄。
- 数据只经 SPARK data 与标准组件，页面由配置驱动。

## 诊断依据（为什么不沿用 Codex 路线）
2026-10-19 三项只读审计：
- 设计器在 spark-data 之上另建命令框架：~11 个命令类各自 8 态状态机 + JSON 基线 + 回读/未知核验，重复通用逻辑约 2.5–4k 行；`#baseline/#expected/#staged/#changes` 与 ~10 张 static-data 表复制正式数据。同功能 ~25k 行，参考 ~7k 行（3.5×）。
- 配置驱动约 30%：queryContext 注入、工作区路由、选项级联（Vue 内 addCascade）、导航树、`:field-ids` 均在代码。
- 与参考非 1:1：入口为路由而非对话框；页签（元模型/请求设置/前端模型/数据处理）被改组；保存粒度、关系编辑、列表删除不同。
结论：结构错误，不再逐缺陷打补丁；以参考页为蓝本、spark-data 为唯一数据逻辑重建，旧代码只挑可复用部分。

## 硬约束（每次迭代都检查，违反即不通过）
1. 页面/页面专用 TS 不得出现：命令状态机（idle/saving/unknown/readback…）、JSON 快照/基线比对、正式数据的私有副本、复制正式数据的 static-data 表、手传记录数组/ID 列表 props。
2. 通用能力（草稿、取消、校验、保存回执、未确认结果、预览、刷新）只在 spark-data / 标准组件；缺则先补公共能力，再写页面。
3. 视图、查询上下文、级联、字段投影声明在场景 pagedata；页面代码只触发命令。
4. 规模信号：页面层（Vue + 页面专用 TS）明显超过参考同语义实现时，须说明哪部分是本仓新增语义，否则视为重复逻辑待收敛。
5. 参考仓、Java 只读；服务不支持的能力在 UI 明确提示，不前端伪造。
6. 不建前端角色判断（AGENTS 0.3）。

## 完成定义（全部满足即“完全移入”）
- 整页验收矩阵 96 行全部五列通过（语义/合同/页面/删除/实页）。
- vue-pages 无换路径包装；`src/views` 无参考已覆盖的旧自建页；`/data-space-design` 等自建短路径删除。
- 硬约束 1 的静态检查（迭代 1 建脚本）对 `src/views/features/**`、`src/lowcode/**` 零命中。
- typecheck、lint、全量 vitest、生产构建通过；全量实页走查一次通过。

## 迭代节奏（每次迭代相同）
1. 开工：记录参考 HEAD 与对照文件哈希；读参考页及其 data/api 调用链，写语义卡（输入/输出/模型/字段/操作/取消/异常/下游）入矩阵备注。
2. 合同：场景 pagedata 声明模型绑定、命名视图、级联；需要的数据层资源适配落 `spark-lowcode-api`。
3. 公共能力缺口：补 spark-data / 标准组件（带测试、刷新 ClassModel）。
4. 页面：原路径重建，标准组件 + dataViewKey；删除被替代代码。
5. 验证：定向测试 → 迭代末影响面回归 + 构建 + 实页（隔离 T=944DEE5A…）。
6. 收尾：矩阵更新、硬约束检查、一个迭代一组提交；无新风险不重跑大回归。
- 迭代时长目标 1–2 天；一次迭代只做一组页面，不开计划外补丁轮。

## 迭代清单
| 迭代 | 内容 | 退出条件 |
| --- | --- | --- |
| I0 | 语义整合设计书：①全量语义清单——96 页按业务能力归并（同一能力跨页去重），每项写目的/输入输出/数据归属/操作/下游；②语义映射——每项落到本仓 DataSet/DataTable/columns/DataView/关系/级联/资源适配，标出复用本仓已有能力、需补公共能力、参考缺陷需纠正；③设计器专项：参考页签语义→本仓归属、入口方式、保存粒度、现有 41 类“保留/合并/删除”清单；④据此修正 I1—I13 分组（按能力而非目录） | 用户审批 |
| I1 | 公共能力：spark-data 设计类命令（预览→确认→saveChanges→回执，未知结果核验）一份通用实现；硬约束静态检查脚本；pagedata 级联/queryContext 声明能力补齐 | 公共测试通过；脚本可跑 |
| I2 | 数据空间列表页：1:1（含删除、设计对话框入口） | 矩阵 1 行通过 |
| I3 | 设计器骨架：概览/画布/节点面板/关系面板按参考布局；元模型+请求设置页签 | 实页保存/重开 |
| I4 | 设计器：前端模型、数据处理、输入参数、复制API；命名视图与级联（AGENTS 增补） | 设计器 3 行通过；旧 src/lowcode/data-space 命令类删除 |
| I5 | database-management 6（替换 DBMS.vue） | 6 行通过，DBMS 包装删 |
| I6 | structured-config 18（字典 2 已有→按新约束复核） | 18 行 |
| I7 | semi-structured 10 | 10 行 |
| I8 | application 24（替换 AppList.vue 包装） | 24 行 |
| I9 | governance 6 + integration 8（report 5、api 3 复核） | 14 行 |
| I10 | organization 10 | 10 行 |
| I11 | system 6（替换 CacheManager.vue 包装） | 6 行 |
| I12 | workflow 11 | 11 行 |
| I13 | 1010 独有 ~15 文件判定；全量回归、构建、全量实页走查；删除残余旧页与台账收档 | 完成定义满足 |

## 风险与控制
- 重建期间旧设计器仍是线上入口：I3/I4 在原路径替换，旧实现保留到 I4 退出条件满足后一次删除。
- 后端缺口（字典计算字段、逻辑来源 rowid、DISTINCT 排序）：I3/I4 中 UI 提示，记入矩阵备注，不阻塞迭代。
- 参考仓 HEAD 漂移：每迭代开工记录；漂移影响已完成页时记入下一迭代复核。
- 规模：93 页；若某迭代超时，按页拆分但不跨组混做。

## 待用户决定
- 本迭代计划是否通过（通过后先做 I0，不写代码）。
- I1 之前是否推送基线提交。

## 整页验收矩阵（参考 master 09937a5d6，96 页面级 Vue）

状态列：语义 / 合同 / 页面 / 删除 / 实页，未开始记“—”。

| 阶段 | 参考页面（features/ 下） | 本仓现状 | 语义 | 合同 | 页面 | 删除 | 实页 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | data-platform/data-set-management/design/ui/data-set-design-page.vue | 已同路径；I3 五页签+请求方案；I4 §4.3 11 类命令已删（`*-session.ts`+Handle，view-design Map 保留） | 部分 | 部分 | 部分 | 部分 | — |
| 1 | data-platform/data-set-management/ui/data-set-auth-page.vue | 缺 | — | — | — | — | — |
| 1 | data-platform/data-set-management/ui/data-set-list-page.vue | 已同路径；对话框设计入口+删除+去短路径（工作区） | 通过 | 通过 | 通过 | 通过 | — |
| 2 | data-platform/database-management/table-and-view/ui/add-table-dialog.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/database-management/table-and-view/ui/register-dialog.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/database-management/table-and-view/ui/table-and-view-page.vue | 换路径→app/DBMS.vue | — | — | — | — | — |
| 2 | data-platform/database-management/table-and-view/ui/table-design-dialog.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/database-management/table-and-view/ui/view-design-dialog.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/database-management/ui/service-management-page.vue | features 路径+DataView CRUD（2026-10-20）；连接测试/1:1/实页待 | 部分 | 部分 | 部分 | — | — |
| 2 | data-platform/semi-structured/excel-import/ui/excel-import-editor-page.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/semi-structured/excel-import/ui/excel-import-list-page.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/semi-structured/excel-import/ui/excel-import-sheet-layout-lookup-dialog.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/semi-structured/excel-import/ui/excel-import-sheet-layout-pane.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/semi-structured/excel-import/ui/excel-import-transform-rule-dialog.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/semi-structured/excel-import/ui/excel-import-transform-rules-pane.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/semi-structured/json-data/ui/json-data-page.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-rule-form.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/data-code/ui/code-class-edit-dialog.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/data-code/ui/code-class-selector-dialog.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/data-code/ui/code-init-dialog.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/data-code/ui/data-code-editor-page.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/data-code/ui/data-code-list-page.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/data-code/ui/parent-code-dialog.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/data-code/ui/sequence-selector-dialog.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/data-code/ui/time-string-dialog.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page.vue | 已同路径(待按语义验收) | — | — | — | — | — |
| 2 | data-platform/structured-config/data-dictionary/ui/dictionary-data-editor.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/data-dictionary/ui/dictionary-setting.vue | 已同路径(待按语义验收) | — | — | — | — | — |
| 2 | data-platform/structured-config/logic-view/ui/logic-view-design-page.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/logic-view/ui/logic-view-list-page.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/workflow-definition/design/ui/workflow-design-page.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/workflow-definition/ui/workflow-definition-page.vue | 缺 | — | — | — | — | — |
| 2 | data-platform/structured-config/workflow-definition/ui/workflow-trigger-table-dialog.vue | 缺 | — | — | — | — | — |
| 3 | application/application-context/ui/application-database-relations-page.vue | 缺 | — | — | — | — | — |
| 3 | application/application-context/ui/application-function-route.vue | 缺 | — | — | — | — | — |
| 3 | application/application-function-management/ui/application-function-page.vue | 缺 | — | — | — | — | — |
| 3 | application/application-manager/ui/application-database-dialog.vue | 缺 | — | — | — | — | — |
| 3 | application/application-manager/ui/application-manager-form-dialog.vue | 缺 | — | — | — | — | — |
| 3 | application/application-manager/ui/application-manager-list.vue | 缺 | — | — | — | — | — |
| 3 | application/application-manager/ui/application-manager-page.vue | 换路径→tenant/AppList.vue | — | — | — | — | — |
| 3 | application/application-manager/ui/application-relation-dialogs.vue | 缺 | — | — | — | — | — |
| 3 | application/data-menu/ui/data-menu-dialog.vue | 缺 | — | — | — | — | — |
| 3 | application/data-menu/ui/data-menu-list.vue | 缺 | — | — | — | — | — |
| 3 | application/data-menu/ui/data-menu-page.vue | 缺 | — | — | — | — | — |
| 3 | application/enterprise-app-auth-application/ui/apply-app-auth-content.vue | 缺 | — | — | — | — | — |
| 3 | application/enterprise-app-auth-application/ui/apply-app-auth-page.vue | 缺 | — | — | — | — | — |
| 3 | application/enterprise-app-auth-application/ui/enterprise-app-auth-application-audit-dialog.vue | 缺 | — | — | — | — | — |
| 3 | application/enterprise-app-auth-application/ui/enterprise-app-auth-application-list.vue | 缺 | — | — | — | — | — |
| 3 | application/enterprise-app-auth-application/ui/enterprise-app-auth-application-page.vue | 缺 | — | — | — | — | — |
| 3 | application/enterprise-app-auth-application/ui/my-app-auth-request-list.vue | 缺 | — | — | — | — | — |
| 3 | application/enterprise-app-auth-application/ui/my-app-auth-request-page.vue | 缺 | — | — | — | — | — |
| 3 | application/enterprise-regist-manager/ui/enterprise-app-auth-dialog.vue | 缺 | — | — | — | — | — |
| 3 | application/enterprise-regist-manager/ui/enterprise-audit-dialog.vue | 缺 | — | — | — | — | — |
| 3 | application/enterprise-regist-manager/ui/enterprise-config-dialog.vue | 缺 | — | — | — | — | — |
| 3 | application/enterprise-regist-manager/ui/enterprise-password-dialog.vue | 缺 | — | — | — | — | — |
| 3 | application/enterprise-regist-manager/ui/enterprise-regist-manager-list.vue | 缺 | — | — | — | — | — |
| 3 | application/enterprise-regist-manager/ui/enterprise-regist-manager-page.vue | 缺 | — | — | — | — | — |
| 3 | governance/desensitization-rule/ui/desensitization-rule-page.vue | 缺 | — | — | — | — | — |
| 3 | governance/navigation-permission/ui/navigation-permission-page.vue | 缺 | — | — | — | — | — |
| 3 | governance/role-management/ui/role-auth-page.vue | 缺 | — | — | — | — | — |
| 3 | governance/role-management/ui/role-management-page.vue | 缺 | — | — | — | — | — |
| 3 | governance/role-management/ui/role-user-page.vue | 缺 | — | — | — | — | — |
| 3 | governance/user-app-authorization/ui/user-app-authorization-page.vue | 缺 | — | — | — | — | — |
| 3 | integration/api-management/ui/api-config-page.vue | 已同路径(待按语义验收) | — | — | — | — | — |
| 3 | integration/api-management/ui/api-interface-list-page.vue | 已同路径(待按语义验收) | — | — | — | — | — |
| 3 | integration/api-management/ui/api-management-page.vue | 已同路径(待按语义验收) | — | — | — | — | — |
| 3 | integration/report/ui/report-form-dialog.vue | 缺 | — | — | — | — | — |
| 3 | integration/report/ui/report-management-list.vue | 缺 | — | — | — | — | — |
| 3 | integration/report/ui/report-management-page.vue | 缺 | — | — | — | — | — |
| 3 | integration/report/ui/report-model-dialog.vue | 缺 | — | — | — | — | — |
| 3 | integration/report/ui/report-version-dialog.vue | 缺 | — | — | — | — | — |
| 4 | organization/job-management/ui/job-management-page.vue | 缺 | — | — | — | — | — |
| 4 | organization/leave-management/ui/leave-form-aside.vue | 缺 | — | — | — | — | — |
| 4 | organization/leave-management/ui/leave-form-page.vue | 缺 | — | — | — | — | — |
| 4 | organization/leave-management/ui/leave-management-page.vue | 缺 | — | — | — | — | — |
| 4 | organization/organization-structure/ui/organization-structure-page.vue | 缺 | — | — | — | — | — |
| 4 | organization/user-management/ui/user-form-dialog.vue | 缺 | — | — | — | — | — |
| 4 | organization/user-management/ui/user-management-list.vue | 缺 | — | — | — | — | — |
| 4 | organization/user-management/ui/user-management-page.vue | 缺 | — | — | — | — | — |
| 4 | organization/user-management/ui/user-permission-dialog.vue | 缺 | — | — | — | — | — |
| 4 | system/bug-manage/ui/bug-manage-page.vue | 缺 | — | — | — | — | — |
| 4 | system/cache-management/ui/cache-management-page.vue | 换路径→tenant/CacheManager.vue | — | — | — | — | — |
| 4 | system/data-recovery/ui/data-recovery-page.vue | 缺 | — | — | — | — | — |
| 4 | system/flow-monitor/ui/flow-monitor-page.vue | 缺 | — | — | — | — | — |
| 4 | system/login/ui/login-page.vue | 缺 | — | — | — | — | — |
| 4 | workflow/flow-append-user/ui/flow-append-user.vue | 缺 | — | — | — | — | — |
| 4 | workflow/flow-model/design/ui/flow-design-page.vue | 缺 | — | — | — | — | — |
| 4 | workflow/flow-model/ui/flow-model-list-page.vue | 缺 | — | — | — | — | — |
| 4 | workflow/flow-runtime/bus-detail/ui/bus-flow-detail-page.vue | 缺 | — | — | — | — | — |
| 4 | workflow/flow-runtime/detail/ui/flow-run-detail-page.vue | 缺 | — | — | — | — | — |
| 4 | workflow/flow-runtime/run-page/ui/flow-run-page.vue | 缺 | — | — | — | — | — |
| 4 | workflow/flow-runtime/run-page/ui/flow-run-page-mobile.vue | 缺 | — | — | — | — | — |
| 4 | workflow/flow-workbench/ui/flow-workbench-todo-mobile.vue | 缺 | — | — | — | — | — |
| 4 | workflow/flow-workbench/ui/flow-workbench-todo-panel.vue | 缺 | — | — | — | — | — |

## 迭代记录

### I1 公共能力（2026-10-19，完成）
- P8：`tools/verify-page-thin.mjs` + 基线 `tools/page-thin-baseline.json`（34 文件：command-status 82、static-copy 23、json-baseline 17、hand-passed-ids 5），接入 `verify:rules`；只许收紧。
- P2：`queryContext.<键名>` 单键级联目标（`query-cascade-inputs.ts`、`types.ts`），保留其他键，撤销删键，禁止与整体 queryContext 混用。
- P1：`DataSet.saveChangesInPhases`（`dataset.ts`）有序分阶段提交，失败/未确认即停，重试从首个未完成阶段继续，不重放；不提供事务。
- P3：现有 viewCascades 字段级联即可承接，无新代码；I3 迁移 Vue 内 addCascade 时落地。P7：随 I3 首个消费者实现，不预建。
- 验证：typecheck、改动文件 lint；spark-data 42 文件 938 项；数据空间运行链与 lowcode-api 31 文件 1292 项；ClassModel 正式生成。
