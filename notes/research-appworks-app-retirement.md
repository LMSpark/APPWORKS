# 研读：取消 AppWorks 内置应用，系统页按数据归属三层承载

## 用户决定（2026-11-13）
- 整合后不再有“软件工坊[AppWorks]”应用；AppWorks 能力是每个企业通用的，按数据归属分层。
- 平台级：启用 `/platform`“SPARK 平台管理”，放多租户（跨租户）页面；登录即可进入，无角色判断，读写由后端数据权限决定。
- 企业级：登录后未进入应用时的菜单（目录范围），放本租户数据页面。
- 应用级：每个业务应用都有通用“应用设计”菜单，页面以当前应用为设计目标；蓝图不再依赖导航宿主关系。
- 菜单结构由 `vue-pages.json` 的分组与顺序生成，删除 `appworks-system.json`（单一来源）。
- 设计菜单登录即可见，不做菜单级授权（不再用 AppWorks 应用的后端菜单授权）。
- 后端仍存在的 AppWorks 应用记录当作普通应用，前端不特殊处理、不过滤。
- 归属不确定的页面：凡不是企业级（按租户隔离）的就是平台级；有应用外键的属应用级。

## 现状事实
- 内置应用：`config/applications/appworks.json`（应用身份、导航资源、31 个仓内场景资源）→ `src/registries/builtin-application-registry.ts`。
- 仓内导航：`config/navigation/appworks-system.json`（85 条，同时是 AppWorks 自身的仓内蓝图）→ `src/lowcode/resources/repository/builtin-system-navigation.ts`、`builtin-blueprint-node-resource.ts`；`lowcode-runtime.ts` 的 `assembleBuiltinSystemNavigation` 以后端菜单授权投影。
- `isBuiltinApplication` 分支：`lowcode-runtime.ts`（应用/导航根/页面文件/工具文件/蓝图树）、`lowcode-data-space-runtime.ts:161,204,235,238`、`blueprint-workspace-dataview.ts:155`。
- 迁入系统页登记为 `scope: app` + `shellTool: false`，只经 AppWorks 导航可达；路由 `projectId` 与请求头 `X-AppId` 当前都是 AppWorks 应用身份。
- `X-AppId` 对多数页面只用于装载仓内场景配置（`loadLowcodeRuntimeScenario`、`use-feature-page-runtime.ts`），并作为后端请求头随数据空间查询发送（含 `x-FormKey`=场景 ID）。
- 目录范围（`homepage`）查询走 `readAuthenticatedRequestScope()`，请求头为空；`lowcode-application-catalog.ts` 以仓内场景 + 该作用域装配目录 DataView。
- 平台工作台：`packages/spark-app/src/router/dynamic.ts` 已支持 `/platform` 前缀注册；`src/main.ts` 设为 `isPlatformNavigationEnabled: () => false`，`loadPlatformNavigation` 指向目录导航。
- 蓝图页目标应用：`use-application-function-page.ts` `loadTarget()` 读 AppWorks 导航节点 `Base_Navigation_DataRelation` → `resolveNavHostProjectBinding` → 查询参数 → 候选与 `Base_AppSystemList` 双重核验 → `openEditingProject`。
- 多个应用级页面现为“租户全量列表 + `Base_AppSystemList` 下拉选应用”（BUG、数据恢复、报表、字典、编码、逻辑视图、数据空间目录等），记录含应用外键（sysid/AppId/AppID/modid/SystemID）。

## 页面归属初判（待实测核定项标 *）
| 层 | 页面 |
| --- | --- |
| 平台 | 租户管理；缓存管理*；服务器管理* |
| 企业 | 应用列表、应用系统列表、机构、岗位、人员、流程监控*、数据库管理*、表和视图管理*、文件管理*、JSON数据*、Excel导入(+设计)*、PDF识别(+设计)*、外部服务管理* |
| 应用 | 项目蓝图、数据空间目录/设计、数据字典/字典数据、数据编码/编码设计、逻辑视图/设计、数据工作流/设计、工作流设计、BUG管理、数据恢复、业务报表管理、关联数据库、导航宿主管理、维度设计* |

*：无应用外键，须核定是否按租户隔离；不隔离则平台级。

## 关键风险
- 应用级系统页改以业务应用 `X-AppId` + 仓内场景 `x-FormKey` 查询，后端是否放行未验证。
- 企业/平台级页面改用空请求头作用域查询，后端对各模型是否放行未验证。
- 下拉选应用改为固定当前应用，改变这些页面的业务行为，须逐页核对保存时应用外键的写入。
