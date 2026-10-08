# M0 数据空间目录“查询绑定”只读预研

日期：2026-10-08。仅静态源码核对；未实施代码、未运行测试、未发在线请求。固定参考为 `E:\r\sparkproject` 的提交 `842dec4f11b333df904b9a4e26b6566b0802bab8`；当前实现事实取 `D:\SPARK_AppWorks` 工作树。

## 结论

目录页“查询绑定”可由现有四文件页面的正式 `DataView` 查询链承接算法本身，不需要恢复整页 Vue，也没有证据表明必须新增业务宿主 API：页面脚本可通过 `$page.resolveView(...)` 取既有视图；`DataView.loadFromServer` 接收显式字段、过滤、`allPages`、`maxRows`，查询由 `DataSpaceRuntimeApi` 执行并把原查询权限结果交回视图。

但目前不能据此判定可等价上线。当前 `Base_NavigationInfo` 视图绑定的身份是 `90A82E287930A234FEC3E687C94A93EA / Base_NavigationInfo`；固定参考先以节点 ID `7AB874097A1E8711A42FD845939A6E05` 调用正式 `blueprint.scenarioId(nodeId)`，随后 owner 使用该后端返回的真实场景 ID 查询 `Base_NavigationInfo`。因此 `7AB...` 是用于解析场景的节点身份，不是查询场景 ID。参考调用的实际解析结果不在静态源码中。当前同名模型不足以证明两者访问同一正式导航记录集、权限与应用作用域。并且仓库没有该当前模型的静态字段定义，无法只靠静态源码确认所需输出字段齐全。主控应先定案这两个身份/模型合同；本预研不建议用空结果、放宽筛选或另造 API 绕过它们。

## 固定参考的真实行为

- `apps/appworks/src/ui/features/data-platform/data-set-management/ui/data-set-list-page.vue`（固定提交，`handleQueryBinding`，约 L510-L559）：取行的 `rowid` 为数据空间 ID、`sysid` 为应用 ID；缺应用身份即失败；调用 `runtime.api.blueprint.scenarioId('7AB874097A1E8711A42FD845939A6E05')`，将**蓝图节点 ID**交给正式后端解析器取得真实蓝图场景；以该返回值、真实 `applicationId` 和失效回调创建 `AppWorksProjectBlueprint`，再查询绑定。UI 在请求前清空旧结果，校验 row/app/页面代次，请求迟到则清空失效状态；异常显示错误，成功展示路径。固定提交的 `packages/data/spark-api/src/kernel/blueprint-runtime-api.ts` L24-L73 校验解析结果唯一、应用与节点匹配后才返回 `row.scenarioId`。
- 同提交 `apps/appworks/src/data/api/ApplicationFunMan/project-blueprint-owner.ts`（`#readAllResult` L136-L149、`#readDataSpaceBindingNodes` L214-L249、`readDataSpaceBindings` L251-L296）：查询 `Base_NavigationInfo`，过滤 `sysid = applicationId`，按 `rowid` 升序，每页 50、`allPages: true`、上限 50,000。要求返回行数等于总数；要求原查询上下文有 `rowKey`/`fieldAccess`；逐行验证非空且唯一的正式 rowid 与 rowKey 一致，并要求 `conid`（接受 `conid/ConId/ConID` 大小写候选）存在且读权限为 `visible`。结果归一化后再确认所有记录仍属于目标应用。
- 绑定判定是**精确相等**：归一节点 `dataSpace.scenarioId`（来自导航行 `conid`）等于目标 `dataSpaceId`。对所有绑定节点逐个回溯父链；根父值 `000000` 归一为空。任何重复/空节点 ID、缺失父节点或循环父链都显式失败。路径各段为 `navigation.title`（wire 源 `FunName`）→ `capability.name`（`name`/`Name`，缺时标题回退）→ 节点 ID；用 ` / ` 连接；目标是 `navigation.target`（wire 源 `NavigationUrl`，缺省为空）；最后按中文 locale 对完整路径排序。归一字段映射见同提交 `application-function-contracts.ts` L257-L330；wire 字段和 `conid` 映射见 `project-blueprint-wire.ts` L83-L127。
- 来源 owner 对 `rowid` 与 `conid` 做显式权限/身份完整性检查；它没有在该投影方法中逐字段检查 `prowid`、标题/名称和 `NavigationUrl` 的 `fieldAccess`。因此“使用查询权限”不能表述成源 owner 对路径每个字段都要求可见；若四文件实现新增严格可见校验，需主控确认这是有意安全收紧，避免把行为差异藏起来。

## 当前四文件可承接能力与差异

- 当前 [pagedata.json](../../../../config/pages/data-platform/data-space-catalog/pagedata.json) 固定场景 `90A82E287930A234FEC3E687C94A93EA`，并正式绑定六表：`Base_NavigationInfo`、`Base_DataSet`、`Base_UserInfo`、`Base_DataModel_Field`、`Base_AppSystemList`、`Base_DataModel`。导航表只有 `views.default: {}`，没有静态 `fieldProjection`；`Base_DataSet@catalog` 则显式投影目录字段。
- [lowcode-data-space-assembler.ts](../../../../src/lowcode/data-space/lowcode-data-space-assembler.ts#L15) 以场景配置绑定的正式 `modelId/modelName` 解析模型，把正式模型输出列装配为 DataView 列，并将每个视图绑定现有查询 owner；没有从场景配置猜字段定义。
- [DataView](../../../../packages/spark-data/src/data-view.ts#L291) 不能改绑已开始的 query owner；[loadFromServer](../../../../packages/spark-data/src/data-view.ts#L1306) 将正式查询结果交给 `ingestQueryResult`，视图保留结果上下文；`fieldAccess` 通过该上下文按行/字段给权限结果（L302-L310）。
- [DataSpaceRuntimeApi.executeQuery](../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts#L82) 从 DataView 正式模型绑定解析字段，执行字段、排序、过滤和树字段映射，拒绝不能映射到模型输出的字段；[captureDataSpaceViewQuery](../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-options.ts#L96) 明确身份来自 `view.dataSet.scenarioId + modelBinding.modelName`，允许 `allPages/maxRows/tree` 并在运行时拒绝未知查询参数。虽然通用 `QueryParams` 有扩展索引签名（`packages/spark-data/src/types.ts` L1430-L1465），运行 owner 有显式 allowlist，不能把 TS 类型扩展口误判为服务端支持任意参数。树查询合同是显式 key/parent/node，mode 仅 `child|parent`，不提供这个绑定算法所需的任意全树父链结果保证。
- [buildPageContext.ts](../../../../packages/spark-component/src/page/context/buildPageContext.ts#L110-L111) 给四文件脚本的查询入口是 `$page.getDataSet(scenarioId)` 与 `$page.resolveView(binding)`；没有暴露任意模型 query 或旧 `AppWorksProjectBlueprint` owner。可用已有导航 DataView 实现是合理方向，但必须使用视图，而不能从脚本直接 import 不属于四文件能力面的原生 owner。
- `Base_NavigationInfo` 当前 modelBinding 记录的正式 ID 为 `44402ab3-7708-4a12-adaf-5d8a2e42b9ff`，modelName 为 `Base_NavigationInfo`。仓库内没有该模型的正式输出字段清单。必需字段至少涉及 `rowid`、`sysid`、`conid`、`prowid`、`FunName`、`name`/`Name`、`NavigationUrl`。字段能否经该 `modelId` 的正式 DataView 输出，以及它们的实际 canonical name，静态证据不足；不应把“视图默认空配置”当作正式字段缺失。

## 身份、权限及行为差异

| 项 | 固定参考 | 当前四文件路径 | 只读结论 |
| --- | --- | --- | --- |
| 场景/表身份 | 先以蓝图节点 `7AB874097A1E8711A42FD845939A6E05` 经正式 API 解析真实 scenarioId，再查询该 scenario 的 `Base_NavigationInfo` | View 身份由 DataSet 的 `90A82E287930A234FEC3E687C94A93EA` + modelName 构造 | 实际解析出的参考场景不在静态源码；不能把节点 ID 当场景 ID，需确认 `90A...` 的正式模型/数据/授权上下文一致。 |
| 应用身份 | 行 `sysid` 作为 owner `applicationId`，请求过滤整棵该应用导航 | 目录数据空间行有 `sysid`；当前 DataSpace runtime 请求身份来自现有 scope，数据过滤需显式 `sysid = 该行 sysid` | 必须读该目录行 `sysid` 且与请求应用边界兼容；不得由页面 ID 或 admin 身份代替。 |
| 场景绑定 | `conid === dataSet.rowid` 精确匹配 | DataView 可显式 filter `conid eq dataSet.rowid`，也可完整读后本地精确筛 | 可表达等价筛选；需从受权限保护的当前 DataView 行取得正式 rowid。 |
| 搜索范围/分页 | 目标应用全部导航行，最多 50,000，完整性以 `rows.length === total` 判定 | DataView 支持 `allPages/maxRows`，结果由正式查询 context 承载 | 可承接，但需比较 DataView 的 `total/countReported` 与完整行数，缺总数或截断必须失败。 |
| 节点/祖先 | 全应用节点集；从每个绑定节点回溯全祖先，路径可含模块/分组节点 | 全树本地父链遍历可在脚本对 DataView 行完成；`tree` 参数只提供服务端 child/parent 请求 | 不能只查当前层/仅绑定节点，否则祖先丢失。 |
| 空/重复/循环 | 空/重复 ID、重复 rowKey、缺父、父链循环、缺/不可见 conid 均失败 | DataView 提供正式 PK 与 `fieldAccess`；现有 owner不会替脚本自动建立路径/重复循环完整性检查 | 在四文件脚本显式保留失败语义；不把异常转为空列表。 |
| 排序/目标 | 路径 `zh-CN` locale 升序；`NavigationUrl` 空值保留为空字符串 | DataView 能排序模型字段；最终路径排序可本地完成 | 不应按 rowid 或节点显示排序替代路径排序。 |
| 数据权限 | 查询上下文行身份有效，`conid` 必须可见；其他路径字段由规范化消费行取值 | DataView `fieldAccess(row, field)` 暴露当前响应的读状态；不存在角色模型要求 | 路径实现消费后端实际权限。`sysid/rowid/conid` 不可见应明确失败；对 parent/标题/目标逐字段可见规则是否沿用源行为需主控定案。 |

## 最小方案建议（供主控定案）

1. 保持四文件范围。先从静态工程/已留存正式模型定义确认 `Base_NavigationInfo` 的 `modelId` 与所需字段；再取得或核验参考节点 `7AB...` 经正式 resolver 返回的真实 scenarioId，并确认 `90A...` DataView 查询在请求层的正式场景/App 身份与参考查询落到同一个经授权的数据资源。无此证据不接入“查询绑定”。
2. 若上述合同一致，在 `Base_NavigationInfo` 的既有 DataView 上显式查询 `rowid/sysid/conid/prowid/FunName/name/NavigationUrl`（仅请求模型正式存在的 canonical 输出字段），按真实行 `sysid` 约束应用，完整分页并限定上限；取 DataView 保留的查询结果与 `fieldAccess`，验证身份/可见字段/总数完整性，然后按参考规则精确筛 `conid`、构造祖先路径、检测重复/缺父/循环和路径排序。只在四文件视图/脚本中新增查询绑定 UI 需要的最小行为，不新增 API 或 Vue 宿主。
3. 若 `90A...` 不是 resolver 返回的蓝图数据身份，则本场景中的同名 DataView 不构成等价读取。不要临时另加 query host API；主控需先决定是否允许现有四文件运行调用显式声明并装配真实蓝图查询场景，及其真实 scenario/model 身份如何进入正式 pagedata/调用，而不是把节点 ID 当 scenarioId 或由页面脚本猜 ID。

## 建议验收

- 固定夹具覆盖同应用多个节点、非页面祖先、多条绑定路径、同名节点、空目标、无绑定、空/重复 PK、父缺失、父环、超 `maxRows`/总数不完整，以及逐项不可见/掩码权限；断言失败可见且不变成空结果。
- 请求断言真实 query identity 为已核实场景 + `Base_NavigationInfo`、应用 scope header 为当次真实 App、过滤限定该 App；确认 query row/field permissions 来自同次原始 DataView 响应，未自行拼接权限结果或建立角色条件。
- 对照固定源排序和显示格式（中文 locale 完整路径、` / `、标题/名称/ID 回退、精确 `conid`），同一路径和相同来源数据逐项比较输出。
- 浏览器只验目录行的“查询绑定”操作、关闭/切行/换应用/迟到请求后的失效防护；在线请求和浏览器验收不属于本轮静态预研，也未执行。

## 在线证据修订（2026-10-08）

以下补证覆盖并更新上文“场景/字段静态证据不足”的结论；前述静态研读和行为差异仍保留。

- `pilot-binding-blueprint-scenario.json` 记录正式节点 `7AB874097A1E8711A42FD845939A6E05` 的 `conid/scenarioId` 均为 `7AB874097A1E8711A42FD845939A6E05`，应用为 `D99A1DCE9894698799101EFD70F8FC76`；该场景配置文本为 `null`。其正式模型 `7AB...p000 / Base_NavigationInfo` 输出字段包含 `rowid`、`SysId`、`conid`、`prowid`、`FunName`、`name`、`NavigationUrl`，足以表达绑定投影与路径。
- `pilot-binding-online-facts.json` 证实页面场景 `90A...` 的同名模型 ID 为 `44402ab3-7708-4a12-adaf-5d8a2e42b9ff`，不同于蓝图正式模型 `7AB...p000`，且 `conid.output=false`（同时多个蓝图所需字段不是输出字段）。因此不能用目录场景里的同名 DataView 查绑定，或将它改造成源模型的替代品。
- `pilot-binding-view-probe.json` 是临时真实 DataView 的结果：全量 84 行、`total=84`、`success=true`、权限拒绝数 0；目标目录数据空间 `90A...` 匹配到 1 个正式绑定节点，归属应用 `D99...`。这补齐了跨场景绑定关系的实证。

据此，后续实施方向已收敛为：沿四文件运行链显式声明并查询第三场景 `7AB...` 的正式 `Base_NavigationInfo` DataView；用正式字段名 `SysId`（注意大小写）限定应用，并按目录目标 `90A...` 精确匹配 `conid`。保持现有 `90A...` 六模型绑定与后端元数据不变，不以 `90A.../Base_NavigationInfo` 同名模型替代源身份，也不增加业务宿主 API 或整页 Vue。`7AB...` 场景目前 `text=null`，应由既有场景装配能力以明确场景身份装配其正式模型/DataView；不应通过伪造 pagedata 文本或字段定义补齐。

剩余未完成的是 UI 闭环验收：将查询绑定入口接到四文件视图/脚本，保留源 owner 的完整性、父链、路径与失效语义；再验证当前用户查询权限、空/重复/异常父链、切行/关闭/换应用与迟到请求行为。在线证据证明样本查询成功，不证明上述 UI 行为已经实现或通过验收。本轮只读追加，不实施代码或测试。
