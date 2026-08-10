# @spark-appworks/spark-lowcode-api

AppWorks 内可独立发布的 lowcode-jdk17 前端 API。它直接消费后端现有接口，不要求修改或编译依赖 lowcode-jdk17。

## 领域入口

- `api.blueprint`：读取 `Base_NavigationInfo` 记录、GetNavigationMenus 授权证据，以及 legacy 文档导出任务提交。
- `api.dataSpace.design`：读取数据空间及其前端模型、资源字段引用和关系。
- `api.dataSpace.runtime`：以 `FormKey` 查询业务数据，并保留 `allowAdd`、`lingma_sys_key`、`r/e/h/m/d`。
- `api.permission.design`：读取功能标签、数据对象策略和角色/岗位/用户授权；机构按后端真实 `masterId/mastervaluefield` 行为作为授权范围表达。
- `api.permission.runtime`：读取后端对当前用户作出的功能标签与新增权限最终决策。
- `api.catalog`：数据库、表、视图和字典等物理资源目录。
- `api.realtime`：SSE、AI 事件和 `SYSTEM_DOWNLOAD` 下载回执。

设计 API 和运行 API 是独立入口。页面只能通过数据空间的前端模型访问数据；`formKey`、`dataSpaceId`、`modelId`、物理资源名和 Vue 组件键不能互相替代。

本包**不**拥有 AppWorks 项目蓝图领域聚合，也**不**投影壳运行导航；根 `src/lowcode` 把记录与授权证据装配为 `spark-project-model` 编辑树和 `spark-app.RuntimeNavigation`。

## 最小用法

```ts
import { LowcodeApi } from '@spark-appworks/spark-lowcode-api'
import { createRequest } from '@spark-appworks/spark-utils'

const api = new LowcodeApi({ http: createRequest({ timeout: 30_000 }) })

const records = await api.blueprint.readRecords(projectId)
const authorization = await api.blueprint.readNavigationAuthorization(projectId, rootNodeId)

const dataSpace = await api.dataSpace.design.read(dataSpaceId)
const model = dataSpace.models.find(item => item.modelId === modelId)
if (!model) throw new Error('前端模型不存在')

const [data, permission] = await Promise.all([
  api.dataSpace.runtime.query({ formKey, model }),
  api.permission.runtime.read(formKey),
])
```

运行写入必须先调用 `api.dataSpace.runtime.prepareMutation(...)` 形成包含写前镜像和幂等键的受约束命令。该包不发布任意表名、任意 payload 的通用写入口。

lowcode 现有 SRS、功能设计和 SDD 生成器只覆盖旧菜单范围。`submitDocument` 回执的 `coverage` 固定为 `legacy-menu-scope`，不会宣称为完整项目蓝图文档。
