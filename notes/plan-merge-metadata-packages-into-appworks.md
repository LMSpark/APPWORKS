状态：superseded

> 替代计划：`notes/plan-lowcode-frontend-api-cutover.md`。本计划仍保留兼容式包内适配、旧服务过渡和 Metadata 归并假设，与用户最终确认的“新增可发布 `spark-lowcode-api`、不保留兼容层、全部前端功能直接语义对接 lowcode、退役本仓后端”不一致，禁止按本文件实施。

# Metadata 包体系整合进 AppWorks 完整方案

## 任务目标

以 `D:\SPARK_AppWorks` 为唯一前端主工程和 `@spark-appworks/*` 主包体系，全量整合 `E:\R\sparkproject\apps\metadata` 的页面与真实依赖能力；浏览器统一通过同源 `/api` 访问 `E:\lowcode-jdk17` 的 gateway，由 gateway 路由到 mainbody、file、register、license 及环境中实际可用的流程、QYAPI、SSE、AI 服务；全程不修改 lowcode 后端代码和配置，最终删除本仓 `spark-ai-server`，并生成前后端独立构建的统一发布目录。

## 一、不可变边界

1. 可写交付仓只有 `D:\SPARK_AppWorks`；`E:\R\sparkproject` 和 `E:\lowcode-jdk17` 的源码保持只读。
2. AppWorks 是主应用、主壳、主路由和主包命名空间；不得长期保留第二套 Metadata 应用或 `@spark-template/*` 平行公共面。
3. 同职责能力以 AppWorks 当前公共接口和实现为主体，按差异吸收源能力；不得目录级覆盖、盲复制或用源 lockfile 覆盖目标 lockfile。
4. 浏览器只请求同源 `/api`；不得暴露 mainbody、file、register、license 的物理地址。
5. 后端不改 Java、POM、Nacos、数据库和部署配置；后端真实路由以当前部署环境 Nacos 为准。
6. QYAPI 权限结果是唯一事实源。AppWorks 可组织菜单和路由，但不得在页面层合并角色、扩大权限或把 `r/e/h/m/d` 压成单选状态。
7. `spark-ai-server` 明确退休，但物理删除是最后一个独立闭环，必须在新链路通过验证并再次确认删除清单后执行。
8. 三仓现有未提交内容均受保护；不 commit、不 push、不建分支、不格式化无关文件。

## 二、目标架构

```text
Browser
  -> AppWorks shell / router / runtime
     -> AppWorks Metadata feature domains
     -> @spark-appworks/spark-app
     -> @spark-appworks/spark-data
     -> @spark-appworks/spark-component
     -> @spark-appworks/spark-ai
     -> @spark-appworks/spark-utils
          |
          +-- same-origin /api
                 |
                 v
           lowcode-gateway
             +-- lowcode-mainbody: auth / QYAPI / flow / business APIs
             +-- lowcode-file: upload / download / design files
             +-- lowcode-ent-register: enterprise registration boundary
             +-- lowcode-license-center: license boundary
             +-- environment routes: SSE / AI and other Nacos services
```

AppWorks 运行时是前端配置唯一入口：开发时由 Vite 把 `/api` 代理到 gateway；生产时由同源 Web Server/Nginx 转发 `/api`，SPA fallback 不得吞掉 API 和 SSE。

## 三、包级合并矩阵

源包只作为能力来源，最终导出必须收口到 `@spark-appworks/*`：

| Metadata 源包 | AppWorks 目标包/领域 | 合并方式 | 关键约束 |
|---|---|---|---|
| `core`、`http`、`security` | `packages/spark-utils/src/http/`、`security/` | 吸收无状态传输、安全原语 | 不引入第二个 HTTP 客户端门面；禁止产品代码裸 `fetch/axios` |
| `config`、`communication` | `packages/spark-app/src/config/`、`runtime/` | 由 AppWorks runtime 组合 | Metadata 不读取私有 env；统一消费 AppWorks 运行时上下文 |
| `auth-api`、`auth-ui` | `packages/spark-app/src/auth/` + `packages/spark-component/src/auth/` | 拆分数据协议和 UI | 登录/资料/刷新/退出统一适配 `/api/LoginAuthority/*`；修复源登出方法/路径错配 |
| `navigation`、`admin-shell` | `packages/spark-app/src/navigation/`、`shell/` | 合入现有路由和壳 | AppWorks 管理菜单、路由、页签；不建立第二个 Router |
| `realtime`、`vue-runtime` | `packages/spark-app/src/realtime/`、`runtime/` | 合入应用生命周期 | 单例会话、可取消、可重连；不得重复安装 Pinia/Router |
| `qyapi` | `packages/spark-data/src/qyapi/` | 作为 lowcode 数据适配领域 | 保留操作标识、部分失败、字段读写、行删除和 `allowAdd` 语义 |
| `design-tokens`、`ui-contracts`、`ui` | `packages/spark-component/src/foundation/` | 吸收令牌、契约和基础组件 | 不建立平行 UI 基座；显式导出，禁止 `export *` |
| `organization-ui`、`qyapi-ui`、`business-table-ui` | `packages/spark-component/src/business/` | 按组织/QYAPI/表格子领域归并 | UI 只消费数据与权限结果，不自行访问物理端点 |
| `graph-ui`、`report-ui` | `packages/spark-component/src/editors/` | 按流程图和报表编辑器归并 | LogicFlow、ECharts、XLSX 等版本进入目标 catalog 单点管理 |
| `ai-ui` | `packages/spark-component/src/ai/` | 合入现有 AI 展示层 | UI 与 AI 传输/会话契约分离 |
| Metadata AI/SSE 调用代码 | `packages/spark-ai/src/lowcode/` | 新增 lowcode adapter，保留有消费者的 AppWorks AI 领域面 | 请求 `/api/sap/agent-loop` 和 `/api/sse/connect`；清退 Host Run 后端协议消费者 |

默认不新增第九个工作区包。如逐文件审计证明某能力同时不属于上述领域且存在独立消费者，必须回到本计划修订并单独审核，不能临时新增包。

## 四、应用页面整合

Metadata 不作为 `apps/metadata` 子应用落地。其页面按业务领域迁入 AppWorks 根应用：

| 目标域 | Metadata 页面族 |
|---|---|
| `src/features/metadata/home/` | 首页和工作台 |
| `src/features/metadata/identity/` | 登录相关页面、用户、角色、组织、应用授权 |
| `src/features/metadata/catalog/` | 数据库、表、视图、字段、关系和元数据目录 |
| `src/features/metadata/dataset/` | 数据集、JSON、半结构化数据、字典与编码 |
| `src/features/metadata/workflow/` | 流程设计、运行、表单关系与流程监控 |
| `src/features/metadata/file/` | 文件、Excel 和设计文件能力 |
| `src/features/metadata/report/` | 报表管理、设计、预览与导出 |
| `src/features/metadata/api/` | API 提供者、接口与配置管理 |
| `src/features/metadata/system/` | 缓存、任务、脱敏、系统支持和平台配置 |
| `src/features/metadata/ai/` | Metadata 场景内 AI 入口与流式展示 |

整合规则：

- 保留 AppWorks 的 `src/main.ts`、`App.vue`、layout 和路由注册主链，只增加 Metadata feature registration。
- Metadata 自带 layout、bootstrap、Router、Pinia 初始化不得作为第二套根运行时迁入；其可复用视觉和业务组件拆入对应 AppWorks 包。
- Metadata 全部现有页面必须在合并清单中获得 `migrate / merge / replace / retire` 之一的明确处置；“未映射即跳过”不允许。
- 菜单条目统一注册到 AppWorks 导航模型，权限值来自 lowcode/QYAPI；未知后端组件键显示明确不可用状态，不映射到错误页面。

## 五、认证、运行时与协议适配

### 5.1 AppWorks 运行时

新增一个 AppWorks lowcode runtime adapter，对 Metadata 只暴露标准化上下文：

- `apiPrefix` 固定为浏览器相对 `/api`。
- `gatewayTarget` 仅供开发服务器和发布装配使用，不进入浏览器业务代码。
- 用户、企业、应用、账套和双 Token 由 AppWorks auth/runtime 统一维护；旧 `tenantId/projectId` 只是 URL 兼容投影，不再作为完整身份模型。
- Metadata 原有硬编码 `NewApp`、GUID 和代理域名全部由 adapter 消除；无运行时值时显式失败，不静默回退到源默认值。

标准运行时上下文至少保留以下互不替代的稳定键：

| 维度 | 规范字段 | lowcode 来源 | 用途 |
|---|---|---|---|
| 企业 | `enterprise.id` | `entinfo.rowid` | 企业稳定主键、审计 |
| 企业 | `enterprise.shortName` | 登录结果/Token 的企业短名 | QY 会话与文件分区；拟映射 URL `tenantId` |
| 企业 | `enterprise.name` | `entinfo.Name/CName` | 登录选择和展示 |
| 应用 | `application.id` | `Base_AppSystemList.rowid` | `Base_NavigationInfo.sysid` 筛选；拟映射 URL `projectId` |
| 应用 | `application.code` | `Base_AppSystemList.AppName` | 应用代码、配置与展示，不替代 ID |
| 账套 | `accountSet.id` | 用户信息中的账套字段，存在时读取 | 独立业务维度，不替代企业/应用 |
| 用户 | `user.id` | lowcode userinfo | 用户、角色、组织上下文 |
| 会话 | `accessToken/refreshToken` | LoginAuthority | Authorization 与刷新；不写入页面/数据文件 |

`tenantId=enterprise.shortName`、`projectId=application.id` 是基于当前控制器、Token、文件分区和导航查询代码得到的目标映射；实施前必须用一次真实登录、应用目录和导航树只读回读确认。确认不一致时停在身份闭环修订计划，禁止靠兼容别名猜测。

### 5.2 认证契约

| 动作 | lowcode 契约 | 前端处置 |
|---|---|---|
| 登录 | `POST /api/LoginAuthority/UserLoginByEnt` | AppWorks auth adapter 统一调用 |
| 用户信息 | `GET /api/LoginAuthority/GetUserInfo` | 标准化为 AppWorks session user |
| 刷新 | `POST /api/LoginAuthority/refresh` | 单飞刷新，失败统一清会话 |
| 退出 | `GET /api/LoginAuthority/UserLogoutByEnt` | 替换源 `POST /system/auth/logout`，后端不改 |

### 5.3 数据、文件、流程与实时协议

- QYAPI 查询：`/api/DataOperation/GetData`，由 QY 数据空间适配器构造完整 `DataTable` wire 请求。
- QYAPI 写入：`/api/DataOperation/BatchTableOperateRequestByCRUD`，保留原始行基线、系统签名和批次部分失败。
- 文件：统一由 `/api/File/*` facade 处理页面表现文件、业务附件、Excel 和流程设计文件；数据空间不进入文件系统。
- 流程：使用 `/api/Flow/*`、`/api/Workflow/*` 及 file 中现有流程设计文件契约。
- SSE：以 `/api/sse/connect` 为实时连接入口，验证代理禁用缓冲、断线重连和 Token 失效行为。
- AI：以 `/api/sap/agent-loop` 为已证实的 Metadata AI 契约；MCP/其他 AI 路由只有在当前 Nacos 环境证实后才进入可交付清单。
- register/license：保留 gateway 后的服务边界和可达性诊断，不凭空新增 Metadata 当前不存在的运维页面。

## 六、数据平面详细设计

### 6.1 QY DataSet 对齐 AppWorks DataSet

| 对象 | 所属层 | 负责 | 不负责 |
|---|---|---|---|
| QY `Base_DataSet` | 后端 DataSet 定义/SSOT | `rowid`、名称、入参、前端模型/字段/关系集合 | 页面布局、组件状态、前端选择态 |
| AppWorks `DataSet` | QY DataSet 的前端运行时模型 | 保留 QY `dataSourceId` 绑定，组织 `DataTable/DataView`、主从关系、过滤分页、编辑态、自动加载、保存编排、`PAGE_DATASET` | 持久定义后端 DataSet、决定权限 |
| QY 前端模型（`Base_DataModel`） | 后端定义的页面模型 | 模型稳定 ID、Type、Name、MetaName、DbName、字段与 CRUD 目标 | AppWorks 选择态和组件状态 |
| QY 查询结果 | 后端事实 | 行、原始行、总数、`allowAdd`、`lingma_sys_key`、`r/e/h/m/d` | 页面本地角色推导 |

主映射固定为三层直接对接：`QY DataSet -> AppWorks DataSet`、`QY 前端模型 -> AppWorks DataTable`、`QY 接口 datasource -> AppWorks DataSource`。不新增 `QyDataSet/QyDataTable/QyDataSource` 平行领域模型；QY 代码只负责 wire 解析和请求执行。三层都在现有 AppWorks 对象上保留后端稳定身份，禁止跨层复用同一个含糊 ID。

整合后的主链没有 `pagedata.json`：

```text
Base_NavigationInfo
  dataSourceId (datasource binding) + scenarioFormKey (scenario context)
          |
          v
QY metadata loader
  -> 读取 Base_DataSet / Base_DataModel / Field / Relation
  -> 校验数据空间和模型稳定 ID
  -> 直接构造 AppWorks DataSet
  -> 每个 QY 前端模型直接构造一个 AppWorks DataTable
  -> AppWorks DataSet 组织这些 DataTable、DataView 和 Relation
  -> 现有 CrudService 按 DataTable 来源执行 QY wire 请求
          |
          v
QY interface -> AppWorks DataTable.execQueryResult -> DataSource snapshot
  -> rows/originalRows/total/allowAdd/lingma_sys_key/r/e/h/m/d
          |
          v
SparkPageRenderer -> PAGE_DATASET -> RendererForm/Table/Tree
```

### 6.2 页面到 datasource 的直接绑定

`ProjectNodeData` 直接补齐后端导航已经存在的两个稳定字段；它们不是 QY wire payload，也不再包一层平行 binding 对象：

```ts
type ProjectNodeData = {
  // 现有 id/title/path/nodeKind 等字段继续保留
  dataSourceId?: string
  scenarioFormKey?: string
}
```

绑定规则：

1. `dataSourceId` 和 `scenarioFormKey` 从 `Base_NavigationInfo` 分别读取；不得用页面 ID、AppWorks `dataSetName` 或硬编码 GUID 补齐。
2. `dataSourceId` 是 datasource 主绑定键，必须能回读唯一 `Base_DataSet.rowid`；空值、找不到或多义时页面 fail-fast，并显示“导航未绑定有效 datasource”。
3. `scenarioFormKey` 只作为后端场景/FormKey 上下文保留；不得用它代替 `dataSourceId` 查 datasource。若真实导航回读证明两者按约定相等，也仍保留两个字段并做一致性校验，不在前端合并为一个含糊 ID。
4. `QyDataSpaceDesignApi.getSnapshot(dataSourceId)` 读取模型、字段、关系；页面不自行直查四张元数据表并拼装半套模型。
5. 每个 QY 前端模型一对一生成一个 AppWorks `DataTable`，直接使用 `Base_DataModel.rowid` 作为 `DataTable.modelId`；`Name/MetaName/DbName/Type` 是回读快照的一部分，用于校验和 wire 构造，不允许由页面输入覆盖。
6. 同一物理资源可以按后端定义绑定到多个 QY 前端模型，此时必须保留为多个 AppWorks `DataTable`；禁止按 `DbName/MetaName` 去重合并，因为模型字段、别名、关系和权限上下文可能不同。
7. datasource 入参从 `Base_DataSet.inputParams` 与 AppWorks route/module context 解析。缺少必填入参时不发查询，由页面上下文选择器提示用户补齐。
8. QY datasource 快照只在企业+应用+dataSourceId 作用域内缓存；登录、企业或应用切换必须清空，禁止跨租户复用。

### 6.3 QY DataSet 和前端模型直接构造 AppWorks DataSet/DataTable

编译映射：

| QY 元数据 | AppWorks 运行态 | 规则 |
|---|---|---|
| `Base_DataSet.rowid` | `DataSet.dataSourceId` | 来自导航 `dataSourceId`，是 QY DataSet 与 AppWorks DataSet 的稳定绑定，不冒充名称 |
| `Base_DataSet.Name` | `DataSet.dataSetName` | 仅展示/诊断名 |
| `Base_DataModel.rowid` | `DataTable.modelId` | QY 前端模型与 AppWorks DataTable 的唯一绑定键 |
| `Base_DataModel.Name` | `DataTable.tableName` | 一模型一 DataTable；同一空间内重名直接报错，不自动改名 |
| `Type/MetaName/DbName` | QY table descriptor | 仅由快照生成，页面只读 |
| `Base_DataModel_Field` | `DataColumn[]` | 类型、别名、主键、顺序、输出和静态必填等元数据；运行时权限另算 |
| `Base_DataModel_Relation` | `TableRelation/ViewDependency` | 按父子模型 ID 解析；缺失模型引用时整份快照无效 |
| 主模型标志 | default 主视图自动加载候选 | 只有入参满足才触发 `autoLoad` |

不得把 QYAPI 伪装成一组普通 REST URL 塞入现有 `CrudApi`，也不新增公开的 QY CRUD 领域模型。目标是让现有 `CrudService` 根据 `DataTable` 的来源元数据选择 REST 或 QY 执行策略；`DataView` 继续通过同一 CRUD 委托执行 list/create/update/delete，QY 协议目录只负责 wire 转换、原始行基线、系统键和部分失败解析。

### 6.4 查询、编辑和保存时序

1. 路由解析企业、应用、导航节点和 QY 页面绑定。
2. loader 只读回读数据空间快照并编译 AppWorks `DataSet`。
3. 主表 `requestData()` 把 AppWorks 的分页、排序、过滤、父子依赖和 datasource 入参转换成 QY `DataTable` 请求。
4. AppWorks `DataTable.execQueryResult` 接收真实响应并一次注册到其 DataView/DataSource：rows、originalRows、total、`allowAdd`、表级 `lingma_sys_key`，以及每行原样携带的 `lingma_sys_key`、`lingma_sys_params.r/e/h/m/d`。
5. UI 读取同一个 AppWorks `DataView` 暴露的 `DataSource`；不得另建页面 store、adapter 私有权限缓存或 `_perm` 镜像保存第二份业务行/权限数据。
6. 新增走 QY create；更新用 originalRows 计算差异并回传 `lingma_sys_key`；删除必须使用稳定主键和后端 `d` 权限。
7. 保存成功后用后端返回行替换本地行和基线；部分失败保留失败项编辑态并逐项显示，禁止整体假成功。
8. 主从 staged save 保留 AppWorks 父先子后编排；只有 lowcode 现有接口证明支持同一事务时才启用 transaction 模式，否则显式逐表提交并报告部分成功。

### 6.5 AppWorks DataSource 与 QY 接口结果直接看齐

直接扩展 `packages/spark-data/src/types.ts` 的现有 `DataRow` 与 `DataSource`；不新建平行 DataSource，不改写后端字段名，不压缩原始权限：

```ts
type QyAuthSet = Readonly<{
  r: readonly string[]
  e: readonly string[]
  h: readonly string[]
  m: readonly string[]
  d?: boolean
}>

type DataRow = Record<string, unknown> & {
  lingma_sys_key?: string
  lingma_sys_params?: Partial<QyAuthSet>
}

type DataSource = {
  // 现有 rows/columns/tableName/requestState/currentRow/selectedRows 等字段继续保留
  originalRows?: readonly DataRow[]
  allowAdd?: boolean
  lingma_sys_key?: string
}
```

AppWorks `DataSet.dataSourceId` 与 `DataTable.modelId` 直接保存两层稳定身份，QY 接口结果由现有 DataView/DataSource 直接承接。`DataTable.execQueryResult` 是唯一注册入口：每次查询用一个不可分割的 snapshot 同步替换 DataSource 的数据、基线、总数和权限；非 QY datasource 可以不提供这些可选字段，QY datasource 缺失它们时 fail-closed。禁止先写 rows、稍后再补权限造成短暂放权。原始字段用于回传和审计，派生 getter 仅提供 UI 友好的 `read/write/required/actionState`，不得删除或改写 `r/e/h/m/d`。

### 6.6 权限 SSOT 的完整投影

| 层级 | lowcode/QY 来源 | AppWorks 消费结果 |
|---|---|---|
| 表 | DataSource `allowAdd` | 新增按钮 hidden/disabled/enabled；缺失时 QY 页面 fail-closed |
| 行 | DataSource row `lingma_sys_params.d` | 该行删除权限 |
| 字段读 | DataSource row `h` / `m` / 两者均无 | hidden / masked / visible |
| 字段写 | DataSource row `r` / `e` / 两者均无 | required+editable / editable / readonly |
| 回传校验 | DataSource/row `lingma_sys_key` + `originalRows` | 更新/删除防篡改上下文，不展示、不持久到文件 |

QY 权限投影不压成单选枚举：读、写两个通道独立计算；`r/e/h/m/d` 是五个稀疏集合。组件层只消费投影结果，不注册角色规则。批量编辑、删除、导出等动作对全部选中表/行/字段最小单元取交集，再与业务可用性相交。

### 6.7 数据层无文件后的 PageNode 结构

页面内容分为两个明确 profile：

| profile | 表现文件 | 数据来源 | 用途 |
|---|---|---|---|
| `qy-data-source` | `rule.json`、`script.js`、`style.css` | `dataSourceId` 绑定 QY datasource，接口结果进入 DataSource | 整合后的正式运行路径 |
| `legacy-file-data` | 现有四文件，含 `pagedata.json` | 旧 AppWorks 页面文件 | 仅为未迁移旧页面保留的兼容路径；不得用于新 QY 页面 |

`ConfigPageNode` 不再把数据文件当作所有页面的必备子模型：QY profile 的 load 分支直接构造 `DataSet`，legacy profile 才使用 `PageDataSetFile`。`SparkPageRenderer` 继续只接收 `PageNodeRenderConfig.data`，因此组件树和 `PAGE_DATASET` 公共面保持稳定。

## 七、文件系统详细设计

### 7.1 存储分类

| 内容 | 存储 | 企业隔离 | 索引/归属 |
|---|---|---|---|
| QY 业务行、模型、字段、关系、权限 | QYAPI | Token/企业数据库上下文 | QY 稳定 ID；无文件 |
| 页面 `rule/script/style` | lowcode-file `designfile` | `isCrossEnt=false`，后端按企业短名分区 | 应用 ID + 页面 ID |
| 数据空间设计器画布布局 | lowcode-file 设计 artifact（如保留） | 企业分区 | `dataSourceId`；仅布局，不是数据 SSOT |
| 普通附件 | lowcode-file | 默认企业分区 | 已存在且经回读确认的 QY 附件资源；不可用 sessionStorage |
| 流程设计 | lowcode-file FlowDesign API | lowcode 现有逻辑 | `flowModId` |
| AI 上传文件 | lowcode 现有 AI/file 契约 | 由目标接口决定 | 会话/工具返回的稳定引用；不能用普通路径冒充 |

### 7.2 页面表现文件路径

目标逻辑键为 `{enterpriseShortName, applicationId, pageId, filename}`。浏览器只提交 `applicationId/pageId/filename` 和 `isCrossEnt=false`，企业根目录由 lowcode-file 根据登录上下文添加，前端禁止把企业短名再次拼入物理路径。

建议逻辑位置为 `appworks/{applicationId}/{pageId}/{filename}`、`appType=designfile`、`isReplace=true`。该字符串是前端路径策略，不是已确认的物理磁盘路径；实施时必须通过上传回执、文本读取和列表接口验证一次，若后端实际组合规则不同，只改 frontend adapter，不改后端。

QY 页面创建/删除只处理三个表现文件：创建写入空 rule/script/style，删除逐文件调用 lowcode-file 已有删除能力。lowcode 没有与 AppWorks 当前 `__versions` 完全等价的接口，因此页面文件版本功能在首期标记为 capability gap；未找到现有 QY 版本资源前，禁止伪造版本列表或在浏览器本地保存版本。

### 7.3 普通文件管理

Metadata 当前文件管理页的 sessionStorage 目录必须退休。目标实现分两级：

1. 用 `/api/File/list` 显示一个明确文件夹的物理内容，仅依赖它实际返回的 name/lastModified 等字段。
2. 需要业务归属、全文搜索、标签、大小、hash、创建人、软删除或跨目录查询时，必须绑定已有 QY 文件元数据资源；若真实环境未提供该资源，页面只提供受限目录视图并明确能力缺口，不在前端新造“持久目录”。

上传后保存后端返回的相对路径；下载、读取、删除都从该回执或 QY 元数据还原 `appType/customPath/fileName/isCrossEnt`。不得像源 `FileManager.ts` 一样把包含文件名的完整 path 再作为 `customPath` 传给删除接口。

## 八、导航、应用和页面装配

### 8.1 应用与导航映射

1. 登录成功后读取允许访问的 `Base_AppSystemList` 应用目录；当前应用以 `application.id=rowid` 选择。
2. 用 `Base_NavigationInfo.sysid=application.id` 读取树；`rowid/prowid` 映射 AppWorks 节点 ID/父 ID。
3. `FunName/folderName/NavigationUrl/NavigationType` 规范化为 AppWorks title/path/nodeKind；不能识别的节点显示显式错误页。
4. `dataSourceId/scenarioFormKey` 作为 `ProjectNodeData` 直接字段随节点进入动态路由。
5. `packages/spark-app/src/router/dynamic.ts` 创建运行页时必须传完整 node，不能只传 `pageId` 后丢失数据空间绑定。
6. Metadata 自身管理页面作为 AppWorks `system-page` 注册；QY 配置页面作为 AppWorks config page，由三表现文件 + QY DataSet 渲染。

### 8.2 切换与失效

企业切换等同重新登录；应用切换更新 URL/application context，然后按顺序清空导航、PageNode、QY snapshot、DataSet rows、SSE/AI 会话缓存，再重新加载。任何旧企业/旧应用的 in-flight 请求响应在 context revision 不匹配时丢弃，不能写入新页面状态。

### 8.3 流程直接接入边界

流程拆成三种现有后端事实，前端不得混成一个“workflow 文件”：

| 能力 | lowcode 契约 | AppWorks 所有者 |
|---|---|---|
| 流程设计内容 | `/api/File/GetFlowDesignInfo/{flowModId}`、`/api/File/SaveFlowDesignInfo` | `spark-app` workflow runtime + `spark-component` graph editor；稳定键 `flowModId` |
| 流程与表单关系 | `/api/Flow/SaveFlowAndFormRelation/{flowId}` | workflow application service；表单场景只引用稳定 FormKey/dataSourceId |
| 人工流程运行 | `/api/Flow/FlowSubmitOrStart`、Revoke、Back、ToCreator、AddReceiveUser 等现有端点 | 页面 action/runtime；操作前消费后端可用性和权限 |
| 自动工作流运行/测试 | `/api/Workflow/Run/{workflowId}` 及现有 test 端点 | 独立 workflow execution adapter；不能冒充人工审批流 |
| 流程监控 | QY `View_FlowObjList` 等实际 datasource | 仍走三层 DataSet/DataTable/DataSource 直接对接 |

流程设计文件不进入页面 rule/script/style，也不进入普通附件目录。流程发起、撤回、退回等真实状态变更只在获得授权测试范围后验收；离线阶段只验证请求契约和前端状态机。

### 8.4 Realtime 与 AI 会话所有权

1. `spark-app` 拥有唯一 realtime session manager：认证上下文、连接状态、重连退避、心跳、Last-Event-ID、页面订阅和 logout/context switch 关闭。
2. `/api/sse/connect` 使用同源 `/api`；如果需要 Authorization/header，使用 fetch stream adapter，不用无法可靠附加自定义头的裸 `EventSource`。
3. `spark-ai` 的 lowcode adapter 通过 `POST /api/sap/agent-loop` 消费 SSE 帧，复用同一 parser、取消和错误模型，但 AI conversation 不与全局通知流共用业务状态。
4. SSE 帧先按 wire event name/data 解析，再映射为 AppWorks realtime/AI 事件；未知 event 保留诊断并忽略展示，不能误判为 final。
5. 企业、应用、Token 或 conversation 变化会提升 context revision 并中止旧流；旧流晚到事件不得写入新 DataSource、页面或 AI 会话。
6. Nginx 对 SSE 关闭代理缓冲和响应缓存、延长读取超时；普通 `/api` 仍使用常规超时与缓存策略。
7. MCP client/server 未进入 lowcode 根 Reactor 的本次默认构建，只有实际 Nacos 路由和独立产物验证通过后才启用相应 AI 工具；否则 UI 显示“能力未部署”，不回退 `spark-ai-server`。

## 九、精确影响范围

实施前由带 SHA-256 的合并 manifest 把每个源文件展开到精确目标；以下是允许变更的上层边界，超出即暂停修订方案。

### 9.1 工作区与构建

- `package.json`：移除 Java 构建/启动脚本，增加前端验证、lowcode 外部构建和发布装配入口。
- `pnpm-workspace.yaml`：补齐 Metadata 实际外部依赖 catalog，维持目标单一版本真源。
- `pnpm-lock.yaml`：仅由目标仓安装过程更新。
- `vite.config.ts`、`vitest.config.ts`、`tsconfig*.json`、`eslint.config.js`：合并 Metadata 编译、别名、测试和治理要求。
- `scripts/start-dev.mjs`：停止启动 MySQL和 `spark-ai-server`，只校验 runtime/gateway 后启动 Vite。
- `scripts/build-all.mjs`、`scripts/build-frontend.mjs`、`scripts/build-packages.mjs`：改为 AppWorks 前端工作区构建。
- `scripts/assemble-release.mjs`：新增统一发布目录装配和摘要校验。
- `scripts/build-lowcode-release.ps1`：新增只读调用 `E:\lowcode-jdk17\mvnw` 或 Maven 的外部构建脚本，不改后端源码。

### 9.2 AppWorks 公共包

- `packages/spark-utils/package.json`、`src/http/**`、新增 `src/security/**`。
- `packages/spark-app/package.json`、`src/config/**`、`src/auth/**`、`src/navigation/**`、新增 `src/runtime/**`、`src/realtime/**`、`src/shell/**`。
- `packages/spark-data/package.json`、`src/types.ts`、`src/dataset.ts`、`src/data-table.ts`、`src/data-view.ts`、`src/strategies/crud-delegate.ts`、新增 `src/qyapi/protocol/**` 和 `src/qyapi/crud/**`：现有三层对象直接承载稳定 ID、QY 查询快照和 CRUD；新增目录只放 wire/执行逻辑，不放平行领域模型。
- `packages/spark-project-model/src/navigation/project-node.ts`、`src/page/config-page.ts`、`src/page/runtime-page.ts`、`src/page/page-file.ts`、`src/io/page-content-loader.ts`、`src/io/page-file-api.ts`：增加 QY datasource page profile，正式路径退出 `pagedata.json`，legacy profile 保留旧四文件兼容。
- `packages/spark-app/src/router/dynamic.ts`、`src/navigation/**`：把完整 QY 导航绑定传入 PageNode，并按企业/应用 context revision 失效缓存。
- `packages/spark-component/package.json`、`src/permission/**`、`src/page/renderer/**`、`src/ai/**`、新增 `src/foundation/**`、`src/auth/**`、`src/business/**`、`src/editors/**`：组件只消费 DataSource 原始权限和派生状态，移除 QY 页面对通用 `_perm/_modelPerm` 的依赖。
- `packages/spark-ai/package.json`、新增 `src/lowcode/**`，删除经反向引用证明仅服务旧 Host Run 后端的 transport surface。
- 上述包各自 `src/index.ts`：只显式导出有实际消费者的门面。

### 9.3 根应用

- `src/main.ts`、`src/App.vue`：保留 AppWorks 主启动链，挂接 Metadata feature registry。
- `src/layout/**`、`src/registries/vue-page-registry.ts`：合并 Metadata 菜单、路由与页面解析。
- 新增 `src/features/metadata/**` 十个领域目录。
- `src/services/auth.ts`、`src/services/http.ts`、`src/services/sse-events.ts`、`src/services/api-paths.ts`：收口到 AppWorks 包 adapter，移除旧后端路径。
- Metadata 源应用相应测试按目标领域迁入 `tests/metadata/**`，不把大量测试平铺到单目录。

### 9.4 部署与发布

- `.env.example`、`.env.local.example`：只保留 AppWorks 前端/runtime 和开发 gateway target。
- 删除 `.env.java.example`。
- `public/config/default.json`：移除旧后端物理地址和旧 AI/session 配置，改为 AppWorks runtime 所需的公开配置。
- 新增 `deploy/nginx/default.conf.template`：静态文件、SPA fallback、`/api` proxy、SSE buffering/timeout。
- 新增 `deploy/release-layout.md`：统一发布目录的输入、输出和摘要规则。
- 新增 `release/` 仅作为构建产物，必须被 Git 忽略。

### 9.5 最终退休范围

- 删除 `spark-ai-server/**`。
- 删除 `scripts/load-java-env.mjs` 及只服务本仓 Java 后端的脚本、测试和配置。
- 删除或修订仍把 `spark-ai-server`、`127.0.0.1:8180`、`/api/config/default`、旧 AI Host Run/session/events 当作当前运行事实的产品代码和当前文档。
- 历史记录和已明确标记为 superseded 的研究文档不因字符串扫描机械删除。

## 十、合并清单与冲突规则

实施第一产物为 `notes/merge-manifest-metadata-into-appworks.json`，每项至少包含：

- 源仓、源绝对路径、源 SHA-256。
- 目标绝对路径、目标合并前 SHA-256或“新文件”。
- 处置：`migrate`、`merge`、`replace`、`retire`。
- 所属波次、目标包/领域、直接消费者。
- API/导出变化、依赖变化和最小验证命令。

冲突裁决顺序：业务语义和 lowcode 真实契约 > AppWorks 当前公共接口 > 目标治理规则 > 源实现便利。目标文件在 manifest 生成后发生摘要变化时，该项立即停止并重新研读；不得覆盖用户新改动。

## 十一、实施波次

每次只推进一个最小闭环，首次实质修改后立即运行对应最小验证。

1. **波次 0：基线与 manifest**
   记录三仓 branch/HEAD/dirty files，生成逐文件摘要清单；运行 AppWorks 当前 typecheck/test/build、Metadata 源 type-check/test/build、lowcode 根 Maven package 基线。源仓只读。
2. **波次 1：依赖和底层通信**
   统一 catalog，合并 `spark-utils` 的 HTTP/security 原语；验证包级 typecheck、单测和网络出口治理。
3. **波次 2：身份运行时最小闭环**
   只处理 LoginAuthority、双 Token、企业 `id/shortName/name`、应用 `id/code`、账套和 URL scope；用 fixture 验证字段归一化、刷新单飞、企业/应用切换失效和旧头不再成为授权依据。
4. **波次 3：三层直接对接的 DataSet 闭环**
   `Base_DataSet` 直接构造现有 AppWorks `DataSet`，每个 `Base_DataModel` 直接构造现有 `DataTable`，字段与关系进入现有 columns/relations；禁止新增平行 QY 数据模型。
5. **波次 4：DataSource 接口快照闭环**
   在现有 AppWorks `DataTable` 增加 `execQueryResult`，原子写入其 DataSource 的 rows、originalRows、total、allowAdd、`lingma_sys_key` 和每行 `r/e/h/m/d`；验证无权限字段 fail-closed、原始集合不被改写、更新差异和部分失败。
6. **波次 5：导航与无数据文件 PageNode**
   映射应用目录和 `Base_NavigationInfo`，把 `dataSourceId/scenarioFormKey` 带入动态路由；QY 页面只加载 rule/script/style。用残留扫描证明 QY 页面不请求、保存或缓存 `pagedata.json`。
7. **波次 6：lowcode 文件系统**
   接入三个页面表现文件和受限目录视图；分别验证企业分区、路径回执、覆盖、读取、下载和删除请求。版本、业务附件索引等缺少等价能力的项目保持显式 gap。
8. **波次 7：UI 基座与领域组件**
   合并 `spark-component` foundation/business/editors/ai，组件直接消费 AppWorks DataSource，统一 Vue、Element Plus、LogicFlow、ECharts、XLSX、DOMPurify 等版本。
9. **波次 8：Metadata 页面迁入**
   按十个 `src/features/metadata` 领域逐组迁入；每组完成路由注册、页面测试和离线构建后才能进入下一组。
10. **波次 9：流程、AI/SSE 和旧协议退出**
    隔离流程设计文件与普通文件，接入 lowcode Flow/Workflow、agent-loop/SSE，反向查找并清退旧 Host Run/session/events 消费者；不修改后端。
11. **波次 10：开发、构建和同源代理**
    改造 dev/build 脚本，添加 Nginx 配置并验证 `/api`、SSE 与 SPA fallback 的优先级。
12. **波次 11：统一发布装配**
    前端生成 `dist`；lowcode 在 E 仓原地构建根 Reactor；装配脚本只复制构建产物到临时 release 目录并生成 SHA-256 清单。
13. **波次 12：`spark-ai-server` 独立删除闭环**
    再次展示精确删除清单并确认；按目录/脚本/配置/测试分组删除，每组后立即 typecheck 或残留验证。
14. **波次 13：完整验收和交付**
    运行自动门禁，形成发布清单、已验证能力、环境未验证能力及回滚说明。

## 十二、统一发布目录

```text
release/
  frontend/
    dist/
    nginx/default.conf
  backend/
    gateway/*.jar
    mainbody/*.jar
    file/*.jar
    register/*.jar
    license/*.jar
  manifests/
    frontend-assets.sha256
    backend-artifacts.sha256
    build-metadata.json
  README.md
```

- backend 清单只收录 `E:\lowcode-jdk17` 根 Reactor 本次实际成功构建出的模块，不伪造 MCP/IoT JAR。
- 发布目录不包含源码、数据库数据、Nacos 配置、口令、Token 或 `.env.local`。
- 不由 AppWorks 启停 lowcode 微服务；发布 README 只描述依赖和产物，不接管现有运维体系。

## 十三、兼容性与破坏性变更

- 保留 AppWorks 前端作为主产品，现有前端公共面原则上保持；发生导出收窄必须先完成全仓消费者迁移。
- QY 页面从四文件变成三表现文件 + datasource，是明确的模型变更；`pagedata.json` 只在 `legacy-file-data` profile 保留，不能被新页面继续生成。
- `DataSet/DataTable/DataSource` 增加 QY 绑定和接口快照字段，但仍是原有 AppWorks 三层对象；现有非 QY REST/static 路径保持原行为，QY 路径禁止回退到 `_perm/_modelPerm` 的 fail-open 语义。
- Metadata URL 不保证原 `/metadata` 独立部署兼容，最终路由由 AppWorks 统一管理。
- 认证切换到 lowcode 后，旧 `spark-ai-server` Token、用户、项目、AI 会话和页面配置数据不迁移、不双写。
- 删除 `spark-ai-server`、Java 构建脚本和本仓 MySQL 启动链是明确破坏性变更。
- 不为旧后端端点建立中转服务；无 lowcode 等价语义的旧能力必须在 manifest 中明确退休。

## 十四、验证计划

### 14.1 必须先记录的基线

- 目标仓：`pnpm run typecheck`、`pnpm run test:run`、`pnpm run build`。
- 源应用：`pnpm --filter @spark-template/metadata type-check`、`test`、`build`；已知 3 个源测试失败单独记录，迁入后不得新增回归。
- lowcode：使用 Java 17 对根 Reactor 执行 Maven package；若基础设施或私服导致失败，记录准确模块和原因，不修改后端规避。

### 14.2 每波次自动验证

1. 受影响包 typecheck。
2. 受影响包定向 unit/contract tests。
3. 首次修改后的最小 import/build smoke。
4. 根 `pnpm run typecheck`。
5. 根 `pnpm run lint`。
6. 根 `pnpm run test:run` 和包测试。
7. `pnpm run build`。
8. 架构、依赖、网络出口、权限、secret、目录层次和 bundle 检查。

### 14.3 离线契约验收

- AppWorks runtime 缺值时明确失败，不使用 Metadata 硬编码默认值。
- 登录、资料、刷新、退出路径和 HTTP method 与 lowcode 控制器一致。
- `dataSourceId` 与 `scenarioFormKey` 独立保留，datasource 只用 `dataSourceId` 唯一回读。
- 三层映射固定且无平行领域对象：`Base_DataSet -> DataSet`、`Base_DataModel -> DataTable`、接口 datasource -> `DataSource`。
- QYAPI 查询结果原子写入同一个 DataSource；rows、originalRows、total、allowAdd、`lingma_sys_key`、每行 `r/e/h/m/d` 不发生跨请求串线。
- QYAPI 写入保留 system key、只发送真实差异、逐项报告部分失败；文件 multipart/下载、流程设计读写请求形状一致。
- QY page profile 的网络 fixture 中不得出现 `pagedata.json`；legacy profile 的四文件行为仍有回归测试。
- `/api` 代理不重写为重复 `/api/api`；SSE 禁用缓冲并保留断线重连。
- 浏览器 bundle 不含 gateway 物理地址、源仓绝对路径、秘密或旧后端路径。
- 最终代码不再 import `@spark-template/*`。

### 14.4 环境具备后的只读验收

- gateway 可达；401/403 与路由不存在区分明确。
- 登录、会话恢复、刷新、退出。
- 企业短名/应用 rowid/账套上下文、菜单路由和 `dataSourceId` 唯一绑定。
- QYAPI datasource 查询、字段权限、分页筛选、主从联动，以及缺权限响应的 fail-closed 行为。
- 三个页面表现文件读取、文件列表/下载、流程读取、报表读取；确认 QY 数据层未访问文件接口。
- SSE 建连/重连和 AI 流式响应。
- register/license 路由边界及服务不可用提示。

真实 QYAPI 写入、文件上传/删除、流程发起/撤回、权限修改和 AI 工具写操作需要授权测试数据，并在执行前再次确认；离线方案不把这些动作伪报为已验收。

## 十五、风险项

| 风险 | 缓解措施 |
|---|---|
| 两仓 Vue Router、Vite、TypeScript 和测试工具版本不同 | 以 AppWorks catalog 为真源，逐包适配并用源测试固定行为；不复制源 lockfile |
| 21 个源包压入现有包后边界膨胀 | 按五个目标领域归并，公共出口限制在有消费者的门面，目录超过治理阈值前先拆领域子目录 |
| Metadata 源测试已有失败 | 基线单列；迁入时修复涉及迁移边界的失败，禁止用更新基线掩盖 |
| lowcode 根 Reactor 不含 MCP/IoT | 发布清单只按实际构建产物；AI 以已证实的 agent-loop/SSE 为首期契约 |
| gateway 路由受 Nacos 环境影响 | 离线校验源码契约，在线验收区分路由、认证和业务依赖三级状态 |
| 删除后端传播面广 | 将删除放在最后独立波次，先做反向引用和残留扫描，分组删除、即时验证 |
| 目标仓和源仓已有用户改动 | manifest 固定摘要；摘要变化即停止，不使用盲复制/整体回滚 |
| QYAPI 权限被前端错误放大 | 后端结果唯一事实源，表/行/字段/操作通道分别测试，批量权限取选中单元交集 |
| DataSource 分步写入导致短暂数据有值但权限为空 | `execQueryResult` 用一个 snapshot 同步替换 rows、基线、总数和权限，QY 缺权限 fail-closed |
| `tenant/project` 与企业/应用/账套混用 | 运行时保留独立稳定字段；URL 投影必须经真实只读回读确认，禁止别名猜测 |
| 页面退出 `pagedata.json` 后旧页面受损 | 用显式 page profile 隔离；QY 与 legacy 两套定向测试，不做隐式 fallback |
| lowcode-file 列表/版本语义不足 | 首期只交付已证实的三表现文件和受限目录；版本/业务索引保持 capability gap |

## 十六、回滚策略

- 每个波次开始前记录目标文件摘要和 `git diff --`；只回退本波次明确文件。
- 禁止 `git reset --hard`、整仓 checkout、递归覆盖和跨 shell 删除。
- 新文件失败时仅移出该波次新文件；现有文件冲突时暂停并回到 manifest 裁决。
- `spark-ai-server` 删除前确认其受 Git 跟踪且工作树无未跟踪后端内容；删除闭环失败则恢复最近删除组，不扩大改动。
- E 盘两个来源仓不产生内容变更；若构建生成受跟踪文件变化，立即停止并恢复该来源仓的生成副作用。

## 十七、开工检查

用户明确回复“通过/开始/开工”后，才执行：

1. 将本计划状态改为 `approved`，真正修改前改为 `implementing`。
2. 重新运行三仓 `git status`，确认受保护改动和当前分支。
3. 检查 lockfile/Node/Java/Maven 进程占用。
4. 跑目标 typecheck 基线、源 Metadata test/build 基线、lowcode Maven package 基线。
5. 生成并校验逐文件 merge manifest。
6. 向用户对齐第一轮只做“波次 0”，不得直接开始批量迁移。

## 十八、完成定义

- Metadata 全部页面和实际依赖能力均有明确合并处置，并在 AppWorks 主壳、主路由下可达。
- AppWorks 公共包为唯一公共面，生产源码中不存在 `@spark-template/*` import。
- QY 页面由导航 `dataSourceId` 唯一绑定 datasource；`scenarioFormKey` 独立保留，空、漂移或多义绑定均显式失败。
- 三层在 AppWorks 现有对象上直接对接：QY DataSet 对 DataSet、QY 前端模型对 DataTable、接口 datasource 对 DataSource；不存在平行 QY 领域模型。
- AppWorks DataSource 是 QY 行数据与权限的唯一前端 SSOT，原样承载 originalRows、allowAdd、`lingma_sys_key` 和 `r/e/h/m/d`；UI 不读取第二份权限状态。
- 正式 QY 页面不读取、生成、保存或缓存 `pagedata.json`；只有 legacy profile 仍可使用旧数据文件。
- 登录、运行时、导航、QYAPI、文件、流程、SSE、AI 均通过对应自动验证；环境未提供的在线项明确标记，不能伪报通过。
- 浏览器只走同源 `/api`，生产代理正确处理 API、SSE 和 SPA fallback。
- `spark-ai-server` 及其构建、启动、配置、测试依赖已按独立删除闭环清退。
- AppWorks 前端和 lowcode 后端均独立构建成功，统一 release 目录和 SHA-256 清单生成成功。
- 没有修改两个 E 盘来源仓的受跟踪源码，没有覆盖用户既有改动。
- 完整 typecheck、lint、test、build、架构和残留门禁有可审计结果。
- 阶段 7 的知识候选经用户逐条确认，度量写入 `notes/ai-code-metrics.md`，完成后的本计划按项目治理要求删除。
