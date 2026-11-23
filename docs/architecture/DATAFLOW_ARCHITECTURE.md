# 数据空间：领域、配置与完整数据链路

> 当前源码核对日期：2026-11-21。本文是数据空间的唯一跨包合同；源码、正式 pagedata、数据库合同和真实服务回执优先于历史说明。

## 文档导航

1. [完整链路](#0-从业务用例到持久结果)
2. [领域对象](#1-立意与领域归属)
3. [身份与真源](#2-身份与唯一事实来源)
4. [pagedata 合同](#3-pagedata-与原生结构的边界)
5. [数据空间设计](#4-数据空间的数据空间)
6. [运行链](#5-正式运行装配查询编辑保存)
7. [关系与级联](#6-两类关系与值级联)
8. [权限与生命周期](#7-权限计算与生命周期)
9. [当前缺口](#8-当前覆盖与待收敛项)
10. [源码与验收入口](#9-源码与验收入口)

详细实施过程、已删除方案和真实验收证据统一登记在[唯一台账](../../notes/data-space-retirement-ledger.md)，不在本合同累计执行日记。

## 0. 从业务用例到持久结果

一次完整用例必须回答：

1. 谁提供输入，输入的来源和前置条件是什么。
2. 查询或命令定位哪个 `DataSet`、`DataTable`、`DataView`。
3. 本次查询返回哪些正式行、字段权限、动作权限和回执。
4. 编辑、取消、保存分别修改哪些运行状态。
5. 各存储来源实际写入了什么，是否确认完成、部分完成或结果未知。
6. 谁继续消费结果，是否能通过独立实例重开验证。

```text
业务语义
  -> 场景身份 + 正式模型绑定
  -> PageRuntime
  -> DataSet -> DataTable -> DataView
  -> 标准组件 / 声明式动作
  -> 查询 owner / 文件 owner / 命令 owner
  -> 接纳、回读、持久结果
  -> 独立实例重开与下游消费
```

### 0.1 交换中心的三个方向

| 方向 | 职责 | 验收 |
| --- | --- | --- |
| 向上 | 承接业务页面所需的模型、字段、视图、输入输出 | 页面只通过本次 PageRuntime 消费 DataView |
| 向下 | 连接数据库、文件、逻辑视图、字典、外部 API、命令等资源 | 每类来源保留自己的身份、权限、失败和回读语义 |
| 旁侧 | 衔接功能标签、授权配置与执行结果 | 前端消费正式权限结果，不重建角色或授权算法 |

### 0.2 业务完成边界

以下结果不能单独证明业务完成：

- 页面已打开、HTTP 200 或本地对象已改变。
- `prepare`、提示“成功”或画布出现节点。
- 测试夹具返回成功。
- 只读回读到旧值，或文件、数据库中的某一来源已成功。

必须分别验证可见结果、正式回执、精确回读和下游消费。不同来源没有跨来源事务。

## 1. 立意与领域归属

数据空间对应 `DataSet`，模型对应 `DataTable`，模型包含字段 `columns` 和多个命名 `DataView`。业务页面绑定具体视图，不把数据空间缩成数据库表集合，也不把 DataView 提升为脱离模型的独立领域对象。

| 对象 | 配置职责 | 运行职责 |
| --- | --- | --- |
| `DataSet` | 场景身份、表集合、模型关系、级联 | 单次调用的独立运行实例与提交协调 |
| `DataTable` | 正式模型绑定、字段、多个视图、资源身份 | 字段真源与视图注册 |
| `DataView` | 查询、过滤、排序、分页、树、编辑与级联配置 | 本次结果、选择、分页、编辑覆盖、权限、保存回执 |
| `DataColumn` | 名称、类型、标题、主键和字段语义 | 字段值与权限消费 |
| `DataRow` | 不持有模型配置 | 当前结果行及正式键；不是第二份模型定义 |

### 1.1 DataView 的业务语义与状态边界

#### 1.1.1 行、指针、选择、值与变更

- 行是当前查询结果的正式对象。
- 当前行只定位取值、编辑和可见上下文，不是级联关系端点。
- `SelectedRows` 是选择集合；字符串 `value` 是现有持久化表示。
- 字段级联消费原生字段值或选中主键数组，不把普通字符串自动拆成数组。
- 编辑覆盖、dirty tracking、pending save 和 unknown receipt 分别存在，不能合并为一个页面草稿状态。

#### 1.1.2 查询到保存

```text
refresh/query
  -> validate identity and query context
  -> accept rows, fields, total, permissions
  -> field edit overlay
  -> applyEditingRows
  -> DataSet.saveChanges
  -> owner receipt / unknown / partial
  -> update baseline or retain original recovery capture
```

`saveChanges` 只提交已捕获的变更；未加载、未修改的记录不被视为删除。保存不为比较依赖自动查询整个空间。

#### 1.1.3 配置与运行状态

以下内容不得写回设计配置：

- 当前 rows、选中行、页码、排序运行态。
- 编辑覆盖、pending/unknown、权限快照。
- 临时 query view、画布选择和页面通知。

运行状态只属于本次 `PageRuntime`。

### 1.2 本仓对象合同：接入前的判定依据

| 判断项 | DataSet | DataTable | DataColumn | DataView | DataRow |
| --- | --- | --- | --- | --- | --- |
| 身份 | scenarioId | table key + modelBinding | 稳定字段名 | viewId + 所属表 | 当前查询正式键 |
| 归属 | PageRuntime | DataSet | DataTable | DataTable | DataView 查询结果 |
| 配置 | tables / relations / cascades | columns / views / resource | 类型与字段语义 | 查询、树、分页、编辑规则 | 无 |
| 运行态 | 表实例与保存协调 | 列与视图注册 | 无业务值 | rows / selection / editing / receipt | 字段值 |
| 保存 | 协调已明确的视图 | 定义字段与视图注册 | 作为模型字段真源的一部分 | 提交 captured changes | 只通过正式 key 和 owner |

同名字段、同名配置块、旧页分区或后端 DTO 不证明语义等价。

### 1.3 正式数据的落点

| 来源或概念 | 本仓落点 |
| --- | --- |
| 数据空间、模型、字段数据库记录 | 元数据资源 -> 装配为 DataSet/DataTable/columns |
| 命名视图、查询配置、视图级联 | 共享场景 `pagedata.json` |
| 完整模型关系 | `DataSet.resourceRelations` |
| 查询/字段级联 | `DataSet.viewCascades` |
| 工具三文件 | rule/script/style 的 PageTool 文件资源 |
| 运行业务数据 | DataView owner 的查询/保存结果 |
| 设计草稿 | 由本次设计实例的正式 DataView 管理，不另造真源 |

## 2. 身份与唯一事实来源

### 2.1 身份不能互换

| 身份 | 来源 | 用途 |
| --- | --- | --- |
| projectId | 正式应用/企业上下文 | 请求 scope |
| nodeId | 导航节点 | 当前菜单节点 |
| pageId | 工具注册 | 三文件工具 |
| scenarioId | 数据空间/场景 ID | DataSet 身份 |
| modelId / modelName | 正式模型绑定 | 元数据与运行绑定 |
| table key | pagedata 内部键 | 场景内部表注册 |
| viewId | 命名视图 | 查询与页面绑定 |
| instanceId | PageRuntime | 生命周期与 stale 防护 |
| row key | 当前查询 owner | 行编辑、权限和保存范围 |

页面完整绑定为：

```text
scenarioId@modelName@viewId
```

只有显式 `mainScenarioId` 才允许局部：

```text
modelName@viewId
```

旧带 `#` 前缀的键仅做兼容读取，新配置不生成该前缀。

### 2.2 唯一真源

| 事实 | 真源 |
| --- | --- |
| 应用、导航节点、授权菜单 | 正式后台记录与导航响应 |
| 空间/模型/字段定义 | 正式数据库元数据 |
| 命名视图、查询配置、级联 | 场景 `pagedata.json` |
| 工具结构、脚本、样式 | 对应 rule/script/style 文件 |
| 业务行与行/字段权限 | 当次 DataView 查询 owner |
| 提交结果 | 当次 owner receipt 或明确 unknown capture |
| 文件版本/发布指针 | 文件资源与发布元数据 |

`toJson()` 是理解或快照方法，不是数据空间保存合同。不得把完整 DataSet、模型或字段再次序列化进 pagedata。

### 2.3 owner / receipt 边界

- owner 是 DataView 内部绑定的资源执行适配。
- receipt 是 DataView 内部查询/保存/命令结果的接纳证据。
- 页面不直接调用 owner，不持有 receipt，也不建立第二套查询或保存链。
- unknown 只允许核验原捕获，不自动重发。

## 3. pagedata 与原生结构的边界

`pagedata.json` 是场景共享第四文件，引用正式模型并声明命名视图、查询、关系和级联。它不复制数据库模型真源、运行 rows、权限凭据或当前草稿。

### 3.1 DataView 配置完整清单

当前配置重点包括：

- `viewId`、`queryColumns` / field projection。
- 过滤、排序、分页、搜索和输出模式。
- 树配置、层级参数及受支持的 `outputType`。
- query context、输入参数与来源入参。
- 编辑模式、校验、选择与字段级成员。
- `viewCascades` 及选项查询。
- 命令/file/只读投影资源绑定。

配置必须由当前 `ViewMetadata`、ClassModel 和源码共同核定；能序列化不代表服务端支持所有配置。

### 3.2 DataTable.api 与 DataTable.crudConfig

两者有不同边界：

- 通用本地 DataTable 可使用 API/CRUD endpoint 配置。
- 正式低代码场景必须由宿主装配正式 modelBinding、当前 scope 与 SPARK Data owner adapter；adapter 绑定到 DataTable 后由 DataView 执行。`spark-lowcode-api` 中现有 `DataSpaceRuntimeApi` 是迁移兼容层，目标执行合同归 SPARK Data。
- 平台默认 URL、scope、权限和后端请求格式不能由页面自行拼接。
- `FormalTableRequestConfig` 只解析正式表请求快照，不授予来源身份或权限。

### 3.3 根级格式、快照版本与提交策略

- `schemaVersion` 描述配置格式。
- 文件/发布版本属于读取与发布合同，不是页面导航身份。
- `saveChanges` 配置只描述提交默认值，不把数据库、文件和命令包装成跨来源事务。
- 读取四文件可逐文件校验，但页面只在整组 proof 成立后物化运行实例。

## 4. 数据空间的数据空间

数据空间设计页维护“被设计空间”的定义，但设计页自身也通过元数据 DataSet/DataView 运行。

```text
设计页 PageRuntime
  -> 元数据 DataSet C
  -> 空间/模型/字段/视图/关系定义 DataView
  -> 提交到元数据数据库或场景文件
  -> 目标空间 T 重新装配并消费
```

### 4.1 输入、输出与异常

- 设计器只接受宿主明确传入的一个目标空间 ID。
- 元数据空间身份不被目标空间 ID 替换。
- 设计动作输出新增、修改、删除的定义回执，不夹带业务运行 rows。
- 缺失、重复或非法目标身份 fail-fast。
- 切换目标后旧查询、旧草稿和迟到结果不能套到新空间。
- 尚无业务视图的正式空间仍能进入设计。

### 4.2 层次与操作范围

界面归属必须表达：

```text
空间
  -> 模型
     -> 模型定义
     -> columns
     -> 多个命名 DataView
  -> 模型关系
  -> viewCascades
```

选择对象只确定当前编辑上下文。普通保存提交本次修改的明确视图集合；取消调用原 DataView，不撤销已发请求。

### 4.3 设计与数据维护分离

- 设计页维护定义、字段标题、规则、视图、关系和级联。
- 数据页消费已保存设计，通过业务 DataView 查询或维护数据。
- 保存设计不夹带业务条目；保存业务数据不夹带设计定义。
- 两类界面都消费当次正式数据权限，不使用前端角色。

具体设计器能力、服务缺口和实服验收状态见[唯一台账](../../notes/data-space-retirement-ledger.md)，避免把历史实施叙述反向写成当前合同。

## 5. 正式运行：装配、查询、编辑、保存

### 5.1 装配

1. PageRuntime 校验 applicationId、nodeId、pageId、scenarioId 和本次 query。
2. 读取工具三文件与共享场景 pagedata。
3. 元数据资源提供正式模型、字段和关系。
4. `LowcodeDataSpaceAssembler` 按模型绑定和命名视图创建独立 DataSet。
5. 每个视图绑定对应 query/save/file/command owner。
6. 只有整组身份和资源合同成立才交付运行实例。

调用实参按 scenarioId 隔离。参数声明、调用值、来源入参映射和查询输入不得互相替代。

### 5.2 查询

- 组件通过 `dataViewKey`、`dataMember`、`dataField` 绑定。
- 无显式 filter 时消费视图的 `filterExpression`。
- 查询 owner 接纳 rows、total、主键、字段权限、动作权限和查询证明。
- stale 请求、身份漂移、主键漂移或权限结构不完整时拒绝替换当前结果。
- group-only / keyless projection 是只读结果，不能推断可写行身份。
- 聚合 `SUM/COUNT/AVG/MIN/MAX` 由后端正式查询执行；前端只能处理当前行计算。

### 5.3 编辑与提交

`DataSet.saveChanges`：

1. 定位明确视图与可保存行。
2. 校验编辑、当前上下文、字段权限、主键和 owner。
3. 按来源执行实际提交。
4. 分别接纳数据库、文件、命令回执。
5. 成功更新基线；明确失败保留原因；unknown 保留原捕获并等待核验；部分成功按阶段记录。

`saveChangesInPhases` 只提供顺序与停止，不提供跨来源事务。

## 6. 两类关系与值级联

### 6.1 模型关系 resourceRelations

- 表达 DataTable 之间稳定的结构关系。
- 使用完整过滤表达式，不限定为数据库外键或一组等值字段。
- 字段映射只是可提取的特例，不是关系真源。
- 不从模型关系自动生成运行级联。

### 6.2 查询级联 kind=query

父输入值变化后，按完整输入集合调整子 DataView 查询条件。输入可以是字段值或选中主键数组；当前行只提供取值位置。

### 6.3 字段级联 kind=field

在查询级联之上明确：

1. 父输入集合。
2. 子选项视图。
3. 目标数据字段。
4. 旧异步结果失效方式。
5. 子值保留、清空或其他 value policy。

不得自动选第一项，也不得因选项变化偷偷修改模型关系。

### 6.4 原生值与字符串兼容

`DataView.value` 的现有字符串序列化必须兼容 `valueField` 和 `selectionDelimiter`。级联内部保留原生值类型；持久化边界再按既有合同序列化。普通字符串不因含逗号就被解析成数组。

## 7. 权限、计算与生命周期

### 7.1 权限

- 前端没有角色模型、角色判断或 admin 放行。
- 权限依据是当次正式查询返回的表/行/字段/动作权限。
- 菜单可达、按钮可见、缓存或组件锁不授予数据权限。
- 能读不等于能写，字段可写不等于整行任意修改。
- 切换身份、空间或实例后不能借用旧权限。

### 7.2 计算

- 本行计算可由 spark-data 计算字段承接。
- SUM、COUNT、AVG、MIN、MAX 等跨行统计由后端按过滤和权限执行。
- 任意 JS 公式不自动转换为 SQL；不支持的函数登记为缺口。

### 7.3 生命周期与异常

- 页面销毁、绑定切换和实例失效必须拒绝旧结果。
- 查询失败与 empty result 分开；无权、未完整读取、缺文件和损坏文件分开。
- 超时不等于服务器未写；不得自动重发。
- 取消只丢弃本地未提交状态，不撤销已提交请求。
- unknown、partially-applied、not-applied 和 readback-failed 需分别展示和恢复。

## 8. 当前覆盖与待收敛项

### 8.1 已由源码与测试覆盖

- `PageRuntime -> DataSet -> DataTable -> DataView` 单链。
- 文件/命令/静态数据接入同一 DataView 查询与保存边界。
- 只读 group-only/keyless projection。
- unknown 只按原捕获核验，不自动重发。
- 两类关系分别配置，不互推。
- 原始值级联与字符串持久化兼容。
- 页面动作优先走标准组件、工具栏和声明式 action。

### 8.2 持续开放

| 缺口 | 风险 | 解除条件 |
| --- | --- | --- |
| 跨来源事务 | 数据库、文件、命令分别确认，可能 partial success | 每阶段固定 receipt；UI 分阶段展示与恢复 |
| 文件版本合同 | 修改时间碰撞可能复用旧缓存 | 后端提供 ETag/hash 或服务端条件读取 |
| 正式实服闭环 | 源码和夹具不能证明线上写入/权限 | 正式请求、真实回执、精确回读、冷重开 |
| 特殊资源身份 | 物理表/视图、部分设计 URL 尚无完整服务合同 | 明确身份、主键、权限投影和拒绝语义 |
| 部分视图能力 | 某些聚合函数或查询结构仅保存，未证实执行 | 真实后端结果或明确缺口 |

### 8.3 页面验收矩阵

| 用例 | 必须证明 |
| --- | --- |
| 菜单进入 | node/page/scenario 身份与授权导航一致 |
| 场景装配 | modelBinding、columns、views、relations 完整 |
| 查询 | 当次 scope、rows、total、分页、权限与 stale guard |
| 编辑与取消 | DataView overlay、字段权限、取消恢复 |
| 保存 | owner 回执、partial/unknown、精确回读 |
| 重开 | 独立实例重新装配已保存定义与数据 |
| 下游消费 | 结果被后续页面或业务流程实际使用 |

## 9. 源码与验收入口

### 9.1 核心源码

- `packages/spark-project-model/src/scenario/scenario-view-config.ts`
- `packages/spark-project-model/src/scenario/scenario-definition-resource.ts`
- `packages/spark-project-model/src/page/runtime-page.ts`
- `packages/spark-data/src/dataset.ts`
- `packages/spark-data/src/data-table.ts`
- `packages/spark-data/src/data-view.ts`
- `packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context.ts`
- `src/lowcode/lowcode-runtime.ts`

### 9.2 验证入口

```bash
pnpm run typecheck
pnpm run lint
pnpm run test:run
pnpm run verify:rules
pnpm run generate:class-model-surface
pnpm run build
```

源码合同、ClassModel、生成物与正式测试共同维护本主合同；实施过程只追加到唯一台账，不重新建立并行“总计划”。
