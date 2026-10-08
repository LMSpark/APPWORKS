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
      childField: 'departmentId',
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

`DataResourceRelation` 和 `DataViewCascade` 是两条独立的合同：前者描述数据资源之间的字段关系，后者描述两个明确 DataView 之间的运行时输入级联。框架不会从其中一条自动推导另一条。

#### DataResourceRelation 配置

```typescript
type DataResourceRelation = {
  relationId?: string
  sourceRelationId?: string
  parentTable: string
  childTable: string
  parentField?: string
  childField?: string
  fieldMappings?: readonly {
    parentResourceField: string
    childResourceField: string
  }[]
  cascadeUpdate?: boolean
  cascadeDelete?: boolean
}
```

`parentTable` / `childTable` 是 DataTable 资源标识。单字段关系可使用 `parentField` / `childField`；复合字段关系使用 `fieldMappings`。

#### DataViewCascade 配置

```typescript
type DataViewCascade = {
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

`filterBindings` 是 DataView 输入合同。运行时按 `dependencyType` 读取源 DataView 的行，把 `sourceField` 值转换为目标 DataView 的 `targetField` 查询条件。

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
