# 独立 Dataset Plan 替代 pagedata 第四文件研读

## 当前事实

- 参考仓 `E:\r\sparkproject` HEAD `f22cf9e83` 使用独立 `{scenarioId}.dataset.json`，根类型为 `spark.runtimeDataSetPlan`，文件 customPath 为 `DataSet`。
- 参考 Plan 包含 `scenarioId`、`inputParams`、`models/modelFields`、`views/viewFields`、`relations/linkage`、content hash；不含运行 rows。
- 参考视图级联的权威输入是 `views[].dependencies` 与 Filter 中的 `ValueFun.Type=GetDependValue`；空值策略为 `emptyResult/omit/asNull`。
- 参考运行时由单次 `DataSetRuntimeHost` 持有各 `dataViewId` 的 rows/activeRows/fieldValues/draftRows，并通过 `cascadeFrom/cascadeAll/saveView` 执行。
- 参考 SmartBid 页面当前并未接入该 Provider；该 Dataset 能力目前主要是 metadata/ERP 通用底座。

## 本仓事实

- 当前共享第四文件为 `SysForm/<scenarioId>/pagedata.json`，由 `ScenarioViewConfig` 解析并由 lowcode assembler 装入 `DataSet`。
- 当前运行级联为 pagedata `viewCascades`：query cascade 使用 parent/child view、filterBindings/inputBindings/when/autoLoad；field cascade 使用 parents/optionsView/valuePolicy。
- `pagedata.json` 文件名、customPath、版本名 `N__pagedata.json`、publication manifest、ScenarioViewFile/Document、ProjectWorkspace 保存/快照和 config/pages repository 都显式耦合。
- 本仓页面运行仍必须走 `PageRuntime -> DataSet -> DataView -> 标准组件`；不搬入参考仓 Vue Provider 作为第二套运行链。
- Page16/Page18 已有 PageTool 三文件和发布 pointer，但共享 D3 当前九个正式模型不含 `KnowledgeGuide`；目录/作业 reader 不能只改 rule 后继续依赖页面专属 TS host。

## 目标方向

- 直接采用参考仓的独立 Dataset 文件 JSON 合约 `spark.runtimeDataSetPlan`，不改合约字段、不做 pagedata 兼容转换。
- 让独立 Dataset Plan 成为唯一共享第四文件真源，替代 `pagedata.json`。
- 运行读取、设计保存、历史快照、publication manifest、PageRuntime 装配统一消费新文件合同。
- 删除已替代的 pagedata 运行入口，不保留双真源。
- 参考 Provider 仅提供语义与 Plan 结构依据，不作为本仓页面宿主。
- 参考 Plan 与本仓 DataSet 之间必须有明确的一次转换或共同运行合同；不得只改后缀名。

## 已识别风险

- 参考 Plan 的 `dependencies/GetDependValue` 与本仓 `viewCascades` 不是同一 JSON 格式。
- 参考 Plan 保存了完整 models/modelFields 运行投影，本仓原则禁止在共享场景文件复制数据库模型真源；需要确认采用哪一层正式结构。
- 多模型事务、Flow bridge、SmartBid command owner 在参考通用 Host 中仍缺少；迁移不能宣称自动覆盖。
- 远端已有 pagedata 历史、现有 publication pointer 与仓内系统场景 config 需要逐类迁移/替换策略。
- 需要确认格式名、后端 customPath 支持、旧 pointer 恢复策略和 D3 SmartBid 资源 owner 合同。

## 用户确认

- 先只切 D3 SmartBid。
- 使用 `DataSet/<scenarioId>.dataset.json` 与 `spark.runtimeDataSetPlan` 合约，不改变文件格式。
- 历史/刷新按参考仓 mtime + contentHash 合约。
- Plan 完整包含 models/modelFields/viewFields。
- 逻辑由 `packages/spark-data` 直接解析并执行，不引入参考 Provider，也不使用页面 script/TS host 做级联。
- Page16/18 的查询和命令统一声明为 Plan 资源并由 spark-data owner 执行。
- 新 Plan 回读及 smoke 通过后立即删除 D3 pagedata 运行入口；无兼容 fallback。
