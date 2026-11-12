状态：implementing

## 任务目标
取消“软件工坊[AppWorks]”内置应用：系统页按数据归属分到平台级、企业级、应用级，应用设计以当前应用为目标；页面设计并入项目蓝图，`/dev` 删除。

## 阶段与业务语义
- 阶段 0 实测闸门（用户手动登录后，只读）：
  - 在一个业务应用内，以该应用 `X-AppId` 查询仓内场景的字典目录、数据空间目录、蓝图树，确认后端放行且按应用返回。
  - 以目录作用域（空请求头）查询机构、人员、数据库目录等企业级模型，确认放行。
  - 对标 * 页面核定是否按租户隔离（参考本地 Java 源码只读 + 实测），确定企业级或平台级。
  - 任一项被后端拒绝即停止并回报，不改后端、不伪造身份。
- 阶段 1 项目蓝图（应用级）：
  - 页面设计页签并入蓝图（只读树选页面节点、页面目标只读、创建并绑定工具、三文件编辑/版本/预览、AI 编辑、交付保存、核验待定提交）。
  - 导航页签：`NavigationUrl` 用 FieldSelect（候选=工具资源，可新建）、`BeginGroup` 勾选；基本信息补节点估算字段；树工具栏加“导入项目策划文档”。
  - 目标应用=当前路由应用；删除导航宿主关系取目标（`resolveNavHostProjectBinding`、`nav-host-project-picker-contract.ts`、`useBlueprintNavHost` 及查询参数）。
  - 保存与取消只走蓝图页显式保存/取消，脏检查合并。
- 阶段 2 菜单与路由：
  - `vue-pages.json` 的 `scope` 改为 `public | platform | enterprise | app`，新增 `group`、`order`；删除 `shellTool` 与 `/dev`。
  - 应用级：每个应用导航末尾生成“应用设计”分组（取代“SPARK 工具”）；无业务页时落到当前应用的项目蓝图（替代此前“回应用目录并提示”的决定，因蓝图已在每个应用内）。
  - 企业级：目录范围菜单由 enterprise 页面生成。
  - 平台级：`isPlatformNavigationEnabled` 改为登录即启用，`loadPlatformNavigation` 由 platform 页面生成。
- 阶段 3 删除内置应用：
  - 仓内场景资源迁到 `config/pages/system-scenarios.json` + `src/registries/system-scenario-registry.ts`（无应用身份）；场景装载对任一应用及目录作用域按登记解析仓内 pagedata。
  - 删除 `config/applications/appworks.json`、`config/navigation/appworks-system.json`、`builtin-application-registry.ts`、`builtin-system-navigation.ts`、`builtin-blueprint-node-resource.ts` 及全部 `isBuiltinApplication` 分支、后端菜单授权投影。
- 阶段 4 逐页归属落地：
  - 应用级页面：保留应用下拉，默认值为当前应用；无下拉、取当前应用的页面（关联数据库、导航宿主、维度锚点、编码设计等）改以当前业务应用为目标，不再落到 AppWorks 身份。
  - 企业级/平台级页面：改用目录作用域装载与查询，不再要求 `X-AppId`。
- 阶段 5 测试、文档、验证、台账与提交。

## 进度
- 阶段 1—3 已完成并通过 typecheck、lint、全量 vitest、verify 规则门禁与两套生成器：蓝图目标取当前执行应用并经正式应用目录确认（应用标识不可读即拒绝），导航宿主取目标与 `sysid` 参数已删；DevSystem 命名与 Save All 文案已改为蓝图/核验待定提交；平台/企业/应用设计三层菜单由 `vue-pages.json` 投影，平台入口在用户菜单；内置应用与 `src/views/app/dev-system` 已删。
- 待办：阶段 0 实测闸门与阶段 4 逐页作用域（企业级页面读 `X-AppId` 的资源在目录作用域下会显式失败，须逐页核验登记）；阶段 5 浏览器烟测。

## 影响范围
- 配置：`config/navigation/vue-pages.json`、`config/schemas/*`（若有页面登记 schema）、新增 `config/pages/system-scenarios.json`，删除 `config/applications/appworks.json`、`config/navigation/appworks-system.json`、`config/README.md` 相应说明。
- 注册与运行：`src/registries/vue-page-registry.ts`、新 `system-scenario-registry.ts`、`src/lowcode/lowcode-runtime.ts`、`src/lowcode/lowcode-application-catalog.ts`、`src/lowcode/data-space/lowcode-data-space-runtime.ts`、`src/services/project/blueprint-workspace-dataview.ts`、`src/main.ts`、`packages/spark-app/src/navigation/nav-access.ts`、`packages/vite-plugin-spark-catalog/src/scan-config.ts`、`getBuiltinScenarioResource` 的全部调用方（改名）。
- 页面：项目蓝图目录（含已迁入的 `blueprint-state/`、`blueprint-data-space/`、`page-design/`、`blueprint-planning/`）、阶段 4 所列页面及其 `config/pages/**/pagedata.json` 过滤配置、`use-feature-page-runtime.ts`。
- 样式与文档：`src/style.css` `.dev-system`、`src/views/README.md`、引用 `/dev`/DevSystem/AppWorks 内置应用的文档。
- 测试：`tests/app/dev/**`、导航/注册表/场景装载/蓝图页相关测试改写或删除。

## 技术方案
1. 阶段 0 实测，结果按“已核实 + 范围”写入研读文件，据此定稿 * 页面归属。
2. 阶段 1 完成蓝图合并并去掉导航宿主取目标；`useDevState` 内部 DevSystem 命名与“Save All”文案改为蓝图/“核验待定提交”。
3. 阶段 2 改注册表合同与三层菜单生成，删 `/dev`、`runtimeLanding` 回落改为项目蓝图。
4. 阶段 3 迁场景登记、删内置应用及分支。
5. 阶段 4 逐页改目标应用与作用域，`pagedata.json` 过滤用正式输入参数表达当前应用。
6. 阶段 5 改测试与文档，跑生成器与全量验证，浏览器烟测三层菜单与蓝图页面设计。

## 兼容性
- 不考虑向后兼容：AppWorks 应用入口、`/dev`、`shellTool`、`scope: catalog` 全部移除。
- 后端 AppWorks 应用记录与其导航数据保留不动，前端按普通应用对待。
- 带应用下拉的页面保留跨应用浏览，仅默认当前应用（用户审核时确定）。

## 验证计划
- `pnpm run typecheck`、`pnpm run lint`、针对性 vitest、`pnpm run test`、`pnpm run verify`
- `pnpm run generate:class-model-surface`、`pnpm run generate:lowcode-contracts` 无意外差异
- 断链检索：`appworks-system`、`builtin-application`、`isBuiltinApplication`、`/dev`、`dev-system`、`shellTool`
- 浏览器烟测（用户手动登录）：平台/企业/应用三层菜单；业务应用内项目蓝图编辑保存、页面设计创建工具与三文件保存；各层抽查页面查询

## 风险项
- 后端拒绝业务应用身份或空请求头查询系统场景：阶段 0 闸门，失败即停。
- 阶段 4 写入的应用外键必须等于当前应用，逐页测试保存载荷。
- 改动面大：按阶段成组修改、阶段验收，阶段 1—3 完成后先提交一次。
