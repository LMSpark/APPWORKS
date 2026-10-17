# 数据空间全链路重梳（2026-10-17）

> 锚点：产品合同 [DATAFLOW_ARCHITECTURE.md](../docs/architecture/DATAFLOW_ARCHITECTURE.md) 2.5.312 第 0 章；执行台账 [plan-data-space-metadata-dataset.md](plan-data-space-metadata-dataset.md)。  
> 分支：`10-17`；工作树约 765 条 git 状态、263 个 src/packages/tests/config 文件有 diff；`pnpm run typecheck` 通过。

## 1. 为什么 Codex 看起来「搞不定」

根因不是「链路没人懂」，而是 **执行模型把自己锁死了**：

| 现象 | 实际含义 |
| --- | --- |
| 台账标 `blocked`，I7 连续多轮 `update_goal blocked` | 把 **B01—B25 全部在线验收** 当成唯一前进条件，缺一条就停整仓 |
| L =「浏览器准入未解除」 | 绑定的是 **旧 ChatGPT Browser/CUA**（2026-10-13 连接拒绝 → data: 错误页 → 协议拒绝），**不是** SPARK 业务失败 |
| 11374 个 `notes/evidence/data-space-config-storage/*` | 离线 vitest/夹具证据膨胀；**不能累计成整页完成**，却占满上下文与判断 |
| I1—I6 标「离线通过」、I7 永远 open | **离线绿 ≠ Bxx 解除**；Codex 在「继续写代码」与「等 L/S」之间空转 |
| HEAD `f3a361e51` vs 巨大 dirty tree | **没有可交付的 git 基线**；谁也无法说「当前跑的是哪一版实现」 |

**本轮复核（Cursor IDE Browser）**：`http://localhost:5273/` 与 `/data-space-design?scenarioId=…` 可打开（5273 在监听）。  
=> **「L 全局阻塞」对当前 Cursor 环境不成立**；应改为：**未登录 / 未拿正式 C 与隔离 T 做 B01—B02**，这是可执行的验收任务，不是工具死刑。

---

## 2. 正确链路（以源码 + 合同 0.5 为准）

### 2.1 身份（必记）

- **A**：设计器系统页（`data-set-design-page.vue`）
- **C**：元数据空间 `DATA_SPACE_DESIGN_FORM_KEY`（`8D1AB14D…`），`DataSet.scenarioId === C`
- **T**：URL 唯一 `scenarioId`，写入 C 各视图的 `queryContext.dataSpaceId`
- **绑定键**：`T@模型注册名 Name@视图名`（不是 MetaName、不是 pagedata 表键 K）

### 2.2 设计器进入顺序

```text
URL(T) → openLowcodeDataSpaceDesignSession(T)
  → scenarioViews.readText(C) → loadScenarioDataSet(C)   // 正式 C pagedata，非仓内引导 JSON
  → inject dataSpaceId=T → LowcodeDataSpaceMetadata.load(['Base_DataSet','Base_DataModel'])  // 首屏仅两表
  → 读 T 的 pagedata + 文件定义 DataView（C 上 resourceType=file 的表）
  → PageRuntime 装载同一 metadataDataSet
  → deferDefinition: 画布/引用再 loadDefinition() → assemble(T)
```

源码：`lowcode-data-space-runtime.ts`、`lowcode-data-space-metadata.ts`、`lowcode-data-space-design.ts`、`lowcode-data-space-view-design.ts`。

### 2.3 两条持久化（不可合并）

| 内容 | 路径 | 消费方 |
| --- | --- | --- |
| 空间/模型/字段/来源入参等 | `metadataDataSet.saveChanges` → GetData 批量写 DB | 正式模型、columns、来源映射 |
| 命名视图、原生关系、级联、layout | C/T 上 **file 资源 DataView** → `ScenarioDefinitionResource` / 工作区 `saveScenarioViews` | 装配 T、`loadLowcodeRuntimeScenario` |

**L3 部分闭合事实**：`LowcodeDataSpaceDefinitionDraft` 不再 `addTable` 造定义主表，而是 `getTable(tableName)` 且要求 `resourceType === 'file'`（见 `lowcode-data-space-definition-draft.ts:27-30`）。  
临时候选/命令缓冲仍会用 `addTable`（如 `FieldCreate_*`、`ArrayCreate_*`），这是 **运行态 static-data**，不是第二套持久化。

### 2.4 业务页消费 T

```text
PageRuntime.load → loadLowcodeRuntimeScenario(T)
  → readText(T pagedata) + readModelBatch(绑定模型) + [旧格式才 readRelations]
  → LowcodeDataSpaceAssembler → DataSet(T)
  → 组件 dataViewKey → DataView.requestData → /api/DataOperation/GetData
  → 编辑 → saveChanges → BatchTableOperateRequestByCRUD
```

---

## 3. 卡点分级（真实阻塞 vs 可并行）

### P0 — 治理与基线（不修则任何 AI 都会再失败）

1. **工作树不可验收**：263 文件 diff + 186 untracked；必须先定「E62 以哪份 tree 为准」（提交/打 tag/或单独 worktree）。
2. **台账循环**：B01—B25 × L/S × blocked 三轮 → 禁止写代码也禁止关项；需 **缩成一条 live pilot**（见 §5）。
3. **证据通胀**：新验收只留「请求/回执/重开」最小 JSON；旧 evidence 只当历史，不作实施指令。

### P1 — 从未真正做过的「脊柱验收」（Codex 卡在这里，但你能做）

对应台账 B01—B03，合同 0.7 第 2 项只是其中之一，不是缩小范围：

| 编号 | 缺什么 | 怎么解除 |
| --- | --- | --- |
| B01 | 远程 **正式 C** 内容、首屏是否只查空间/模型 | 登录 dev → 打开设计器 → DevTools/代理看 GetData 范围；对照 `config/pages/data-platform/data-space-design/pagedata.json` 是否已上传为正式 C |
| B02 | 参数 save/reopen 的 **远端** 回读 | 隔离 T 上改 inputParams → saveChanges → 新会话读回 |
| B03 | 表来源 → 模型 → **业务 CRUD** | 选一个测试表；命名视图查询 + 单行提交；核 Batch 回执 |

**工具**：Cursor Browser + 本机 `pnpm dev`（5273）+ 远程 `https://spark.lingmacn.com`（Vite `/api` 代理）。  
**账号**：沿用项目约定的 NewApp admin（凭据在 DPAPI，见 `notes/validation-sparkproject-appworks-integration.md`），不写入仓库。

### P2 — 产品能力缺口（大量离线测试已通过，但 B/S 未证）

| 合同断点 | 业务影响 | 方向（不是猜协议） |
| --- | --- | --- |
| **B11—B12** Navigation/Hierarchy/Join+ChildTables | 主从一次输出、子表权限 | 见 **§10.1**：Join 仅发 `ChildTables:[]`；ingest 只 `rows/total`+冻结嵌套字段，**无子 DataView/权限**。先 **S** 再改 `buildRequest` / `applyResult` / `ingestQueryResult` |
| **B18—B22** 聚合 | 列表脚汇总、选择汇总、子表汇总 | 见 **§10.2**：正式页 `view.aggregates` 为 diagnostic；后端汇总走 **field `ValueFun` → GetGroupData → statistics 视图 `rows[0]`**，不是 `aggregateResult` 成员。先 **S** 再迁 UI 汇总位 |
| **B23** 参考 1:1 | 整页交付 | 八区矩阵（台账 §参考页）需 **同视口** 截图对比；离线 DOM 测试不算 |
| **B24** T=C 自描述 | 设计器吃自己存的 C | 在可恢复环境改 C → 冷启动设计器 → 证明读正式 C 而非旧实例/打包 |
| **L6** 功能明细 | 删模型 | 参考有 function 清理；本仓 **未接**；单独业务用例，不阻塞 B01 脊柱 |
| **页面** 未配置节点 | 1.2/2/3 页签 disabled | 参考语义未闭合；与来源新增并行 |

### P3 — 技术债（离线已大幅收敛，仍影响体验/性能）

- **L1 部分**：ModelCreate/SourceEdit/Rename/Remove/FieldRemove 等命令 **前置** 要求 Field/Relation `default` 全量 Loaded（`model-source-edit.ts:172-173`、`model-create.ts:90-93` 等）；工作区打开前仍 `loadMetadataViews([Field, Relation])`（`data-set-design-page.vue:615-616`）。
- **L2 部分**：DB `saveChanges` 后多为 `invalidate()`，**不**自动 `loadDefinition`；例外：`ScenarioDefinitionResource.validate` 仍会 `assemble`（`view-design.ts:2420-2429`）；`refresh` 未 `deferDefinition` 时走 `loadDefinition`（`2123-2151`）。
- **L8**：命名视图预览、字段候选仍依赖 T 投影范围。
- **L9**：`data-space-page.fixture` 默认预载四表 default → **假绿**；应用 `overviewOnly` 或拆夹具。
- **绑定卫生**（见 §9 编码锚点）：`:field-ids`、`navigationView.replaceRows`、`DataSpaceDesignApi` 平行读参。

---

## 4. 与 10-12 梳理的差异（避免用旧认知指挥现在）

| 10-12 说法 | 2026-10-17 事实 |
| --- | --- |
| saveViews 必全量 assemble T | 多数路径 **deferDefinition + invalidate**；试装配在 stage/preview |
| L3 全靠 addTable 造定义表 | 主定义表 **必须 C 的 file 视图**；addTable 仅 ephemeral |
| 停止一切编码 | 台账已 I0—I6 大量离线实施；问题是 **未 live 核销 + 基线混乱** |
| 合同 2.5.136 | **2.5.312**，0.6 断点表已重写（L1/L2/L3 标「部分修复/部分闭合」） |

---

## 5. 推荐解决方案（可执行，按顺序）

### 阶段 0：半天 — 恢复「人能推进」

1. 定基线：用户决定 **commit / stash / 新分支** 当前 263 文件（AI 不能替你做 git 政策）。
2. 新台账顶栏只保留 **Live Pilot 5 步**（下表），B01—B25 降为附录核对单。
3. 用 Cursor Browser 完成 **登录 + 进入设计器**（不再使用 CUA 作为门禁）。

### 阶段 1：1—2 天 — Live Pilot（脊柱）

| 步 | 动作 | 通过标准 |
| --- | --- | --- |
| 1 | B01 首屏 | Network：仅 C 的空间+模型 default（字段/关系 default 未请求或 Idle） |
| 2 | B02 参数 | 改/取消/保存/新会话；DB 回读一致 |
| 3 | B03 表来源 | 选表→字段→保存模型→建 default 视图→查询→单行 CRUD |
| 4 | 文件域 | 改视图 filter → file DataView 提交 → 重开 T 装配生效 |
| 5 | 记录 | 每步 1 个 evidence JSON（URL、scenarioId、请求体摘要、回执、重开 hash） |

未通过则 **只修责任层**（owner/夹具/配置），不新开 I8。

### 阶段 2：按资源扩（I3 矩阵，各需 L+部分 S）

字典 / 接口 / JSON / 逻辑视图 / 库视图 **各做一条纵向**，不要六路并行改代码。

### 阶段 3：后端合同缺口（必须先 S 后码）

1. 抓 **Navigation 或 Hierarchy** 最小响应 → 写 1 页「子表挂载约定」→ 改 query ingest。  
2. 抓 **Group/COUNT** 最小响应 → 接 `queryConfig`/ValueFun → DataView 汇总成员。  
3. **禁止**：用 `$sum`、拉全页明细、改共享 ValueFun 冒充后端。

### 阶段 4：1:1 + T=C（B23/B24）

在阶段 1—2 稳定后进行；否则只是在坏基线上调 UI。

---

## 6. 你现在可以立刻做的三件事

1. **确认 git 基线策略**（提交当前 E62 实现 vs 回退到 `f3a361e51` 再 cherry-pick）。  
2. **登录 localhost:5273**，打开设计器 URL，看 Network 是否满足 B01。  
3. **指定第一个 Live Pilot 用的隔离 T**（测试空间 ID），避免动生产空间。

---

## 7. 源码入口（查链时用）

| 主题 | 路径 |
| --- | --- |
| 元数据加载 | `src/lowcode/data-space/lowcode-data-space-runtime.ts` |
| 首屏范围 | `src/lowcode/data-space/lowcode-data-space-metadata.ts` |
| 设计会话 | `src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts` |
| 定义草稿 | `src/lowcode/data-space/view-design/lowcode-data-space-definition-draft.ts` |
| 业务装配 | `src/lowcode/data-space/lowcode-data-space-assembler.ts` |
| 查询/保存 | `packages/spark-lowcode-api/.../data-space-runtime-api.ts` |
| 聚合停算 | `packages/spark-data/src/data-view.ts`, `computed-column-delegate.ts` |
| 设计页 UI | `src/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue` |

---

## 8. 结论一句话

**链路在文档和源码里已经梳清且大量离线闭环；Codex 卡在「用错误工具门禁 + 25 组在线项同时开 + 无 git 基线」。**  
下一步不是再写一版总计划，而是 **Live Pilot 五步 + 真实登录与隔离 T**，再按 B11—B22 用 **服务端样本** 补嵌套与聚合。

---

## 9. 只读源码审计（2026-10-17）

来源：[explore 数据空间设计链审计](7a8c3616-2538-4cb8-8d59-c7c729ace4f7)（只读，未改生产代码）。

### 9.1 已对齐合同（OK）

| 项 | 锚点 |
| --- | --- |
| C 的 pagedata | `lowcode-data-space-runtime.ts:147-152` → `scenarioViews.readText(DATA_SPACE_DESIGN_FORM_KEY)` |
| 首屏两表 | `lowcode-data-space-runtime.ts:165`；`openLowcodeDataSpaceDesignSession` + `deferDefinition:true` |
| 四文件工具页 | `rule/script/style` 已删；导航指向 `data-set-design-page.vue`（`vue-pages.json:181-186`） |
| 定义主表 | `definition-draft.ts` 要求 `getTable` + `resourceType === 'file'` |

### 9.2 仍登记为 GAP（与 P1/P3 对应）

| 域 | 事实摘要 |
| --- | --- |
| 保存后刷新 | 元数据保存 → `invalidate` 为主；文件 owner 变更 → `invalidate({preserveModelInputs:true})`；非「每次 save 全量 assemble T」 |
| 命令前置全目录 | SourceEdit / ModelCreate / Rename / Remove / FieldRemove 等要求三表 `default` 全量 |
| Vue 手传 | `data-set-design-page.vue:175,207,216,258` + `modelFieldIds`（`977-983`）；导航 `573-584` `replaceRows` |
| 装配旁路 | `lowcode-data-space-runtime.ts:41-68` `readRelations` / `readSpaceDefinition` / `readModelBatch`；T 消费仍非纯 DataView 查询链 |
| 写路径分裂 | DB → `saveChanges`；场景文件 → `ScenarioDefinitionResource.save`（`view-design.ts:2366-2368`），符合合同两条线，但读侧旁路需长期收敛或书面登记 |
| 页面平行 API | `DataSpaceParametersEditor.vue:13-16`、`data-space-workbench.ts`、`data-set-design-page.vue:298,1182` 仍用 `DataSpaceDesignApi` |

### 9.3 Live Pilot 之后优先编码的 5 锚点（勿在 B01 前铺开）

1. `data-set-design-page.vue:977-983` + `:field-ids` → 命名视图 + `dataViewKey`
2. `model-source-edit.ts:118-122` + `:172-173` → 来源替换收窄 scoped 视图，去掉三表 default 完整性门禁
3. `data-set-design-page.vue:573-584` → 导航树走 DataView 查询/树配置
4. `lowcode-data-space-runtime.ts:65-68` → T 装配与元数据 DataSet 查询收敛（或合同登记为装配只读端口）
5. `DataSpaceParametersEditor.vue:13-16` → 绑定 `Base_DataSet`/`default` 字段

### 9.4 工作区噪声（治理）

未跟踪文件约 **5433**（`notes` ~5057、`generated` ~135）；与链路正确性无关，但会拖慢 AI 检索——Live Pilot 证据勿再 bulk 写入 `notes/evidence`。

### 9.5 待同步文档（未执行）

`DATAFLOW_ARCHITECTURE.md` §4 / §4.2 仍可能写「引导 pagedata、四表首屏、会话双等」——与 §9.1 及 ch.0 **冲突**；改文档不等同于关 B01。

---

## 10. 嵌套 GetData 与聚合链（只读，2026-10-17）

来源：[explore 嵌套与聚合运行时审计](40378259-1917-4668-a959-74131ca3ebd4)。与合同 [DATAFLOW_ARCHITECTURE.md](../docs/architecture/DATAFLOW_ARCHITECTURE.md) **§0.6 / ~823** 一致：后端主从组装已有，**本仓消费未完成**。

### 10.1 B11—B12：Navigation / HierarchyData / Join

| 层 | 现状 | 应改锚点 |
| --- | --- | --- |
| 请求 | `OutputType` 透传；**Join 固定 `ChildTables: []`**（不从模型关系推导） | `data-space-query-table.ts:164-175` |
| 响应 | `structuredClone` + `freezeNested`；嵌套数组留在父行字段 | `data-space-query-table.ts:68-86,139-148` |
| 权限 | 仅主模型 `DataSpaceRowPermission` | `data-space-query-context.ts:85-119` |
| ingest | `updateFromServer({rows,total})`，不拆子表 | `data-view.ts:1834-1855` |
| $sum 等 | 读 **独立子视图** `childView.rows`，不读父行嵌套数组 | `computed-column-delegate.ts:103-130,377-390` |

**缺失（产品层）**：按后端 ChildTables 语义填充请求 → 响应拆挂子 DataView + 子权限 → ingest 后供 grid/级联/$sum 消费（禁止业务 Vue 二次 GetData 拼子表）。

**S 优先**：一条带嵌套 Items/ChildTables 的真实 GetData 回包（逻辑视图或库表 Navigation），再定字段名与子表 Name 映射。

### 10.2 B18—B22：聚合

| 通道 | 行为 | 锚点 |
| --- | --- | --- |
| 正式 runtime | `localAggregates = false` → 禁止本地跨行汇总 | `data-space-runtime-api.ts:53-54,1101`；`data-view.ts:1100-1101` |
| `view.aggregates` | 配置可留；读 `aggregateResult` 抛 `DATA_VIEW_REMOTE_AGGREGATE` | `data-view.ts:1243-1267` |
| 子表 `$sum` 等 | 正式子视图停算 + `DATA_VIEW_REMOTE_COMPUTED_AGGREGATE` | `computed-column-delegate.ts:104-120` |
| **后端汇总（已接线）** | `fieldProjection.valueFunction` / 模型 ValueFun → `GetGroupData` → GetData Fields | `data-space-query-aggregation.ts:39-54`；`data-space-query-options.ts:27-96` |
| **消费形态** | 汇总值在 **statistics/aggregate 视图的 `rows[0]` 字段**，非 `view.aggregateResult` | `data-space-view-aggregation.test.ts:155-177`；`bindFormalModel(...,{aggregateResult:true})` |
| 旧 `GroupTableName` | 过滤器目录无后端合同；normalize 拒绝 | `data-view-filter-catalog.ts:65-66` |

**迁移方向**：脚汇总/选择汇总 UI 绑 **带 ValueFun 的命名视图** 或专用 statistics 视图读行字段；勿指望恢复 `view.aggregates` 在正式页本地 `$sum`。

**S 优先**：同一正式模型上一条 GetData（含 ValueFun/GetGroupData）请求+`rows[0]` 回读，对照设计器汇总位需求。

### 10.3 双轨 HTTP（收敛登记）

不经 `DataSpaceRuntimeApi` 的仍存路径（单逻辑目标前的差距）：

- 无 `queryExecutor` → `CrudService`（`data-view.ts:1792-1796`）
- 设计态 `readTable` 直 POST GetData（`data-space-design-api.ts:990-997`）
- 树 `TreeManager` 独立端点（`tree-manager.ts:183-190`）
- 平台/目录等 `lowcodeApi` 直 `/api/DataOperation/GetData`（非 `dataSpace.runtime`）
- DBMS / 蓝图上传等与数据空间 CRUD 无关

设计器装配混用 design read + runtime `bindModelView`（`lowcode-data-space-runtime.ts:66-71`）——与 §9.2「装配旁路」同一主题；Live Pilot 不阻塞登记，整页收敛排在 B11—B22 之后。

### 10.4 阶段 3 实施顺序（依赖 S）

1. 抓嵌套 GetData 样本 → 补 `ChildTables` 请求合同 + ingest 拆表（§10.1）。  
2. 抓 GetGroupData 样本 → 设计器/列表汇总绑 statistics 视图（§10.2）。  
3. 禁止：拉全页明细本地 `$sum`、改共享 ValueFun 冒充后端、未验 ChildTables 就自动推导模型关系。

### 10.5 本地 Java 参考（只读，不接入）

`E:/r/sparkproject-master-c52ea6af/packages/data/spark-api` 与 `E:/r/sparkproject/packages/data/spark-api` 均存在；推断须与 **spark.lingmacn.com** 实测分开记录。
