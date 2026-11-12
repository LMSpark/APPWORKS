# 研读：租户管理按参考仓“入驻管理”恢复（平台级）

## 用户决定（2026-11-13）
- 租户管理按参考仓企业管理恢复；范围只迁“入驻管理”页（列表、审核、密码、企业配置、应用与模块授权），1:1 还原并替换现 `/tenants`。
- 租户管理属于平台级 APP（`/platform` 工作台，“SPARK 平台管理”）。
- 企业默认应用改存 `Base_Enterprise_Info.ent_config.defaultApplicationId`，经 SPARK data 读写；入驻管理企业配置与企业级应用系统列表均可设置；先实测后端保留新键。原“企业设置文件”方案作废。

## 参考实现事实（只读 `E:\r\sparkproject@1147b00ee`）
- 页面：`apps/appworks/src/ui/features/application/enterprise-regist-manager/`（page、list、audit/password/config/app-auth 四个对话框、model）。蓝图节点“入驻管理”，节点 ID 即场景 ID `5914FF981A7DF228ED88BBDB71353470`，本仓 `appworks-system.json` 状态 `plan`，未迁移、无 pagedata。
- 数据：`data/api/ApplicationManager/EnterpriseRegistManager.ts`，全部走场景 SPARK API：
  - 列表：`Base_Enterprise_Info`，过滤 `CName contains`、`CheckState eq`，页长 20；列 CName/Name/ShortName/createtime/industry_type/contact_person/entInfoUserPhone/EntUrl/CheckState；字典 `entCheckState`。
  - 审核按钮仅当本行 `CheckState` 字段可编辑；对话框只读展示账号与企业信息（personUrl、entadminAccount、contact_person、entInfoUserPhone、entMailbox、createtime、EnterpriseIcon、CName、ShortCName、Name、ShortName、entBusReg、entOrgCer、domain_name、entScanBusLicen、entScanOrgCer）。
  - 通过：命令 `application.lifecycle/initialize-enterprise` → `POST /Enterprise/initEnt {entShortName,rowid}`；不通过：更新 `CheckState=-1`。
  - 密码：更新 `super_admin_pwd`（≥6 位，二次确认）。
  - 配置：`loginPolicy`（字典 `login_policy`）+ `ent_config` JSON（user_audit、pwd_* 规则、mini_program_default_pwd、verification_code_length、loginToken）；保存整串覆盖。
  - 应用授权：`Base_AppSystemList` 分页 10 合并 `enterprise_app_auth`（enterprise_id 或 ent_shortname，app_id in）；状态机 PENDING/INITIALIZING/ACTIVE/FAILED/REJECTED/CANCELLED/REVOKED；授权=create，批准/重试/重新授权→INITIALIZING，拒绝→REJECTED，撤销→REVOKED；字典 `app_auth_status`、`app_request_type`。
  - 模块授权：生效后展开；`Base_NavigationInfo`（SysId=应用）建树，合并 `enterprise_module_auth`（enterprise_id、authorized=1）；授权=create，取消=remove。

## 本仓现状
- `/tenants` → `src/views/platform/PlatformTenantManagement.vue` + `TenantConfigPanel.vue`：由会话伪造单行，写入全部抛“未提供合同”，`defaultProjectId` 写死；属应删除的错误实现。
- 会话企业信息 `lowcode-enterprise.ts` 已从 `entinfo.ent_config` 解析 policy，可同处解析 `defaultApplicationId` 供登录落点。
- 平台工作台：`main.ts` `isPlatformNavigationEnabled: () => false`；路由支持 `/platform` 前缀（`spark-app/router/dynamic.ts`）。
- 系统页模式：`useFeaturePageRuntime` + `config/pages/**/pagedata.json` + `config/applications/appworks.json` scenarioResources（退役方案拟迁至 system-scenarios）。命令模式参考 `cache-management/runtime-bindings.ts`（命令须有正式命令模型定义）。

## 待核实（需用户手动登录后只读）
- 场景 5914… 的正式模型清单、模型 ID、字段与数据权限；是否含 initEnt 命令模型。
- 四个字典是否存在；平台级查询所需请求作用域（目录作用域或应用作用域）。
- `ent_config` 现存记录是否已有 loginToken 等扩展键（判断后端是否保留新键）。

## 风险
- 审核通过若无正式命令模型，须登记服务缺口或在数据层按既有 endpoint 适配，不得页面直调。
- 应用系统列表（企业级）写当前企业 `Base_Enterprise_Info` 的作用域与权限未知。
- 配置对话框整串覆盖 `ent_config` 会丢失其他键；本仓须保留未编辑键。
