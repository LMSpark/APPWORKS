状态：implementing

## 任务目标

将 SmartBid D3 场景第四文件从 `pagedata.json` 切换为独立 `DataSet/<scenarioId>.dataset.json`，严格使用参考仓 `spark.runtimeDataSetPlan` 文件合约，并由本仓 `packages/spark-data` 原生装配、查询、级联、命令与保存。

## 阶段与业务语义

- 本阶段只迁移 `D3BBA1F0780056C837AC35E9825CAD5A`，不切换其余动态场景或仓内系统场景。
- D3 Dataset Plan 包含完整 `models/modelFields/views/viewFields/relations/linkage/inputParams`，运行 rows、权限凭据、草稿和临时结果不写入文件。
- 每次 D3 PageRuntime 只读取独立 Dataset Plan；spark-data 直接消费 `views[].dependencies` 与 Filter `GetDependValue`。
- Page16/18 的目录、Agent dispatch、原试次读取等统一映射为 Plan 的正式 resource/DataView/command 定义；页面专属 host 不再承接这些业务查询或命令。
- 新文件精确回读、正式 DataSet 装配、D3 级联与 Page16/18/19 smoke 通过后，删除 D3 的 pagedata 运行读取，历史旧文件仅保留审计证据，不作为运行 fallback。
- Page12/14 子节点权限阻断、Page15 多节点发布及其它 pageId pointer 不在本阶段被重建或绕过。

## 影响范围

- `packages/spark-project-model/src/scenario/`
  - 新增 `spark.runtimeDataSetPlan` 的解析/校验合同及从 Plan 到本仓 DataSet metadata 的正式转换。
  - 替换 D3 依赖 `ScenarioViewConfig/ScenarioViewFile` 的读取入口；不保留双合同。
- `packages/spark-project-model/src/project/`
  - Dataset Plan 的工作文件、mtime/contentHash 读取与 publication 文件来源。
  - publication manifest 从 pagedata snapshot 改为 Dataset Plan 身份与哈希。
- `packages/spark-data/`
  - 原生解析 Plan 的 models/views/dependencies/GetDependValue。
  - 将设计态 `DependKey/SourceDataViewId/SourceField/EmptyValueMode` 直接落到 DataView query cascade。
  - command/logical-view/file resource 仍走现有 DataView source 生命周期和权限。
- `src/lowcode/lowcode-runtime.ts`
  - D3 场景文件读写改为 `DataSet/<scenarioId>.dataset.json`；删除 D3 pagedata 运行分支。
- `src/lowcode/data-space/lowcode-data-space-runtime.ts`
  - D3 通过新的 Dataset Plan contract 装配，不从 pagedata 生成 `ScenarioViewConfig`。
- `src/lowcode/data-space/lowcode-data-space-assembler.ts`
  - 增加独立 Plan 的模型/视图/关系/依赖装配，不改变现有其它场景入口。
- `src/views/features/application/smart-bid/**`
  - Page16/18 `rule.json` 绑定新 Plan 中的正式 DataView/command。
  - 删除或收窄 `content-operation-target`、`content-review-target`、`knowledge-directory-script-host`、`smart-bid-page-call` 中 D3 页面专属业务 host。
- `config/pages/**` 与 repository glob
  - D3 不来自仓内静态场景；首批不迁移其它系统 pagedata。
- 测试
  - Plan parser/roundtrip、spark-data dependencies/GetDependValue/empty mode、lowcode D3 runtime、publication、Page16/18 renderer 与 stale/fail-closed 路径。
- `notes/data-space-retirement-ledger.md`
  - 记录 D3 新文件名、hash、版本切换、旧 pagedata 删除结论及 smoke proof。

## 技术方案

1. 从现有 D3 正式模型、字段、视图和 nine-model 运行定义生成符合参考合约的独立 Dataset Plan，不修改该文件顶层字段名。
2. 在 spark-project-model 增加 Dataset Plan parser/validator；缺失 scenario、重复 view、非法 dependency、非法 command resource 立即 fail-fast。
3. 在 spark-data 增加 Plan 运行转换：只读取正式模型身份与投影，建立 DataTable/DataView；`dependencies` 直接驱动 query cascade；标量/数组输入、`emptyResult/omit/asNull` 及旧异步结果隔离沿 DataView 现有生命周期执行。
4. 将 Plan 中每个 `DataView.id` 映射到本仓完整绑定键；表名/正式模型名和 page binding 使用同一模型身份，不猜内部表键。
5. 为 Page16/18 补充正式 logical-view/command resource 声明与公共 binding；缺少真实 owner 时停止，不写假模型或页面专属 TS fallback。
6. 改 publication receipt 使用 Dataset Plan 的文件路径、mtime、contentHash 和 proof；工具三文件仍独立发布，manifest 不再引用 D3 pagedata snapshot。
7. 通过正式 DataSet API 保存、精确回读 `DataSet/D3.dataset.json`，生成 D3 新 publication pointer 并打开 Page16/18/19。
8. D3 smoke 成功后删除运行时对 `SysForm/D3/pagedata.json` 的读取；保留远端旧历史文件仅作不可执行审计。
9. 清理被替代的 SmartBid host 分派和测试替身，禁止遗留 `pagedata → dataset` 双读取兼容层。

## 兼容性

- 本批只切 D3；其它场景继续使用现有 pagedata 入口。
- D3 的旧 publication manifest 不再作为新 PageRuntime 输入；重新发布使用 Dataset proof。
- 其它 D3 三文件 pageId/导航节点保持不变，Page12/14 权限阻断不受影响。
- 这是有意的 D3 第四文件协议替换，不提供运行回退兼容；失败时保留旧 pointer/旧文件事实并停止切换，不自动同时读取两套。
- 参考仓 Vue Provider/Host 不进入本仓；只复用文件合约。

## 验证计划

- 开始编码前：`git status --short`、确认 D3 关联文件当前内容、运行 `pnpm run typecheck` 记录基线。
- 类型检查：`pnpm run typecheck`。
- Lint：改动文件目标 ESLint；若影响公共包，运行该包既有 lint 命令。
- spark-project-model：Scenario/Dataset Plan parser、roundtrip、stale/contentHash、publication receipt 测试。
- spark-data：query cascade 标量/数组、多父、empty mode、late result、selection release 与 command source 测试。
- lowcode：D3 装配与非 D3 pagedata 回归，确保改动只切 D3。
- SmartBid：Page16/18 config、page runtime、published route、old host 已不可达、Page19 不回归。
- 合同门禁：`pnpm run verify:lowcode-contracts`、`pnpm run verify:class-model`、`pnpm run verify:docs`、`pnpm run verify:page-thin`。
- 浏览器烟测：D3 新 Dataset 文件 exact readback，Page16/18/19 关闭重开，正式 query/command proof。
- `git diff --check`。

## 风险项

- 参考 Plan 会完整复制模型/字段投影，而本仓正式模型仍在数据库；Plan 必须验证与当次正式 metadata 一致，不能单独编辑为第二数据库真源。
- 参考 Plan 不自动承接 SmartBid 复杂 Agent owner；缺少正式 command/logical-view owner 时必须阻断并登记，而非保留 TS 页面 host。
- 独立文件与 publication manifest 不同于旧 pagedata snapshot；必须防止旧 manifest 被新 loader 当作可运行 proof。
- D3 正式模型可能比现有九模型更多；生成 Plan 前必须重新读取正式模型与视图，不能用旧 manifest 中九表静态硬编码。
- 线上保存与旧 pointer 切换不构成跨来源事务；文件、manifest、蓝图 pointer 分别回读。
