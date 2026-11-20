# SPARKProject 技能转换为 AppWorks AI 工作流方案

> 状态：治理控制平面草案。本文保留技能路由、结构化交接、验证和 Delivery 的目标设计，不把草案能力当作现行产品。领域事实以 [模型层级](../packages/spark-project-model/src/MODEL-HIERARCHY.md) 与当前源码为准。

## 现行接线

本仓 .cursor/skills 是 Markdown 工作方法；其存在不证明有可执行 registry、授权 validator 或恢复账本。技能登记见 [DOCUMENT-GOVERNANCE.dm](DOCUMENT-GOVERNANCE.dm)。浏览器 AiAgentHost、Tool Loop、ClassModel、workflow binding 和 Agent Run provider 构成执行基础。

pageDesign 使用 ProjectWorkspace 根，经 project.openPageDesign(pageId) 编辑 PageTool 的 rule.json/script.js/style.css。场景定义通过loadScenarioDefinitions({scenarioId:T})取得宿主正式装配的元数据DataSet C，同一工作区与请求代次复用同一实例；按需查询定义DataView后编辑、取消，交付仅提交T的已修改定义视图。ScenarioDefinitionResource内部执行文件比较、写入和回读，pagedata.json位于SysForm/<scenarioId>，不是工具文件。AI操作门面始终拒绝原文件owner入口。此链已接线并有离线回执测试，实际服务验收仍未完成；DevSystem文本编辑、撤销、历史恢复与预览同样从该DataSet消费，原文差异由ScenarioDefinitionDocument写回定义视图；验收边界见唯一台账I6。

当前 PageDesignAllowedOperations 为 nodeTree/dataSet/script/style/blueprint。dataSet 域表示明确场景的视图配置，不是页面本地业务数据集。requestId 持独立 run/editor/Host；gate、完成与释放按该身份工作。

现行 Agent Run Delivery 固定 auto/shouldSave=true，deliverySaveFileNames 只接受工具三文件，省略时选择 dirty 工具文件；dataSet-only 时不保存工具文件。明确 scenarioId 且允许数据域时，另保存 dirty 场景配置。保存用 Promise.allSettled 分项报告，rollback 保留 dirty 并返回 skipped，不自动覆盖远端。

工具与场景底层保存有自己的比较/读回合同；这不等于已经实现本文提出的独立授权摘要 validator、交付恢复账本或事务。ProjectPlanning 默认 saveBlueprintAfterRun=false，显式 true 且 blueprintDirty 时保存蓝图。

## 保留的转换原则

1. 入口互斥：项目策划、页面/场景设计、普通代码、诊断、验证、审查与交付各有 owner。
2. 结构化交接：传可校验制品与事实证据，不传完整聊天记录。
3. 计划批准与远端写入授权区分，且尊重用户当前会话的明确授权。
4. 工具三文件由PageTool管理；数据空间定义通过正式元数据DataView进入编辑态，DataSet提交捕获的变更。Delivery编排各对象结果，不另造文件或数据写入器。
5. 验证证明验收范围，审查报告可行动缺陷；两者不互相替代。

QYAPI 资源模型、Ed25519 信任链、平台 provision journal 不直接复制为 AppWorks 产品合同。若将来增加高风险平台写入，再单独论证这些机制。

## 源技能与目标角色

| 源角色 | AppWorks 目标 | 保留与限制 |
|---|---|---|
| create-project | plan-project | 需求主导 ProjectBlueprint 规划，产页面目录与验收 |
| migrate-project | migrate | 外部源行为主导，先形成不可变 S0/T0 基线 |
| diff-migrate-project | reconcile-migration | S0/S1/T0/T1 四方差异，保护目标定制 |
| develop-change | develop-change | 根 AGENTS.md 七阶段，冻结架构内本地变更 |
| design-navigation | plan-project 导航阶段 | 正式 nodeId/kind/capability/navigation，区分节点、工具与场景 |
| design-data-resources | design-page 数据阶段 | 正式模型与消费者需求，不虚构后端API |
| design-scenario-data-space | design-page 场景阶段 | 真实 scenarioId、modelId/模型Name、视图绑定矩阵 |
| build-page | build-page | 工具三文件与显式场景文件分别编辑 |
| build-capability | develop-change | 既有包 owner、依赖、公共面与消费者闭环 |
| debug-problem | debug-problem | 默认只读，复现、可证伪假设、根因与最小修复单 |
| verify-change | verify-change | 按影响图选检查，五态归因，不冒充全量完成 |
| review-change | review-change | findings-first，只读，不批准计划或自动修复 |
| provision-project | deliver-change | 精确范围落盘与读回，不自动获得业务副作用权限 |

## 顶层路由

优先处理用户明确只读请求；外部源行为与可信四方基线决定 migrate/reconcile。新增或改变项目/页面产品语义先 plan-project；已存在工具或场景配置变更走 design-page/build-page；冻结合同内代码变更走 develop-change；已有 dirty 内容的落盘走 deliver-change。

不能唯一判定时列出决定性缺失事实，不任选最接近角色。路由输出至少包含 taskKind/owner/evidenceMode/writeBoundary/requiredArtifacts/refusedAlternatives/unknowns。nextActions 是建议，不是授权。

## 生命周期与制品

```text
routed -> researching -> research confirmation -> questioning
 -> planned -> approved -> implementing(one closed loop)
 -> verifying -> reviewed -> delivery authorization -> delivering
 -> knowledge pending -> completed
```

当前闭环失败回 implementation；方案或事实失效回研究/计划；保存未知进入只读 readback recovery。根 AGENTS.md 是普通代码变更工作方法，产品运行时不复制这套状态机。

| 制品 | 必须内容 |
|---|---|
| research-dossier | 当前源码证据、调用链、影响面、未知项 |
| development-plan | 目标、精确范围、最小闭环、验证、风险 |
| approval-record | 计划/范围摘要与用户批准引用 |
| page-design-blueprint | 节点nodeId、工具pageId、场景scenarioId、状态、组件与绑定矩阵 |
| implementation-dossier | 变化owner、内容摘要、tool结果、最小验证、偏差 |
| verification-report | 检查范围、命令、状态、证据、基线归因与未验证项 |
| delivery-authorization | 项目、工具/场景/蓝图身份、允许动作、对象集合与摘要 |
| delivery-report | saved/skipped/not-dirty/failed/unknown、实际读回、剩余dirty |

通用 envelope 可包含 kind/schemaVersion/artifactId/producer/workspace revision/scopeDigest/payload。摘要只检测漂移，不自动授权。

## 页面设计面

页面合同规定业务目的、输入输出、状态、数据权限、异常与验收；前端不建立角色模型。rule.json 按 ClassModel 描述组件树/动作；场景 pagedata.json 按[数据空间主合同](architecture/DATAFLOW_ARCHITECTURE.md)声明模型绑定与视图；script.js 承载必要业务编排；style.css 管视觉。

运行数据由正式 readModel/readRelations 与场景配置装配；每次 PageRuntime 持多个独立 DataSet。新页面绑定为 scenarioId@modelName@viewId，正式模型取 modelBinding.modelName，本地模型取自身 tableName，局部键要求明确主场景；已有带#的三段键仅保留读取兼容。组件成员读取使用 dataViewKey/dataMember/dataField，不靠全局页面状态。

查询和保存沿当前 spark-data DataSet/DataView 及 FileResource 适配器；业务行/source不能伪造权限。目标身份、field access、editing overlay、unknown attempt 与视图生命周期由正式 DataView/宿主 scope 合同约束。场景与工作文件是不同持久化来源，不承诺跨来源事务；设计文件交付不包含业务审批、支付或通知。

## 操作域与保存范围

| 变化 | 操作域 | 编辑归属 | 提交合同 |
|---|---|---|---|
| 组件树 | nodeTree | PageTool.rule → bound ProjectToolFile DataView | DataSet.saveChanges(dirty view) |
| 脚本 | script | PageTool.script → bound ProjectToolFile DataView | DataSet.saveChanges(dirty view) |
| 样式 | style | PageTool.style → bound ProjectToolFile DataView | DataSet.saveChanges(dirty view) |
| 场景视图 | dataSet + 明确scenarioId | loadScenarioDefinitions返回正式C的定义DataView，查询输入为T | DataSet.saveChanges只提交目标定义变更；ScenarioViewFile在资源适配内部保存 |
| 项目蓝图 | blueprint | ProjectBlueprint | 蓝图保存 |

同一闭环可跨工具与场景，但身份、dirty基线与结果必须分别记录。DevSystem 的 PageTool 编辑同步写入唯一 DataView overlay；Save All 通过 DataSet.saveChanges 提交已修改视图，unknown attempt 在原视图核验而不重放。pagedata.json 属于场景定义文件；场景身份不能由 pageId 推断。操作允许修改不表示授权保存，目标授权制品需分别表达工具、场景和蓝图动作。

## 门禁与执行基础

保持现有 Definition validation、输入制品 validation、beforeFunctionCall gate 三层区分。工具闭集与ClassModel从真实声明按需加载，不在prompt复制整份API清单。

模型根与可执行模块应对应实际公开 ProjectWorkspace；pageDesign editor按requestId解析，projectPlanning读取ProjectBlueprint投影。executableRef、rootClassName、editorSource须与实际binding一致。

完成由agent_complete调用领域校验，不由LLM自由声明；工具失败理由进入nudge修复。未知工具/参数fail-fast，缺能力或未放行域不得静默兼容。

## 摘要与漂移

researchDigest绑定源码事实；planDigest绑定目标、范围和验证；scopeDigest绑定project/node/tool/scenario身份与operation；dirtyDigest绑定当前内容；verificationDigest绑定检查证据；readbackDigest绑定重新读取结果。

目标canonical规则：对象键排序，语义有序数组保持顺序；路径统一；区别缺失/null/空集合；时间戳不参与授权语义。一个owner实现摘要，模板不复制算法。

目标或验收、对象集合、公共API、依赖、操作域、验证策略或真实内容发生语义变化时，旧批准/交付摘要失效。只改变证据引用时重新生成证据并复验，不能把摘要相等当后端CAS。

## 目标 Delivery 与恢复

目标算法先验证授权与passed报告，再读真实dirty投影并比对目标摘要；只保存已授权且仍dirty对象，读回后分类。未知调用结果先只读比较，不整批重放。

部分保存保留成功项，不自动用旧内容覆盖。工具工作文件和场景配置各有真实保存路径；场景没有后端CAS，原文比较不能承诺原子并发保护。远端写入后失败不等于回滚。

未来恢复账本可记录runId/workflowId/scopeDigest/attempt/toolCalls/deliveryItems/readback；它属于治理目标，不是现行平台journal。

## 验证与审查

| 影响面 | 验证 |
|---|---|
| 工具三文件 | page-design gate、focused绑定/脚本测试，实际调用预览 |
| 场景视图 | ScenarioViewConfig、正式装配、级联、保存冲突与读回 |
| projectPlanning/蓝图 | project-planning gate、正式节点/导航/API读回 |
| AI公共合同 | 包typecheck/lint、binding/provider消费者、ClassModel |
| 跨包运行调用 | 页面多实例、关闭失效、组件/数据与宿主测试 |
| 文档 | docs门禁、旧合同扫描、本地链接检查 |

检查状态为passed/failed/not-run/pre-existing-failure/introduced-failure。没有可比较同范围基线只能标failed；任一必须检查未运行，整体不得passed。审查优先业务正确性、权限副作用、数据流、owner旁路、导出与回归，不用风格偏好填finding。

## 分阶段目标与目录

W1互斥路由 -> W2计划/批准摘要 -> W3页面与场景蓝图 -> W4既有gate接入 -> W5验证报告 -> W6交付授权 -> W7按对象语义提交/读回（数据空间经SPARK data） -> W8蓝图交付 -> W9闭集治理工具 -> W10中断恢复E2E。

逻辑目标目录可分contracts/lifecycle/page/scenario/quality/delivery、governance、routing、tools；这不是已批准新增文件清单。治理工具可为workflow_query/guide/validate/status/invoke；validate不隐式执行，invoke不自动获得Delivery权。

完成度区分L0映射、L1可判定、L2Schema/validator、L3真实激活、L4逐项恢复、L5重放审计。本文不能因有流程图便声称L2–L5已落地。

## 必要负向测试

- 无法唯一路由时needs-human-input；只读请求零写入。
- 无批准/摘要漂移/操作域越界拒绝；requestId、pageId或scenarioId漂移拒绝。
- dataSet-only不得修改工具；场景dirty不进入deliverySaveFileNames。
- 授权后内容变化零保存；未授权对象保留并标skipped。
- 保存抛错但远端可能已写时readback分类，不假回滚。
- 第一个对象成功第二个失败分别报告；partial验证报告不能产生整体passed。
- 共用工具两运行实例数据、Render、CSS与timer隔离，关闭旧实例失效。

## 端到端场景示例

当前仓内闭环：DevSystem 的 pageDesign inline runner 将 AI 对工具文件的每次编辑直接写入绑定的 ProjectToolFile DataView；Save All 只提交捕获目标且内容未在途变化的文件行，并消费 FileResource 精确回读/unknown attempt。场景定义仍由独立定义 DataView 保存，二者不是跨来源事务。该实现已有仓内 DataView/存储夹具回归；实际 SPA 登录后的在线 smoke 尚需单独记录，不能用仓内回归冒充现场验收。

projectPlanning从需求和当前ProjectBlueprint投影形成目录，默认只标blueprintDirty；saveBlueprintAfterRun显式true时沿现有editor保存。工具与场景实施仍需分别设计，策划完成不代表页面已实现。

## 当前源码入口

- [PageDesign inline runner](../src/services/page-design/page-design-ai-runner.ts)
- [PageDesign inline delivery](../src/services/page-design/page-design-inline-delivery.ts)
- [页面操作域](../src/services/page-design/page-design-gates.ts)
- [ProjectPlanning inline runner](../src/services/project-planning/project-planning-ai-runner.ts)
- [ProjectPlanning inline delivery](../src/services/project-planning/project-planning-inline-delivery.ts)
- [数据流](architecture/DATAFLOW_ARCHITECTURE.md)
- [项目认知](SPARK_APPWORKS_PROJECT_DEEP_DIVE_ZH.md)
- [AI runtime](../packages/spark-ai/README.md)

治理控制平面的独立授权、registry、摘要validator、自动恢复与证据保留策略仍需正式决策；不能据本文草案修改现行保存行为。
