# SPARK Data API 文档

运行 `DataTable.modelBinding` 为只读的模型ID/查询Name快照，创建时由 `DataTable.fromJson` 捕获并冻结。直接改绑或修改其成员会失败；模型改名/迁移按整页运行DataSet重建合同装配新实例，页面内tableName保持稳定。`toJson()` 返回独立的绑定JSON对象，修改配置不会改动旧实例。`DataSet.scenarioId` 创建后只读；`replaceFromJson` 拒绝新增、移除或更换场景，且在销毁旧表前失败，保留旧视图、数据和编辑状态。同场景结构替换仍可使用该入口；整页场景更换由独立 PageRuntime 调用重建负责，旧实例 dispose 后拒绝继续执行。

## SparkData 命名空间

### DataViewKey概览

`SparkData` 是数据空间的统一入口，提供优雅的工厂方法来创建数据管理对象。

公共 API 规矩：
- `create*` 入口优先使用命名类型或位置参数，保持强约束、容易定位错误。
- 宽输入与归一化入口统一收口到 `fromJson(...)`；历史包裹结构不再接受。

```typescript
import { SparkData } from '@spark-appworks/spark-data'
```

---

## API Reference

### DataSet 管理

#### `SparkData.createDataSet(meta)`

创建 DataSet 实例

该入口是强约束入口，只接受 canonical `DataSetMetadata`。
如果输入是 JSON 字符串或 pagedata 原始对象，请改用 `SparkData.fromJson(...)`。

**参数：**
- `meta: DataSetMetadata` - canonical DataSet 元数据

**返回：** `DataSet`

**示例：**
```typescript
const dataSet = SparkData.createDataSet({
  dataSetName: 'MyApp',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' }
      ],
      views: {
        default: {
          rows: [
            { id: 1, name: 'Alice', email: 'alice@example.com' },
            { id: 2, name: 'Bob', email: 'bob@example.com' }
          ]
        }
      }
    }
  },
  // 数据关系配置
  resourceRelations: [
    {
      parentTable: 'Departments',
      childTable: 'Users',
      filterExpression: {
        logic: 'and',
        filters: [{ field: 'departmentId', operator: 'eq', value: { Type: 'GetTableField', Field: 'id' } }],
      },
      cascadeDelete: true,
      relationName: 'dept-users'
    }
  ],
  viewCascades: [
    {
      parentTable: 'Departments',
      parentViewId: 'departmentGrid',
      childTable: 'Users',
      childViewId: 'userGrid',
      filterBindings: [
        { sourceField: 'id', targetField: 'departmentId' }
      ],
      dependencyType: 'currentRow',
      autoLoad: true,
    }
  ]
})
```

---

### 数据资源关系与 DataView 输入级联

`DataResourceRelation` 和 `DataViewCascade` 分别表达模型关系与运行输入级联，框架不会相互推导。值级联消费父输入值，选项查询结果按配置约束子字段值；当前行仅用于绑定层定位字段，不是级联端点。

#### DataResourceRelation 配置

```typescript
type DataResourceRelation = {
  relationId?: string
  sourceRelationId?: string
  parentTable: string
  childTable: string
  filterExpression: DataViewFilterTree
  cascadeUpdate?: boolean
  cascadeDelete?: boolean
}
```

`parentTable` / `childTable` 是 DataTable 资源标识。`filterExpression` 是运行与序列化的唯一条件真源：条件 `field` 指向子表字段，值中的 `GetTableField.Field` 指向父表字段。历史输入的 `parentField` / `childField` / `fieldMappings` 只在 DataSet 归一入口转换为等价表达式；输出不保留这些字段，旧占位 `condition` 会被拒绝。正式字段即使不属于当前输出投影也会保留在关系定义中。`DataViewFilterLocal` 仅执行其支持的常量与当前行字段函数；服务端值函数可原样保存，但本地聚合消费会通过现有计算错误通道返回 `undefined` 并在开发环境记录日志。无法解析的值函数引用会阻止相关结构改名/删除。

#### DataViewCascade 配置

```typescript
type DataViewQueryCascade = {
  cascadeId?: string
  sourceRelationId?: string
  parentTable: string
  parentViewId: string
  childTable: string
  childViewId: string
  filterBindings: readonly {
    sourceField: string
    targetField: string
  }[]
  dependencyType?: 'currentRow' | 'selectedRows' | 'allRows' | 'pagedRows'
  autoLoad?: boolean
}
```

上面的 query 分支仍是尚待迁移的旧查询依赖合同，按 `dependencyType` 读取行并生成过滤条件，不能代表通用值级联已经全部迁移。

字段值级联使用 `DataViewFieldCascade`，与 query 共处 `viewCascades`：

```typescript
{
  kind: 'field', cascadeId: 'city-by-region',
  tableName: 'Orders', viewId: 'edit', targetField: 'city',
  valueFormat: 'selection-string',
  parents: [
    { tableName: 'Orders', viewId: 'edit', field: 'country', parameter: 'countryId' },
    { tableName: 'Regions', viewId: 'grid', parameter: 'regionIds' },
  ],
  optionsView: { tableName: 'Cities', viewId: 'choices' },
  valuePolicy: { mode: 'retain-valid', clearValue: '' },
}
```

带 `field` 的父绑定取字段原值及编辑覆盖；不带时取选中主键数组，包括空数组。输入传入选项查询 context，由选项视图自己的过滤表达式消费，不推断字段对字段等值关系。只有最终值改变才自动查询；指针换行但输入相等不重查，未绑定或查询不可用时不发起扩大范围的查询。

选项值、标签、分隔符只在选项 DataView 的 `valueField`、`labelField`、`selectionDelimiter` 中配置。目标 `valueFormat` 必须明确：`native` 保留标量/数组类型，`selection-string` 复用 `DataView.value` 的字符串格式。普通字符串不会按外观拆分；主键不能代替 `valueField` 对应的业务值。旧 `rowMode` 和运行地址 `rowId` 已从此分支移除。

`retain` 不写子值；`clear` 使用显式 `clearValue`；`retain-valid` 保留有效值，多选保留有效子集，无有效值时使用 `clearValue`。`refreshFieldCascade({tableName, viewId, field})` 手动核验选项而不写值；后续父值变化才自动应用策略。`getFieldCascadeState`/`onFieldCascadeChange` 提供独立选项状态。查询失败、旧响应、取消编辑、目标指针改变或用户中途修改子值，不得覆盖该子值；读取和写入均受正式查询权限限制。子值实际变化继续触发其下游值级联。

此分支通过 `queryOptionRows` 完整读取独立选项结果，不替换共享选项 DataView 的 rows；消费方须读取级联状态，不能把共享 rows 当作该绑定的查询结果。普通选项组件自动接入此状态尚未完成。

#### `SparkData.fromJson(json)`

从 JSON 字符串、canonical DataSet 对象或 pagedata 原始对象恢复 DataSet。
历史 `{ dataset: ... }` 包裹结构已移除，请直接传入 canonical `DataSetMetadata`。
该入口负责宽输入归一化；当你需要强约束类型检查时，请优先使用 `createDataSet(meta)`。

**参数：**
- `json: string | Record<string, unknown> | DataSetMetadata` - JSON 字符串或对象

**返回：** `DataSet`

**示例：**
```typescript
const jsonString = '{"dataSetName":"MyApp","tables":{...}}'
const dataSet = SparkData.fromJson(jsonString)
```

---

### TreeManager 管理

#### `SparkData.createTreeManager(config, initialNodes?)`

创建 TreeManager 实例，用于管理树形数据结构

**参数：**
- `config: TreeConfig` - 树配置
- `initialNodes?: FlatTreeNode[]` - 初始节点数组

**返回：** `TreeManager`

**示例：**
```typescript
// 基本使用
const treeManager = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId',
  textField: 'name',
  lazy: true
})

// 带初始数据
const treeManager = SparkData.createTreeManager(
  { idField: 'id', parentIdField: 'parentId' },
  [
    { id: 1, parentId: null, name: 'Root' },
    { id: 2, parentId: 1, name: 'Child 1' },
    { id: 3, parentId: 1, name: 'Child 2' }
  ]
)
```

---

### DataView 管理

`_pk` 是前端计算的行定位值，联合键组合规则保持在本仓。它不进入后端提交；服务端记录定位使用正式业务主键字段及其原值。新增、修改、删除及批量保存均须在封包时剔除 `_pk`，不能用组合值替代后端业务主键。

单条更新、删除和批量删除从原始行提取联合业务键，显式传入的服务端主键不能含 `_pk`。联合键原始行或事务删除快照缺失时，请求前明确失败，保留待提交状态。

查询失败时 DataView 保留上次结果与选中状态，暂停编辑、新增、修改、删除及保存，并明确抛出 `DATA_VIEW_RESULT_STALE`。重试期间仍保持该保护，成功登记新结果后恢复；清空数据不会代替一次成功查询。请求期间产生的草稿不丢弃，恢复前须由调用方明确放弃或处理。

`bindQueryExecutor(executor)` 在首次查询前注入实际查询 owner，执行 `executeQuery(view, params)`；改变 owner 或旧查询开始后切换均要求重新装配运行 DataSet。同一个 owner 重复绑定不改变状态。`queryContext` 仍是输入参数，原结果上下文由 DataView 私有持有，不能由组件取得或通过旧 `ingestPermissionSnapshot` 注入替换。身份、数据、总数和权限一起登记，返回时再次检查未保存编辑；清空或销毁只释放本视图的引用，不使其他视图共享的原上下文失效。

字段和动作集中通过 `fieldAccess(row, field)`、`addActionState`、`editActionState`、`deleteActionState`、`createChildActionState`、`viewActionState` 消费；行身份由原上下文解析，不用本地 `_pk` 猜权限。错误保留的旧结果暂停写通道；请求身份失效则拒绝旧权限消费和本地编辑。注入后的查询不经过 CRUD list，结果行不公开后端权限原文或保存凭据，运行行不写入配置。

宿主数据空间装配器已直接安装实际 API owner，查询输入进入同一原 SPARK 查询链；组件与脚本统一消费 DataView 的原查询权限入口。正式模型输出装配和多空间页面实例仍在切换中。当前测试使用模拟传输，不代表页面整体或真实后端联调完成。

已绑定原查询 owner 的视图不会因旧 CRUD 地址或 `commitMode: 'immediate'` 直接提交行修改，而是保留本地待提交状态。`DataView.saveChanges(ids?)` 已用当前私有已接纳上下文调用实际 owner.save，剔除计算列和 `_pk`，不执行旧逐行 CRUD。没有原上下文或保存能力时明确报 `DATA_VIEW_SAVE_OWNER`。返回后按实际字段回执更新未再次编辑的值；未返回字段、保存期间新修改及编辑草稿保留。新强基线接纳后重建对应行的 dirty 比较，不以旧 WeakRef 清整行；改回基线的选中行不发送无效更新。新增用实际返回身份，期间再次修改或移除仍分别保留为待更新或待删除；删除后本地已恢复的行保留为待新增。保存过程维护 mutating/mutatingError，失败保留 pending。DataSet 同场景多模型调用由 DataView.saveQueryViews 在 class 内捕获各私有基线，统一发送一次 owner.save；先验证全部回执和当前身份，再逐视图接纳，不公开查询上下文。

`DataView.discardPendingChanges(ids?)` 只对保留了原 query owner 与强 query baseline 的视图开放，用于用户明确丢弃尚未确认的本地 pending create/update/delete 及 editor overlay。省略 ids 只处理当前 pending ID 集合；传入 `[]` 为无操作；传 ID 时只处理其 pending 状态。调用前会验证非保存/查询中、原身份仍有效，且所有目标都唯一映射到强 baseline（新增行可没有 baseline）；校验失败时不部分修改。它只恢复本地原查询值、清理对应追踪并重算/发出行状态事件，不发请求。调用方如需核对服务器现状，必须随后显式调用 `refresh()`：成功结果取代本地 baseline；失败按查询失败合同保留当前恢复后的本地 baseline 并标记 stale/不可写。回执未知时这不是服务端回滚，服务器可能已经应用写入；不自动重试保存。没有 query owner/baseline 的本地 CRUD view 显式失败；`discardEditingRows()` 仍只清理 editor overlay，不恢复 business rows。

`DataSet.saveChanges` 的 SPARK 场景预检在应用编辑草稿和拆装级联前执行：事务模式明确拒绝；本次选中的有变更视图必须属于当前 DataSet 运行实例，并有场景和正式模型绑定，同一模型 ID 或查询 Name 不能对应多个待保存视图。调用方须明确选择一个视图；`ids: []` 不扩大为全部行，`applyEditingRows: false` 不把未选中的编辑草稿纳入本次提交。拒绝时保留编辑与 pending 状态。通过预检后先应用选中草稿，未成功应用草稿的视图保留失败统计；其余选中视图的有效变更统一一次 SPARK save，无差异模型不要求回执。跨 owner 拒绝，失败保留待提交状态。原本地未绑定场景的 CRUD 保存仍使用本地路径，不作为 SPARK 保存的后备。

#### `SparkData.createDataView(tableName, meta?)`

创建 DataView 实例，用于数据绑定和视图管理

**参数：**
- `tableName: string` - 表名
- `meta?: ViewMetadata` - 视图元数据

**返回：** `DataView`

**示例：**
```typescript
// 基本使用
const view = SparkData.createDataView('Users')

// 指定上下文 ID
const detailView = SparkData.createDataView('Orders', { viewId: 'detail' })
```

## 高级用法

### 直接访问类构造器

如果需要更多控制，可以直接访问类：

```typescript
import { SparkData } from '@spark-appworks/spark-data'

// 使用构造器
const dataSet = new (await import('@spark-appworks/spark-data')).DataSet({ ... })
```

### 直接类导入

```typescript
import { DataSet, TreeManager } from '@spark-appworks/spark-data'

// 直接使用类
const tree = new TreeManager({ ... })
```

---

## 最佳实践

### 1. 使用命名空间 API

**推荐：**
```typescript
import { SparkData } from '@spark-appworks/spark-data'
const dataSet = SparkData.createDataSet({ ... })
```

**不推荐：**
```typescript
import { DataSetManager } from '@spark-appworks/spark-data'
const dataSet = DataSetManager.create({ ... })
```

### 2. 组合使用 DataSet 和 TreeManager

```typescript
// 创建 DataSet
const dataSet = SparkData.createDataSet({
  dataSetName: 'OrgData',
  tables: {
    Departments: {
      tableName: 'Departments',
      columns: [
        { name: 'id', type: 'number' },
        { name: 'parentId', type: 'number' },
        { name: 'name', type: 'string' }
      ],
      views: {
        default: {
          rows: []
        }
      }
    }
  }
})

// 创建 DataView
const dataView = SparkData.createDataView('Departments')

// 创建 TreeManager 并关联
const treeManager = SparkData.createTreeManager(
  { idField: 'id', parentIdField: 'parentId' },
  dataSet.getTable('Departments')?.views.default?.rows || []
)

// 双向绑定
dataView.setTreeManager(treeManager)
```

### 3. 使用数据加载器

```typescript
const dataSet = SparkData.createDataSet(
  { dataSetName: 'MyApp', tables: { ... } }
)

// 通过 DataView.requestData() 加载表数据
const view = SparkData.createDataView('Users')
await view.requestData()
```

---

## 类型定义

所有类型都可以从包中导入：

```typescript
import type {
  DataSetContract,
  DataRow,
  DataColumn,
  TreeConfig,
  FlatTreeNode,
  DataViewFilterTree,
  CrudApi,
  TableMetadata,
  ViewMetadata
} from '@spark-appworks/spark-data'
```

---

## DataViewKey / DataMember 数据视图绑定

### 概览

`dataViewKey` 用于在页面配置（rule.json）中定位 DataView；`dataMember` 用于读取 DataView 成员；`dataField` 用于对象型成员内部字段或点路径。

### 格式

```
tableName@viewId                 # dataViewKey：容器定位 DataView
#scope@tableName@viewId          # 跨页面 dataViewKey
```

- **scope** — 跨页面页面 ID 或 DataSet 名称（`dataSetName`），必须使用 `#` 前缀
- **tableName** — 表名
- **viewId** — 视图 ID，必须显式写出；默认视图也写 `default`
- **dataMember** — `rows` | `columns` | `currentRow` | `selectedRows` | `aggregateResult` | `selectionAggregateResult` | `total` | `page` | `pageSize` | `requestState` | `mutating` | `loadingError` | `mutatingError`
- **dataField** — 仅对 `currentRow`、`aggregateResult`、`selectionAggregateResult` 生效，支持 `customer.name` 这种点路径

### API

#### `isDataViewKey(dataViewKey: string): boolean`

判断字符串是否为 DataView 定位键格式。

#### `parseDataViewKey(dataViewKey: string): DataViewKeyDescriptor | null`

解析 DataView 定位键为结构化描述符。非定位键格式返回 `null`。

统一格式（`@` 分隔符；跨页面必须带 `#scope` 前缀）：

| 段数 | 格式 | 示例 |
|------|------|------|
| 2 段 | `table@viewId` | `Users@grid` |
| 3 段 | `#scope@table@viewId` | `#SharedDS@Users@grid` |

成员名和字段路径不写入 DataViewKey；读取成员时使用 `dataMember`，读取对象成员内部字段时使用 `dataField`。

```typescript
import { DataMember, parseDataViewKey, resolveDataViewMember } from '@spark-appworks/spark-data'

parseDataViewKey('Users@grid')
// → { tableName: 'Users', viewId: 'grid', raw: 'Users@grid' }

parseDataViewKey('#SharedDS@Users@grid')
// → { scope: 'SharedDS', tableName: 'Users', viewId: 'grid', raw: '#SharedDS@Users@grid', crossPage: true }

resolveDataViewMember({
  dataViewKey: 'Users@default',
  dataMember: DataMember.CurrentRow,
  dataField: 'profile.name'
}, dataSet)
// → DataView.currentRow.profile.name
```

#### `resolveDataViewKey(dataViewKey: string | undefined, dataSet: DataSet | null | undefined): DataView | undefined`

从 DataSet 中解析定位键对应的 DataView。

#### `resolveDataViewMember(input, dataSet): unknown`

读取 DataView 成员，可选 `dataField` 继续读取对象型成员内部字段。

`dataMember: 'value'` 读取原生绑定值：指定 `dataField` 时，它是视图输出字段的完整名称，返回指针定位的数据及编辑覆盖后的字段值；省略时返回选中行的主键值数组，空选择为 `[]`。数值、布尔、null、数组及普通字符串保持原类型，返回独立快照。取值依据该视图当前正式查询的读取权限，不可读或来源已销毁会明确失败；`diagnoseDataViewMember` 返回对应诊断。

这个绑定值不经过 `DataView.value`。后者继续按 `valueField` / `selectionDelimiter` 读写序列化字符串，兼容原有消费者与持久化。例如 valueField=code 时，已有字符串可能为 `"A|B"`，原生选中值仍是对应的主键数组 `["01", "02"]`。普通字段字符串不被猜测拆分；本入口提供取值，不自动发起级联或写入子字段。

#### `buildDataViewKey(tableName, viewId?, scope?): string`

构建标准化 DataView 定位键。viewId 为 `'default'` 时也会显式输出。

```typescript
buildDataViewKey('Users')                    // → 'Users@default'
buildDataViewKey('Users', 'grid')            // → 'Users@grid'
buildDataViewKey('Users', 'grid', 'Shared')  // → '#Shared@Users@grid'
```

#### `diagnoseDataViewKey` / `diagnoseDataViewMember`

返回可用于 fail-fast 日志的诊断对象，覆盖无效键、缺少 DataSet、表不存在、视图不存在、成员非法、字段组合非法等状态。

### 类型

```typescript
enum DataMember {
  Value = 'value',
  Rows = 'rows',
  Columns = 'columns',
  CurrentRow = 'currentRow',
  SelectedRows = 'selectedRows',
  AggregateResult = 'aggregateResult',
  SelectionAggregateResult = 'selectionAggregateResult',
  Total = 'total',
  Page = 'page',
  PageSize = 'pageSize',
  RequestState = 'requestState',
  Mutating = 'mutating',
  LoadingError = 'loadingError',
  MutatingError = 'mutatingError'
}

type DataViewKeyDescriptor = {
  scope?: string        // 仅跨页面 #scope 前缀存在
  tableName: string
  viewId: string
  raw: string
}
```

### 在 rule.json 中使用

```json
{
  "type": "r-table",
  "props": {
    "dataViewKey": "Users@default",
    "border": true,
    "highlightCurrentRow": true
  }
}
```

展示组件、动作和详情上下文需要读取 DataView 输出时，使用显式三元组，例如 `dataViewKey: "Users@default", dataMember: "currentRow", dataField: "name"` 或 `dataViewKey: "Users@summary", dataMember: "aggregateResult", dataField: "totalAmount"`。

---

## 架构对应关系

| SPARK Data | .NET Framework | 职责 |
|-----------|---------------|------|
| `DataSet` | `System.Data.DataSet` | 数据集管理 |
| `DataTable` | `System.Data.DataTable` | 数据表结构 |
| `DataView` | `System.Data.DataView` | 数据视图 / 绑定上下文 |
| `TreeManager` | (自定义) | 树形数据管理 |

---

## 更多示例

查看 [README.md](./README.md) 获取更多示例和用法。
