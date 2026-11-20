# SPARK Data API

版本：2.0.0。本文是包级方法索引。数据空间领域、正式 pagedata、数据库真源、query/save 和权限边界统一见[数据空间主合同](../../docs/architecture/DATAFLOW_ARCHITECTURE.md)，不在本页复制跨包规则。

## 创建与恢复

| 入口 | 输入 / 返回 | 使用边界 |
| --- | --- | --- |
| SparkData.createDataSet(meta) | DataSetMetadata → DataSet | 原生结构入口；正式场景由宿主装配器创建 |
| SparkData.fromJson(json) | JSON 字符串、原生元数据或普通对象 → DataSet | 宽输入归一；普通对象推导属于现存局部兼容能力，**不是正式 pagedata 装载器** |
| SparkData.createDataTable(meta) | TableMetadata → DataTable | 列和多个命名视图；至少提供 default |
| SparkData.createDataView(tableName, meta?) | 表名及 ViewMetadata → DataView | 创建未关联 DataTable 的视图；不能据此直接发起正式查询 |
| SparkData.createTreeManager(config, initialNodes?) | TreeConfig、可选节点 → TreeManager | 本地树及通用端点能力，服务支持须另行接入 |
| SparkData.createDataSetCrudTool(dataSetName) | 名称 → DataSetCrudTool | 原生结构编辑工具，不自动持久化；数据空间定义通过元数据DataView/DataSet及对应资源适配提交 |
| SparkData.createDatabaseCrudApi(tableName) | 名称 → 通用 /data/... 端点映射 | 只生成配置，不创建服务，也不是 SPARK 正式保存 owner |

历史 `{dataset: ...}` 包裹不再接受。正式场景必须经 ScenarioViewConfig 和模型装配，不能通过 fromJson 猜模型、字段或权限。

### 可执行的局部数据示例

```ts
import { SparkData } from '@spark-appworks/spark-data'

const dataSet = SparkData.createDataSet({
  dataSetName: 'LocalUsers',
  tables: {
    Users: {
      tableName: 'Users',
      resourceType: 'static-data',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
      views: {
        default: { rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] },
      },
    },
  },
})
const view = dataSet.getView('Users', 'default')
if (!view) throw new Error('Users/default 不存在')
view.setSelectedRows([view.rows[0]!])
// 使用完成后释放本地 owner。
dataSet.destroy()
```

远程视图应从已装配 DataSet.getView 取得，不额外创建一个同名未绑定实例。局部静态结果不承担平台数据权限，也不能作正式场景失败后的替代数据。

## DataSet / DataTable

DataSet.scenarioId 和 DataTable.modelBinding 是创建时捕获的只读身份；modelBinding 成员冻结。toJson 返回独立快照，修改快照不改旧实例。replaceFromJson 不能新增、移除或切换场景身份；场景切换由宿主重新装配独立调用。

| 入口 / 属性 | 职责 |
| --- | --- |
| getTable(tableName) / getView(tableName, viewId) | 按明确身份定位模型或视图 |
| DataTable.columns / views | 模型字段及多个命名视图 |
| DataTable.api / crudConfig | 端点映射 / 请求提交策略；[正式与通用模式范围不同](../../docs/architecture/DATAFLOW_ARCHITECTURE.md#32-datatableapi-与-datatablecrudconfig) |
| DataSet.resourceRelations | 模型关系完整过滤表达式；不自动产生输入级联 |
| DataSet.viewCascades | query/field 显式依赖定义 |
| DataSet.toJson / replaceFromJson | 原生结构快照与同身份结构替换；不是场景文件 IO |
| destroy | 释放所属表、视图及订阅；调用方负责生命周期 |

`FormalTableRequestConfig.parse(tableConfig?, path?)` 是正式表 api/crudConfig 的共享纯解析入口，返回独立端点/timeout 快照。文件层与运行请求层共同消费；平台默认 URL 和 scope 合并不由此类负责，通用 CrudService 配置也不受此类限制。

模型关系输入仍兼容 parentField/childField/fieldMappings，在归一入口转成 filterExpression，输出只留表达式；旧 condition 拒绝。这是现存兼容边界，不是新配置推荐形式。结构改名/删除须处理完整引用，未知值函数引用不能通过猜测改写。

## DataView 查询、编辑与保存

| 入口 | 职责与结果 |
| --- | --- |
| bindQueryExecutor(executor) | 首次查询前注入 owner；更换 owner 需重建实例 |
| requestData / refresh | 请求调度及 query 级联；调用后须检查实际状态 |
| loadFromServer | 执行实际查询；不等价于父依赖调度 |
| setCurrentRowById / setSelectedRows | 更新指针 / 选择集合 |
| updateEditingValue(id, field, value) | 编辑覆盖，返回编辑行；受有效上下文及字段权限约束 |
| applyEditingRows / discardEditingRows | 将编辑覆盖应用为待保存差异 / 只丢弃编辑覆盖 |
| saveChanges(ids?) | 保存已应用差异，返回 CrudResult<SaveChangesData>；不自动应用编辑覆盖 |
| discardPendingChanges(ids?) | 原查询 owner 模式下显式放弃 pending 及对应编辑覆盖，恢复强基线；不发送请求 |
| fieldAccess / 各动作状态 | 消费当次正式查询权限；不注入公共权限快照 |
| queryOptionRows | 隔离的完整选项查询，不覆盖定义视图 rows |

DataSet.saveChanges(options?) 返回 `CrudResult<DataSetSaveChangesResult>`；结果含 viewResults、失败编辑数及失败行数。默认先应用编辑覆盖，可用 views 明确限定 tableName/viewId/ids。显式 ids=[] 不表示全部行。正式场景预检拒绝 transaction、同记录跨视图提交、模型身份冲突和跨 owner；细节见[主合同第 5 节](../../docs/architecture/DATAFLOW_ARCHITECTURE.md#5-正式运行装配查询编辑保存)。

查询失败保留上次结果但标记 stale，暂停写操作。discardPendingChanges 只恢复本地基线，不是服务端回滚：省略 ids 处理 pending 集合，[] 无操作；校验所有目标后才修改。查询/保存中或身份失效时拒绝。需要服务器现状时再明确 refresh；回执未知不自动重试保存。

DataView.toJson 的远程 rows 为空；整体快照仍不应写作正式 pagedata。树配置完整字段、投影约束及远程接线范围见[主合同视图配置](../../docs/architecture/DATAFLOW_ARCHITECTURE.md#31-dataview-配置完整清单)。

## 级联维护 API

关系语义、输入类型、选项回写和异步隔离统一见[主合同第 6 节](../../docs/architecture/DATAFLOW_ARCHITECTURE.md#6-两类关系与值级联)。定义和签名以 [types.ts](src/types.ts) 与 [DataViewFieldCascadeDefinition](src/strategies/cascade/field-cascade-definition.ts) 为准。

| 入口 | 使用方式 |
| --- | --- |
| DataSet.getCascade / addCascade / updateCascade / removeCascade | 共用校验入口；维护明确 cascadeId，或已有 query 完整端点选择器 |
| DataSet.refreshFieldCascade({tableName, viewId, field}) | 手动核验选项，不写目标值 |
| getFieldCascadeState / onFieldCascadeChange | 读取/订阅该绑定独立的选项与状态，不读共享选项视图 rows 代替 |
| DataSetCrudTool.listCascades({kind?}) | 列出 query/field；按 kind 区分联合类型 |
| 工具 getCascade / updateCascade / deleteCascade | 以 {cascadeId} 定位；创建使用 createCascade({cascade}) |

字段配置必须有显式 valueFormat 和 valuePolicy，支持多 parents；更新不允许改 kind、重复目标或产生依赖环。配置失败不能破坏原视图、级联和工具历史。query 的旧 dependencyType、field 的旧 rowMode/rowId 已不属于配置合同。

`DataViewSelectionValue.token(row, valueField)`、`split(value, delimiter)`、`join(tokens, delimiter)` 为既有字符串边界提供编码。不能将它们套在所有普通字符串上。DataView.value 继续按 valueField/selectionDelimiter 序列化，原生 Value 绑定保持主键数组/字段原值。

## DataViewKey 与 DataMember

| 合同 | 用法 |
| --- | --- |
| tableName@viewId | 给定 DataSet 内按表键局部定位；PageRuntime 中两段键按模型名称解释，要求显式 mainScenarioId |
| scenarioId@modelName@viewId | 完整定位，须匹配 DataSet.scenarioId 与唯一正式模型名称；不是 pageId、dataSetName 或内部表别名 |
| dataMember | Value、Rows、Columns、CurrentRow、SelectedRows、AggregateResult、SelectionAggregateResult、Total、Page、PageSize、RequestState、Mutating、LoadingError、MutatingError |
| dataField | CurrentRow/聚合对象支持成员路径；Value 使用完整输出字段名，不能当嵌套路径拆解 |

已有 `#scenarioId@modelName@viewId` 仍可读取，但新键生成不带`#`。descriptor 的 crossPage 仅标记该旧前缀，不表示按另一个页面 ID 找数据；所有带空间身份的解析均核对真实空间，不能绕过该检查。

```ts
import { buildDataViewKey, parseDataViewKey } from '@spark-appworks/spark-data'

buildDataViewKey('Users') // 'Users@default'
buildDataViewKey('Users', 'grid', 'SCENE') // 'SCENE@Users@grid'
parseDataViewKey('SCENE@Users@grid')
// { scope: 'SCENE', tableName: 'Users', viewId: 'grid', raw: 'SCENE@Users@grid' }
```

| API | 返回 / 责任 |
| --- | --- |
| isDataViewKey(key) | 是否满足定位语法 |
| parseDataViewKey(key) | descriptor 或 null；语法通过不证明实例存在 |
| buildDataViewKey(tableName, viewId?, scope?) | 明确输出 viewId，缺省为 default |
| resolveDataViewKey(key, dataSet) | 局部键按表键、完整键按空间及唯一模型名称定位；正式多场景使用 PageRuntime.resolveView，错空间不得回退 |
| resolveDataViewMember(input, dataSet) | 读取成员；Value 保持原类型和独立快照，受读取权限约束 |
| diagnoseDataViewKey / diagnoseDataViewMember | 无效键、缺表/视图、非法成员组合和不可读输入的诊断 |

Value 指定 dataField 时取指针定位并合并编辑覆盖后的字段原值；省略时取选中主键数组，空选择为 []。这不经过 DataView.value 字符串编码，也不直接发起级联或写入子字段。

## 源码与进一步阅读

- [包导出](src/index.ts)、[工厂入口](src/spark-data.ts)、[公开类型](src/types.ts)、[绑定实现](src/core/data-view-key.ts)。
- [数据管理操作](../../docs/guides/DATA_MANAGEMENT.md)、[树操作](../../docs/guides/TREE_CAPABILITY.md)、[保存动作](../../docs/guides/SAVE_DATASET_ACTION.md)。
- [条件表达式](../../docs/guides/CONDITION_EXPRESSION.md)说明过滤和计算，不复制另一套 wire codec。
