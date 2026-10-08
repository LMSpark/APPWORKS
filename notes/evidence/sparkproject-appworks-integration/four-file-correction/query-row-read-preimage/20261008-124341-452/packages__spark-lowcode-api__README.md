# @spark-appworks/spark-lowcode-api

AppWorks 内可独立发布的 lowcode-jdk17 前端 API。它直接消费后端现有接口，不要求修改或编译依赖 lowcode-jdk17。

## 领域入口

- `api.blueprint`：通过共享原查询/保存 owner 读取、创建、更新和删除 `Base_NavigationInfo` 记录；GetNavigationMenus 授权与 legacy 文档导出保留正式端点。
- `api.dataSpace.design`：读取数据空间及其前端模型、资源字段引用和关系。
- `api.dataSpace.runtime`：按场景 ID 与后端模型 Name 查询；原查询上下文私有保存权限基线，业务行不公开 `lingma_sys_key` / `lingma_sys_params`。
- `api.permission.design`：读取功能标签、数据对象策略和角色/岗位/用户授权；机构按后端真实 `masterId/mastervaluefield` 行为作为授权范围表达。
- `api.permission.runtime`：读取后端对当前用户作出的功能标签与新增权限最终决策。
- `api.catalog`：数据库、表、视图和字典等物理资源目录。
- `api.realtime`：SSE、AI 事件和 `SYSTEM_DOWNLOAD` 下载回执。

设计 API 和运行 API 是独立入口。页面只能通过数据空间的前端模型访问数据；`formKey`、`dataSpaceId`、`modelId`、物理资源名和 Vue 组件键不能互相替代。

`LowcodeApi.readRequestScope()` 从现有登录与选中应用生成请求范围。`X-AppId` 的值为选中应用的 `application.id`；应用与租户由请求层提供，不写入业务数据或场景 JSON。数据空间运行查询、设计文件读取与上传消费同一范围；身份变化后拒绝旧结果，已发出的写入不自动重试或声称回滚。

宿主 `createLowcodeProjectGateways` 向 `ProjectWorkspace` 提供场景文件读写，固定为 `designfile / <appId>/SysForm/<scenarioId> / pagedata.json`；工作区所属应用必须与请求层 `X-AppId` 一致。后端沿用现有规则确定可信所有者租户目录，前端不拼租户目录、不改租户权限。ScenarioViewFile 持写前原文与提交字节读回基线，设计器与 PageRuntime 分别经工作区和宿主装配消费场景配置。

`LowcodeDesignFileUpload` 的工作文件与版本快照均以 multipart 上传并下载原字节核对，空文本保持为空。快照请求禁止覆盖，且检查后端返回 `filePath` 的最终文件名；后端重名另存时 `fileName` 仍是原请求名，不能凭它确认版本。确认失败不自动重试、不切换正式版本指针，也不宣称已发出的写入回滚。后端没有 CAS，禁止覆盖模式不构成并发原子创建保证。宿主工具工作保存和 `N__文件名` 恢复已消费这套上传确认，恢复不切蓝图VersionId；版本列表、创建/删除和运行发布读取仍未接通，不新增JSON台账。

本包**不**拥有 AppWorks 项目蓝图领域聚合，也**不**投影壳运行导航；根 `src/lowcode` 把记录与授权证据装配为 `spark-project-model` 编辑树和 `spark-app.RuntimeNavigation`。

蓝图种类从后端 `conType` 读取：`Model/Navitem` 对应 `module/page`，其余正式种类为 `embedded/service/content`。缺失或未知值保留为草稿 `unknown`，不读取旧 `BlueprintNodeKind` 字段，也不根据根节点或路径推测种类。

`readRecords` 返回 `nodeId/parentNodeId/kind` 与 `capability/navigation/dataSpace/prototype` 四组，不再返回平铺标题、场景或工具字段。能力名来自 `name`（未配置时按 SPARK 使用 `FunName`），能力描述来自 `memo`；空描述省略，不回退读取旧 `description`。导航标题来自 `FunName`，目标来自 `NavigationUrl`，场景来自 `conid`。空场景、空原型不生成对应组；模型注册名需由正式场景定义补齐，导航行本身不提供它们。`source` 只含消费行，用于写后确认及估算、版本等尚未归入四组的字段；签名与权限只由私有原查询上下文持有，不公开、不接受调用方替换。蓝图 CRUD 的设计场景沿用原 AppWorks 的 `7AB874097A1E8711A42FD845939A6E05`，按项目过滤并完整分页读取，登录或应用作用域改变后拒绝旧结果。

宿主消费分组记录投影菜单；节点、工具和场景身份分别由正式字段提供。场景 ID 是 `scenarioId` 调用参数，不改变 `navigation.target`；PageRuntime 持每次调用的独立数据。导航投影测试只证明导航合同，不能代替浏览器与真实后端联调。

## 最小用法

查询与保存前须由既有登录和选中应用流程填充请求范围；下面变量来自调用方真实选择。

```ts
import { LowcodeApi } from '@spark-appworks/spark-lowcode-api'
import { createRequest } from '@spark-appworks/spark-utils'

const api = new LowcodeApi({ http: createRequest({ timeout: 30_000 }) })

const records = await api.blueprint.readRecords(projectId)
const authorization = await api.blueprint.readNavigationAuthorization(projectId, rootNodeId)

const model = await api.dataSpace.design.readModel({
  designScenarioId, dataSpaceId: scenarioId, metaName,
})
const data = await api.dataSpace.runtime.query(
  { scenarioId, metaName: model.metaName },
  { page: { index: 1, size: 20 } },
)
```

`query` 使用后端注册模型，不重发物理表、来源类型和主键定义；支持完整过滤、值函数、输入参数、字段、排序、树参数和分页。全页查询在所有页通过后返回上下文。返回的原上下文由 DataView 的执行边界持有，组件不直接消费它；应用或登录身份变化后，数据读取和权限消费均拒绝旧上下文。

宿主 `loadScenarioDataSet` 读取正式模型和关系后，`LowcodeDataSpaceAssembler` 用 `api.dataSpace.runtime.bindModelView(view, model)` 绑定正式定义与实际 owner；`executeQuery(view, params)` 从 DataView 提取场景和模型 Name，将命名输入、完整过滤、字段投影、排序、正整数分页及显式树参数交给同一查询生命周期。不再配置 CRUD list 或 prepare/parse 查询转换；自动级联仍由 DataView 合并后送入同一过滤编码器。未知查询参数、无效排序和空的显式字段列表在请求前报错。

字段配置遵守后端正式模型定义，页面表达式不构成后端定义覆盖保证；后端默认输出模式仍为 MODEL。组件与脚本已通过 DataView 消费原查询权限；正式模型输出由场景文件指定的 modelId/模型 Name 装配，每份文件只描述一个场景及其多视图、viewCascades；多场景由 PageRuntime 的独立调用装载。运行侧旧查询封包、解析快照和 mutation prepare 入口已删除，运行查询与保存统一使用 DataSpaceRuntimeApi 的实际执行链；权限及凭据保留在私有查询上下文中，不公开写前镜像。当前验证为模拟传输，尚不能宣称页面整体或真实后端联调完成。

API 内部查询上下文已具备原 SPARK 保存封包规则：剔除调用方权限字段和前端 `_pk`，从私有查询快照回放新增模型凭据或唯一原行凭据；异构新增按连续字段集合分组，显式动作顺序完整保留。更新先对照原查询强引用基线生成实际差异，删除使用唯一原查询行；未知/重复基线、重复删除和任一明确请求模型无实际差异在发送前拒绝整批；不会借其他模型的有效修改把无效模型报为成功。DataView 在组批前排除已改回强基线的模型，不把它们作为本次请求目标。它不按前端 E 集合裁剪业务候选值，最终由后端验证。内部请求执行器已验证同场景多个模型一次发送、请求层注入应用和场景、跨场景及重复模型拒绝、写请求不重试，以及请求/查询上下文失效和响应显式失败拒绝。动作回执按本次请求顺序核对资源桶、同模型分段身份和行数，不用内部表名代替模型 Name。更新回执只合并原查询行与实际返回字段，缺少主键时使用发送前捕获的对应提交身份；删除回执必须明确返回正式主键。重复或超出本次提交范围的回执行拒绝，返回行剔除权限凭据及 `_pk`，不修改原查询基线。DataView 保存已消费新上下文和字段回执，DataSet 同场景多模型已通过 class 内私有基线捕获统一一次保存；批量失败保留待提交状态，真实回执确认前先验证全部视图身份和回执，保存期间再次编辑仍保留；组件不能取得底层上下文或封包凭据。

运行 owner 的 `save` 已消费上述请求与新基线。它只接受本 owner 发出的当前查询上下文；同场景多模型一次发送，重叠模型保存串行，互不重叠的模型独立执行，同模型查询与保存互相等待。排队前捕获业务值及取消信号，等待后复查范围和基线归属；成功后登记新上下文，原上下文保留读数据但不再作下一次保存基线，失败或取消不自动重试。

内部保存请求返回每模型真实动作行及独立的新查询上下文。新基线保留原查询行权限与凭据，新增行采用原模型凭据；新增回执缺少正式主键或与保留行、其他新增行冲突时拒绝。基线按实际新增、更新、删除及总数推进，深克隆并冻结返回值，旧上下文保持原状。changedFields 保留每条更新实际返回的字段名，区别未返回字段与明确返回旧值；该证据冻结并排除权限凭据和 _pk，不能从合并后的整行推导。DataView 已消费该证据确认未再次修改的字段，保留后续编辑及未确认字段，并采用新上下文继续保存。

`api.dataSpace.design.readModel({ designScenarioId, dataSpaceId, metaName, assertCurrent? })` 读取选定正式模型：校验唯一记录与场景归属，收齐字段分页；数据库表只核对该来源的业务主键，其他来源依模型声明验证输出主键。结果的 `primaryKey` 是已核对的输出字段名，`metaName` 是查询模型 Name，`sourceName` 是来源名，三者不能替代；结构化 Filter/ValueFun 等原值保留。无效或计算主键、别名冲突、不完整读回和旧请求范围明确失败，不凭 `id` 惯例、租户隔离字段或页面快照补造主键。宿主已直接消费该入口；既有全目录设计读不是运行装配的替代入口，关系读取也不包含在 `readModel` 中。

`api.dataSpace.design.readRelations({ designScenarioId, dataSpaceId, assertCurrent? })` 完整分页读取当前场景的正式关系，核对归属与记录 ID 唯一性。返回的 `filterExpression` 是经唯一 wire codec 解码的 `DataViewFilter`，保留 AND/OR 结构和完整值函数；无效定义和过期身份明确失败。模型、视图及字段引用仍须由场景装配核对，此入口不自行生成或启动级联。

`api.dataSpace.design.readModels({ designScenarioId, dataSpaceId, assertCurrent? })` 按真实 dataSetId 完整分页读取 Base_DataModel，验证场景归属、记录 ID 和 Name 唯一性，再逐个复用 readModel 验证正式字段与主键。发现与读回之间模型 ID 改变时拒绝，空场景返回空集合，不造默认模型。它服务明确创建场景视图草稿的消费者，不借全物理目录补猜定义。

lowcode 现有 SRS、功能设计和 SDD 生成器只覆盖旧菜单范围。`submitDocument` 回执的 `coverage` 固定为 `legacy-menu-scope`，不会宣称为完整项目蓝图文档。

正式模型的 `canonicalName`（AsName 或 Name）用于消费行和视图字段；查询字段、过滤、排序、树字段以及保存字段向正式 Name 的映射由 API 持有。原快照、权限和签名保持原样；主键定位使用已核对的模型输出字段。新增缺少正式 keyField 时拒绝，单键为空时使用 32 位大写 GUID；不猜联合业务键，`_pk` 永不提交。模拟回归覆盖这些规则，未执行真实后端写入。

已发现后端真实边界：Java 的 MODEL 输出别名与物理更新字段、稀疏 E 签名仍可能不一致。前端不能改写签名或授权集合来绕过它；保存向正式 Name 转换后仍交原 Java 强验证裁决，不能将模拟测试称为带别名模型的后端写入成功。
