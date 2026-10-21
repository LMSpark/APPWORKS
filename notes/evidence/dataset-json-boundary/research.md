# DataSet JSON 输入边界研读与复现

日期：2026-10-09。状态：研读结论待用户确认，尚未修改生产代码或测试。本文是任务证据，不是产品合同。

## 问题与职责

用户追问：空间等定义已经持久化到数据库，DataSet.fromJson 是否还有意义？

当前正式持久来源仍为数据库记录与 pagedata.json。LowcodeDataSpaceAssembler 读取后的组合定义通过 DataSet.fromJson 创建运行实例；该方法没有数据库或文件 IO。原生快照及 DataSetCrudTool 的本地 undo/redo 也使用它。不能把整体快照重新当成正式空间保存合同。

DataSet.fromJson 另有一条旧分支：没有 tables 时，将每个顶层键推断成表，按第一行推断字段，非对象的混合行被跳过。这与明确元数据装配不是同一语义。

## 当前源码和调用证据

- 完整读取 `packages/spark-data/src/dataset.ts`，核对构造、结构替换、级联、保存和序列化；完整读取 `spark-data.ts`、`metadata.ts`、`metadata-schema.test.ts`、`spark-data-namespace.test.ts` 和 `dataset-history.test.ts`。
- 反查 `DataSetCrudTool` 的创建、fromDataSet/fromJson/reconcileFromJson、历史与 replaceFromJson；它们委托 DataSet.fromJson，历史存的是显式结构。没有名为 loadJson 的当前方法；旧研读记录中的这一名称不准确。
- 正式生产调用：`src/lowcode/data-space/lowcode-data-space-assembler.ts:140` 提供明确 tables、正式 columns、多视图、关系和级联，随后逐视图绑定 query/save owner。
- `SparkData.createDataSet(meta)` 也委托 fromJson；两个应用演示组件提供明确 tables。页面设计 AI 当前根对象是 ProjectWorkspace，绑定提示明确不提供 DataSetCrudTool，不能拿库类的公开导出当作当前 AI 工作区可调用实例。
- 对 src/packages/tests/scripts 的 TS/JS/Vue 文件做语法扫描，共找到 221 个 DataSet/SparkData/DataSetCrudTool 的相关工厂调用：181 个字面量显式提供 tables，7 个对象表达式需分辨 spread/历史拒绝/内部回退，1 个字符串、32 个其他表达式继续反查。这是查找定位统计，包含测试及内部递归，不代表 221 条业务链路，也不覆盖外部已发布包消费者或任意动态脚本。
- 7 份提示词案例常量均有 dataSetName/tables/resourceRelations/viewCascades；本轮不改其中旧模型关系输入，关系入口是另一个待收敛项。
- 快照、命名空间、正式身份及宿主装配相关调用已追到明确结构；缺少 tables 的实际仓内消费发现于下述历史夹具测试。

## 历史夹具影响

`tests/runtime/page/page-data-serialization-roundtrip.test.ts` 遍历 27 份历史 pagedata。以下 4 份没有 tables，当前会经推断分支被接受：

| 夹具（位于 backend-api-contracts/characterization-fixtures/pages-config/lmspark/homepage） | 当前内容 |
| --- | --- |
| async-demo/pagedata.json | 空对象 |
| dev/pagedata.json | 空对象 |
| home/pagedata.json | stats、tableData、formOptions 普通数据 |
| renderer-demo/pagedata.json | users、education_dict、user_resumes 普通数据 |

源码搜索未发现运行宿主从该夹具目录装配这些页面；该目录被测试及治理工具使用。原文件须保留为历史样本。收紧入口后，测试应逐个断言它们被拒绝，并保持所有合法原生夹具的往返和数据断言，不能改成无条件跳过或改写历史原文。原有 3 份旧级联拒绝样本与这 4 份普通 JSON 应分别说明原因。

## 无后端内存探针

通过 Vite `createServer({configFile:'vitest.config.ts',server:{middlewareMode:true,watch:null,hmr:false}})` 的 ssrLoadModule 加载当前 DataSet，调用后销毁实例并关闭 server。探针没有触发查询或保存，没有改线上数据。

| 输入 / 操作 | 当前实际输出 |
| --- | --- |
| `{dataSetName:'Empty',tables:{}}` | 接受：显式空 DataSet |
| `{dataSetName:'Broken',scenarioId:'SPACE-TEST'}` | 接受：名称变为 PageDataSet，scenarioId 为 undefined；dataSetName 与 scenarioId 各变为一张单行 value 表 |
| `{Users:[{id:1,name:'A'},{id:2,name:'B'}]}` | 接受：推断 id/name 列及 2 行 |
| `{Users:[{id:1},'lost',null]}` | 接受：只剩 1 行，另两项被跳过 |
| `{}` | 接受：隐式空 DataSet |
| JSON 文本 `null` | 接受：value 表 1 行 |
| JSON 文本 `[1,2]` | 接受：value 表 2 行 |
| 有 Users 表的本地 DataSet 执行 `replaceFromJson({})` | 接受：Users 被销毁，tables 变为空 |

探针最后一项仅证明本地、无 scenarioId 实例的行为。正式场景已有身份不变校验，不能把该现象扩大描述为线上空间被清空或数据库记录被删除。

## 保留与删除的界限

保留明确结构对象及对应 JSON 文本的校验、规范化、实例创建、同身份快照恢复；保留正式 DB + 文件装配和权限绑定。没有 tables 的输入应在构造/替换前失败，不自动变成空集或猜表。

候选删除仅为推断分支、inferColumnType、inferColumnsFromRecord、dataRowFromValue 及失去用途的 ColumnType import。dataRowFromRecord 同时被事务新增/更新回执消费，必须保留。

这次是公开输入行为收紧，不能宣称兼容任意 JSON，也不能仅因仓内未见生产调用就声称外部无人使用。具体修改及验证见 [候选计划](../../plan-dataset-json-boundary.md)。

## 改动前验证

以下是原实现基线，不是修复通过证据。本轮尚未修改生产代码或测试，待审核问题已经发出。

- dataset.ts SHA-256：`56914FD6AF7803A3072936D31CF7C553F97BA23F1FA7F2743C1A768DB58FC120`。
- 根类型检查通过：[日志](root-typecheck-before.log)。
- spark-data 类型检查通过：[日志](data-typecheck-before.log)。
- metadata-schema、命名空间、DataSet 历史、CrudTool 4 文件 / 45 测试通过：[日志](data-tests-before.log)。
- 历史夹具往返、事务配置页 2 文件 / 35 测试通过：[日志](fixtures-before.log)。这仍包含旧格式被接受的行为，后续要按批准合同改为明确拒绝。
- 文档门禁通过，检查 348 个文件：[日志](docs-plan.log)。
