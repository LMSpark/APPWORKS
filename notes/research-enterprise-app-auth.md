# 企业应用授权三页迁移研读（2026-11-13）

## 参考仓语义（`E:\r\sparkproject` 1147b00ee，只读）

- 原路径 `apps/appworks/src/ui/features/application/enterprise-app-auth-application/ui/`，本仓落在
  `src/views/features/application/enterprise-app-auth-application/ui/`，文件名不改。
- 数据真源是 `enterprise_app_auth`，状态 `auth_status` 七态：PENDING、INITIALIZING、ACTIVE、FAILED、REJECTED、CANCELLED、REVOKED；
  发起方式 `request_type`（REQUEST、LEGACY、INIT、DIRECT、TRANSFER_RETAIN）。初始化由后端异步完成，结果写 ACTIVE 或 FAILED（带 `init_error`）。
- 申请（apply-app-auth-content）：已发布应用 `View_AppSystem_Published`，关键词对 `AppDesc`/`AppName` 包含匹配，页长 10/20；
  每行"申请"弹窗（520px）填写可选说明（≤500），新增一行只写 `app_id`、`review_comment`、`operator`（会话用户）；成功提示"已提交申请，等待审批"。
- 我的申请：`request_type = REQUEST`，可按状态筛选，页长 20；顶部"申请应用授权"打开 960px 弹窗嵌入申请内容，关闭后刷新；
  PENDING 可取消（写 CANCELLED），REJECTED/CANCELLED/REVOKED/FAILED 可重新申请（写 PENDING），均需确认。
  "说明/失败原因"：FAILED 先显示 `init_error`，否则 `review_comment`；状态标签颜色 ACTIVE 绿、PENDING 黄、FAILED/REJECTED 红、其余灰。
- 申请列表（审核）：PENDING、`source_ent = 本企业`、REQUEST，页长 20；PENDING 行"审核"打开 640px 弹窗：
  只读展示申请企业/应用/来源企业（名称加标识）、申请时间、申请说明；拒绝原因可选（≤500，打开时为空）。
  通过写 INITIALIZING（加 operator），不通过写 REJECTED，有意见时写入 `review_comment`。
- 名称解析：申请企业按 `enterprise_id` 对 `Base_Enterprise_Info.rowid` 取 `CName`；来源企业按 `source_ent` 对 `ShortName`；
  应用按 `app_id` 对应用表 `rowid` 取 `AppDesc[AppName]`。

## 实服事实（只读核实）

- 三页在 D99A 蓝图各有导航节点，节点 ID 即场景 ID：我的申请 47DA…、申请应用授权 0221…（挂在我的申请下，菜单隐藏）、申请列表 C06D…。
- 三个场景的 `enterprise_app_auth` 都带七态字段；台账"七态无实服字段"只适用于入驻场景 5914 的窄模型，需要更正。
- 47DA 没有应用和企业模型，名称从同一运行实例内的 0221 读取；C06D 自带应用、企业及两个字典模型。
- 当前已发布应用都属于平台企业。授权记录以 ACTIVE/REVOKED 为主，REQUEST 发起的只有少数。

## 已确认纠偏

- 申请列表只列别家发布的应用（`publisher_ent ≠ 本企业`）；参考仓写成"等于本企业"，登记为参考仓缺陷。
- 我的申请加 `ent_shortname = 本企业`（会话企业简称），只收窄，后端仍独立授权。
- 角色类治理页、参考仓 `views/schema|appworks|system` 旧目录不迁移，登记为排除项。

## 本仓承接方式

- 运行：`useFeaturePageRuntime` 增加伙伴场景、主视图查询参数和完整键选项视图；同一 PageRuntime 装配多个场景，主场景不变。
- 写入：DataView 新增或字段编辑后 `DataSet.saveChanges` 只提交本行；明确失败撤销本地修改，结果未知保留并提示核对，不重发。
- 审核弹窗：申请信息绑定列表视图只读展示；拒绝原因绑定单记录视图 `audit` 的 `review_comment`，打开时清空，
  通过或未填写拒绝原因时改回原值（`updateEditingValue` 改回原值会撤掉补丁），因此不会覆盖申请说明。
- 组件：表格只读单元格目前只显示纯文本。按值着色的状态标签、悬浮显示同行标识这两项，需要先在 `r-select` 上补标准能力。

## 常驻范围过滤（已裁决：scope-filter = data-scope）

- 视图新增常驻 `scopeFilter`：与用户过滤、级联约束按 AND 合并，用户输入或清空不替换；字段可以不在投影内。
- 申请页（发布状态 + 发布企业不等于本企业）、我的申请（REQUEST + 本企业）均用 `scopeFilter` 表达。

## 已发布应用来源纠偏（已裁决：table-scope）

- 实服 `View_AppSystem_Published` 是 MySQL 视图，只暴露 `rowid/AppDesc/AppName/publisher_ent/…`，没有 `Memo` 与 `row_id`；
  0221 中该模型的字段从表复制，与视图不一致，查询报 `Unknown column 'row_id'`，备注列也取不到。
- 改用 C06D 已绑定的 `Base_AppSystemList@published`：`scopeFilter` 为 `app_status = PUBLISHED` 且 `publisher_ent ≠ 会话企业简称`，
  投影 `rowid/AppName/AppDesc/publisher_ent/Memo`；申请新增仍写 0221 的 `enterprise_app_auth`。我的申请的应用名称也取 C06D 应用表。
- 0221 不再绑定该视图模型；为诊断临时打开的 5 个输出开关已恢复并回读核实。

## 与参考页的细节对照

- 申请说明输入框 4 行，与参考一致；本仓给输入框加了"申请说明"标签（参考无标签），属布局偏差。
- 备注列来自应用表 `Memo`（视图不提供）。
