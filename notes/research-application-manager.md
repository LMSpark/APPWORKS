# 应用系统列表（0C70）研读

## 参考事实（`E:\r\sparkproject@1147b00ee`，只读）
- 页面 `apps/appworks/src/ui/features/application/application-manager/ui/`：page / list / form-dialog / database-dialog / relation-dialogs，模型 `model/application-manager-model.ts`，导航 `application/application-manager-service.ts`，服务 `data/api/ApplicationManager/ApplicationManager.ts`。
- 列表：标题“应用系统列表”，顶部 新增 / 导出（未交付占位）；关键词 `AppDesc|AppName contains`；列 序号/简称（可编辑时为链接打开编辑）/系统名称/WebUrl/开发商名称/创建时间(yyyy-MM-dd)/状态(字典`应用系统状态`)/操作列。
- 操作列：编辑（行可编辑）、删除（行可删且 `AppType='6'` 停用）、应用链接（有 WebUrl）、打开应用、项目管理（进入 `application-function-page` 应用上下文）、需求说明书、功能设计说明书、报价管理（未交付）、关联数据库（行可编辑）。
- 新增/编辑弹窗（980px，两列）：应用系统名称*、简称*、负责人*（单选人员）、站点运行地址（新增必填）、状态*、租户门户、是否软件项目、是否SAAS、是否微信小程序、系统图标、微信小程序地址、微信小程序图片（上传）、系统描述(500)、默认数据库（新增必选，经“选择数据库”弹窗；编辑只读）。
- 选择数据库弹窗：`_base_dbInfo` 分页，6 项 contains 筛选（数据库名/服务器/端口/类型/架构/描述），行“确定”或选中后底部“确定”。
- 关联数据库弹窗：同 `application-context/ui/application-database-relations-page.vue` 业务（已迁至本仓 93DF 场景）。
- 写入：新增一次 save 四表（主表；`Base_AppAndSource_Relation` type=database isRef=0；`Base_NavigationInfo` 导航根 prowid=000000/status=plan 等；`Base_MainBody_RoleUser` RoleIdField=C80F…E917、CategoryID=1、EntityPKValue=sysid）。编辑写主表 + 负责人（有则改 UserIdField，无则新增）+ 门户。删除仅主表。

## 实服元数据（0C70，只读，2026-11-14）
- `Base_AppSystemList` pk rowid，输出含 AppName/AppDesc/AppType/WebUrl/Memo/IsProjectRelation/isSass/isWeChat/Icon/WeChatUrl/WeChartimg/CreateUser/CreateTime/EntId/isdel/IsSys/DeveloperName 等 24 项。
- `Base_AppAndSource_Relation` pk rowid：sysid/conid/conName/cnName/type/isRef。
- `_base_dbInfo` pk Id：Id/Name/ServerName/Port/SchemaName/Remark（**无 Type 输出**）。
- `Base_MainBody_RoleUser` pk rowid：EntityPKValue/sysId/UserIdField/RoleIdField/CategoryID/createuser/createtime 等 17 项全输出。
- `Base_NavigationInfo` pk rowid：参考导航根所需字段中 BeginGroup/HorizontalAlignment/ChildItemLocation/IsShowChildItem/status/isSass 等未在输出列表，须核。
- `enterprise_app_auth` 17 字段**无 is_portal**；后端源码亦无 → 参考“租户门户”无持久字段。
- 人员目录：0C70 无用户模型；FB29 报表场景 `Base_UserInfo@default`（rowid/UserName）已被项目蓝图负责人使用。

## 用户裁决（2026-11-14）
- 范围：按参考 1:1 完整恢复，删除自加“关联信息”区与免责横幅。
- 负责人：照参考写 `Base_MainBody_RoleUser`，RoleIdField/CategoryID 作为 pagedata 新增默认值；前端不据此做权限判断。
- 新增：写全 4 表。
- 删除：删主记录 + 新增时建立的负责人、数据库关联、导航根；导航根下有子节点则拒绝。
- 门户：参考字段不存在 → 弹窗“租户门户”开关读写本仓企业默认应用 `ent_config.defaultApplicationId`。
- 关联数据库：列表页内弹窗，复用 93DF 关联数据库页同一场景与组件。
- 本仓增补保留：默认/设为默认/取消默认、进入应用。

## 迁移前差距（已处理）
- 页面外壳手写 header/h1/p，非标准组件；自加关联信息区约 100 行页面 TS 手解析 DataView 状态；新增/编辑/删除/项目管理禁用。
- 企业应用授权三页与关联数据库页外壳同样手写。
- `useDataViewRecordEditing` 只支持单视图单记录；多表新增/编辑改用 `DataSet.saveChangesInPhases`。

实施结果、偏差与仍开放缺口见台账“应用系统列表（0C70）按参考 1:1 迁入标准组件与 SPARK data”。
- 实服列类型（只读核实）：`isSass` 为 `tinyint`、`isRef` 为 `INT`，其余标志与导航数字列 `int`；写值须按列类型给数字。
