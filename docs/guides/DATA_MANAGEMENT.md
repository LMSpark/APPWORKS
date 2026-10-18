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

宿主装配阶段由ProjectWorkspace读取SysForm/<scenarioId>/pagedata.json，ScenarioViewFile在存储层持有原文，ScenarioViewConfig校验单场景的tables、modelBinding、views、resourceRelations及viewCascades。设计页通过元数据DataView编辑、取消，DataSet提交；文件对象不是业务层的编辑或保存入口。

AI与DevSystem通过工作区loadScenarioDefinitions({scenarioId:T})共享正式C的定义DataSet；按消费需要查询DataView。完整文本编辑由ScenarioDefinitionDocument映射到原定义视图，undo/redo也只恢复这些变更，不执行文件IO。历史列表、预览和快照通过DataView来源历史API；恢复须重新核对所选历史内容，再转换成定义修改并由DataSet保存。未加载或未修改记录不参加普通提交。来源不支持历史时明确报错，不回退页面文件或猜版本端点。

宿主loadScenarioDataSet读取正式空间与绑定模型，校验modelId、模型查询Name、稳定tableName和字段输出，再绑定共享DataSpaceRuntimeApi。原生格式从pagedata.resourceRelations取得模型关系；只有usesNativeResourceRelations=false时读取并适配后端旧关系。模型与关系不能从物理资源目录或运行菜单推断。

模型关系与输入级联分别维护；装配器只接受显式 viewCascades，不从模型关系自动生成。输入取字段原值或选中主键数组，当前行只影响取值定位；字段级联还会用选项查询结果按配置约束子值。完整配置、字符串兼容和失效行为统一见[数据空间主合同第 6 节](../architecture/DATAFLOW_ARCHITECTURE.md#6-两类关系与值级联)。

## 定位与读取

```ts
const view = pageRuntime.resolveView('SCENE@Users@grid')
if (!view) throw new Error('视图不存在')
const rows = view.rows
const current = view.currentRow
const selected = view.selectedRows
```

SCENE 是已声明的真实场景 ID。局部 Users@grid 仅在明确 mainScenarioId 时允许；不自动取首场景。dataViewKey 只定位视图，dataMember 指定 rows/currentRow/selectedRows/total 等输出，dataField 指定对象成员内字段。

组件使用 useSparkComponent 消费 PAGE_RUNTIME；容器向下提供 DATA_SOURCE，行作用域提供 DATA_ROW。响应式 UI 应订阅 DataView 领域事件或使用现有运行态 hook，不仅把 class 成员放进 computed 就假定它会通知 Vue。

## 查询、选择与编辑

以下片段以本次 PageRuntime 已装载、已正式查询的 Users/grid 为前提；SCENE、ROW_ID、name 必须替换为实际身份和获准修改的输出字段：

```ts
const dataSet = pageRuntime.getDataSet('SCENE')
if (!dataSet) throw new Error('场景未装载')
const editingView = dataSet.getView('Users', 'grid')
if (!editingView) throw new Error('视图不存在')
editingView.updateEditingValue('ROW_ID', 'name', '新名称')
const result = await dataSet.saveChanges({
  views: [{ tableName: 'Users', viewId: 'grid', ids: ['ROW_ID'] }],
  applyEditingRows: true,
})
if (!result.success || !result.data || result.data.failedCount > 0 || result.data.failedEditingRows > 0) {
  throw new Error('存在未确认的变更，请检查 result.error 和 result.data?.viewResults')
}
```

还须处理方法抛出的查询身份、权限或请求错误。`DataView.saveChanges()` 只保存已应用的 pending 差异，不自动应用编辑域；DataSet 返回的 CrudResult.data 是跨视图聚合结果。需要只取消编辑覆盖时用 discardEditingRows；已应用差异的放弃见数据包 API 的 discardPendingChanges。不要直接改 rows、注入权限字段或绕过编辑方法。

dirty 视图拒绝配置/结果覆盖；查询失败进入 stale 并暂停编辑。恢复查询前应按业务意图显式丢弃或处理未保存编辑。迟到查询结果不能覆盖新代次。

多份定义依次刷新时，前一次查询完成不代表后续视图仍然干净。定义重读直接调用原DataView刷新并接受覆盖守卫的拒绝，不先调用discardPendingChanges。明确采用远端已经处理了确认范围内的旧草稿；在后续重读期间出现的新修改须保留，提示失败后仍能保存或显式取消。

联合核验的取消范围在点击时确定。模型工作区先由各原owner同步prepareReload/prepareReloadBatch处理本次明确放弃的目标，再依次执行只读核验；不能在等待前项之后用新的pending状态自动放弃后项。反复核验来源替换或数组时，原暂存已清理也须继续保护后续编辑覆盖。原提交确认与当前无修改是两件事：仍有新修改时保留编辑入口并提示未保存，不自动再次提交或关闭参数窗口。

## 权限与保存

页面消费 DataView.fieldAccess 和动作状态，不自行解析签名或制造权限快照。前端没有角色判断；原查询上下文、字段读写与树新增语义统一见[权限体系](../architecture/PERMISSION_SYSTEM.md)。

DataSet.saveChanges 保存明确场景。同模型多视图的不同记录可合批，原查询权限和回执分别保留；重复记录或模型身份冲突拒绝。一次 SPARK save 不保证事务。正式场景拒绝 transaction 模式。详见 [保存动作](SAVE_DATASET_ACTION.md)。

若原来源明确保留未知提交，`DataView.hasUnconfirmedSave`为true。下一次`DataSet.saveChanges`仅核验所选视图的原提交，不应用新编辑或派发其他视图；核验成功后，仍有dirty的修改须再显式保存。取消本地草稿不会取消未知的服务器写入。页面应区分“本轮提交已确认”和“全部修改已保存”，按剩余视图状态显示结果，不以Promise完成推断全部交付完成。

保存成功后的页面收尾不能调用`discardPendingChanges()`清空后续编辑。数据层接纳本轮回执后已保留新修改；页面只释放自己的命令状态，继续消费原视图的pending及当前值。布局编辑也遵循此约束：新坐标仍可见、可取消或再次显式保存；取消应回到已确认坐标，不撤销服务端已经成功的提交。

未知提交仍需原查询身份：本地`discardPendingChanges`后，直接`refresh`、`clearAll`和`resetState`继续拒绝替换结果；先沿原`DataSet.saveChanges`核验。`requestRefresh`会保留延期请求，待核验且剩余修改处理完成后执行一次。需要明确采用远端时，仍通过来源`previewSource/adoptSource`核版本并确认采用，不能用普通刷新替代。

## 局部内存数据

不带 scenarioId 的局部 DataSet 可用于静态组件和纯算法测试，不承担正式平台权限与模型身份。

```ts
import { SparkData } from '@spark-appworks/spark-data'

const local = SparkData.createDataSet({
  dataSetName: 'LocalItems',
  tables: {
    Items: {
      tableName: 'Items',
      resourceType: 'static-data',
      columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
      views: { default: { rows: [{ id: 1 }, { id: 2 }] } },
    },
  },
})
const localView = local.getView('Items', 'default')
// localView 用于本地消费；生命周期结束时释放。
local.destroy()
```

局部 owner 负责 destroy。明确绑定 API 的通用数据集可以使用其后端 CRUD 合同；不能把局部静态行当正式场景 fallback。

## 树与验证

TreeManager 负责本地节点、路径、子树与缓存；UI 通过 DataView 树方法协调查询和选择。远程 path/subtree/move 能力必须由真实执行器或端点提供，方法名不证明后端支持。参见 [树指南](TREE_CAPABILITY.md)。

验证应覆盖正式装配、命名视图、级联、无效绑定拒绝、dirty/stale、权限、原回执与销毁。模拟请求测试不能宣称真实后端写入成功。

- [组件开发](COMPONENT_DEVELOPMENT.md)
- [平台 API](../../packages/spark-lowcode-api/README.md)
- [数据包](../../packages/spark-data/README.md)
