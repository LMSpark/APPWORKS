# 数据管理指南

正式运行场景与局部内存数据集使用同一 DataView 能力，但装配和查询 owner 不同。完整链路见 [数据流架构](../architecture/DATAFLOW_ARCHITECTURE.md)。

## 对象与身份

| 对象 | 职责 |
|---|---|
| DataSet | 单场景运行数据集，协调多个表与视图；scenarioId 只读 |
| DataTable | 稳定 tableName、正式模型绑定与列，持多个命名视图 |
| DataView | 查询、编辑、选择、dirty/stale 与权限消费 |
| TreeManager | 树缓存与本地树算法 |

DataView -> DataTable -> DataSet 是归属链。PageRuntime 持多个场景 DataSet，每次调用独立；工具不持数据。

## 正式场景装配

ProjectWorkspace 读取 SysForm/<scenarioId>/pagedata.json，由 ScenarioViewFile 持原文和编辑历史。ScenarioViewConfig 声明单场景 tables、modelBinding、views、viewCascades。

宿主 loadScenarioDataSet 通过 readModel/readRelations 读取正式定义，校验 modelId、模型查询 Name、稳定 tableName 和字段输出，再绑定共享 DataSpaceRuntimeApi。模型与关系不能从物理资源目录或运行菜单推断。

正式关系可表达的等值级联自动生成；显式 viewCascades 优先。选择父视图 currentRow 后，级联按实际配置更新子视图，不在组件里手写第二套依赖算法。

## 定位与读取

```ts
const view = pageRuntime.resolveView('#SCENE@Users@grid')
if (!view) throw new Error('视图不存在')
const rows = view.rows
const current = view.currentRow
const selected = view.selectedRows
```

SCENE 是已声明的真实场景 ID。局部 Users@grid 仅在明确 mainScenarioId 时允许；不自动取首场景。dataViewKey 只定位视图，dataMember 指定 rows/currentRow/selectedRows/total 等输出，dataField 指定对象成员内字段。

组件使用 useSparkComponent 消费 PAGE_RUNTIME；容器向下提供 DATA_SOURCE，行作用域提供 DATA_ROW。响应式 UI 应订阅 DataView 领域事件或使用现有运行态 hook，不仅把 class 成员放进 computed 就假定它会通知 Vue。

## 查询、选择与编辑

```ts
await view.loadFromServer()
view.setCurrentRowById('ROW_ID')
view.setSelectedRows([view.rows[0]])
view.updateEditingValue('ROW_ID', 'name', '新名称')
await view.saveChanges()
```

实际字段与主键必须来自正式模型。方法的 CrudResult 必须检查成功状态。需要取消编辑时使用 discardEditingRows；不要直接修改 rows 数组、注入权限字段或绕过编辑方法。

dirty 视图拒绝配置/结果覆盖；查询失败进入 stale 并暂停编辑。恢复查询前应按业务意图显式丢弃或处理未保存编辑。迟到查询结果不能覆盖新代次。

## 权限与保存

DataView 私有原 query context 持有查询权限、原 token、差异与保存基线。页面消费 fieldAccess、create/delete/edit 动作状态，不自行解析行里的签名或制造公共权限快照。

E 是写白名单；R 必填只对 E 中字段生效。h/m 联合模型和真实行，树 c 独立控制新增子行。API 映射正式 Name 请求与 AsName 输出；新增按 keyField/GUID 规则，_pk 只用于前端定位而不提交。应用/租户来自请求 scope。

DataSet.saveChanges 保存明确场景。同模型多 dirty 视图拒合存；同场景不同模型一次 SPARK save，不保证事务。正式场景拒绝 transaction 模式。详见 [保存动作](SAVE_DATASET_ACTION.md)。

## 局部内存数据

不带 scenarioId 的局部 DataSet 可用于静态组件和纯算法测试，不承担正式平台权限与模型身份。

```ts
import { SparkData } from '@spark-appworks/spark-data'

const local = SparkData.createDataSet({
  dataSetName: 'LocalItems',
  tables: {
    Items: {
      tableName: 'Items',
      columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
      views: { default: { rows: [{ id: 1 }, { id: 2 }] } },
    },
  },
})
const localView = local.getView('Items', 'default')
```

局部 owner 负责 destroy。明确绑定 API 的通用数据集可以使用其后端 CRUD 合同；不能把局部静态行当正式场景 fallback。

## 树与验证

TreeManager 负责本地节点、路径、子树与缓存；UI 通过 DataView 树方法协调查询和选择。远程 path/subtree/move 能力必须由真实执行器或端点提供，方法名不证明后端支持。参见 [树指南](TREE_CAPABILITY.md)。

验证应覆盖正式装配、命名视图、级联、无效绑定拒绝、dirty/stale、权限、原回执与销毁。模拟请求测试不能宣称真实后端写入成功。

- [组件开发](COMPONENT_DEVELOPMENT.md)
- [平台 API](../../packages/spark-lowcode-api/README.md)
- [数据包](../../packages/spark-data/README.md)
