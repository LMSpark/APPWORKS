状态：implementing

## 任务目标
登录页改用 SPARK data 与标准组件：登录前经仓内 pagedata 公开装配 DataSet，认证类操作走数据层命令资源，登录页只承载登录，注册与注册租户分层到抽屉。

## 阶段与业务语义
- **登录（主任务）**：输入企业（目录选择或输入英文简称）、账号、密码 → 登录命令 → 会话由 `lowcodeApi.platform.login` 保存 → `reloadAndSyncNavigation` → `enterEnterpriseLanding`。回执只含命令键、企业、账号，不含密码与 token；提交后清空本地密码。成功后在本浏览器记住企业英文简称（非凭据），下次作初值；去掉写死的“领码科技”。明确失败显示后端信息，可修改重提。
- **企业目录**：只读投影视图，公开接口 `listEnterprises`；`FieldSelect` `filterable` + `allowCreate` 绑定该选项视图；加载失败提示，仍可输入英文简称。
- **注册账号（抽屉）**：企业英文简称、账号、显示名称、性别、验证方式、验证账号、验证码、密码、确认密码 → 注册命令 → 自动登录 → 同登录后续。确认密码只作命令输入列由资源校验，不发送。
- **注册租户（抽屉）**：四级域名标识、英文名、中文名、中文简称、管理员账号（默认 admin）、管理员密码、验证方式、验证账号、验证码 → 租户注册命令 → 管理员自动登录 → 同登录后续。
- **结果未知（注册与注册租户）**：超时/断网标为未知并保留原输入，不自动重发、不提供放弃重提；“核验”只用同账号密码尝试登录，成功即确认已注册并继续登录后续，失败仍为未知。
- **发送验证码**：独立命令视图，按钮 `RendererButton` 在验证码字段旁；成功后 60 秒倒计时禁用，明确失败可立即重发；可重复发送，不进回执核验。
- **校验**：必填与枚举写在 pagedata 命令表列元信息，由公共校验链执行；密码≥6、四级域名格式（字母开头 3—32 位字母/数字/_/-）、两次密码一致在命令资源提交前校验，错误回到字段提示，不发请求。
- **布局分层**：登录卡片只有登录表单，底部“注册账号”“注册租户”两个入口各开右侧 `RendererDrawer`；`HomePage` 经 `spark_login_tab=register` 进入时打开注册账号抽屉。
- **下游消费**：会话、导航与企业落点链不变；`App.vue` `isLoginPage`、导航守卫 `/login` 不变。

## 影响范围
- 新增 `config/pages/platform/login/pagedata.json`：场景 `platform-login`；表 `EnterpriseCatalog`（logical-view 投影，`platform:enterprise-catalog`）、`LoginRequest`、`UserRegistrationRequest`、`EnterpriseRegistrationRequest`、`VerificationCodeRequest`（command，`platform:*`，`commandId` 主键，列含 required/enumOptions）。
- 改 `config/pages/system-scenarios.json`、`src/registries/system-scenario-registry.ts`：登记 `platformLogin`，标 `scope: public`；`resolveSystemScenarioResource` 不返回公开场景（目录/应用作用域不能装配），新增 `getPublicScenarioResource`。
- 新增 `src/lowcode/data-space/lowcode-public-scenario.ts`：`loadLowcodePublicScenario(scenarioId)`，经仓内文件 DataView 读配置，只接受 command 与无模型投影表，否则拒绝；以空模型/关系复用 `LowcodeDataSpaceAssembler`，不读服务端空间与模型。
- 新增 `packages/spark-lowcode-api/src/platform/resources/auth/platform-auth-resource.ts`（+ 包导出）：`PlatformAuthResource` 提供企业目录投影与四个命令的 `BindCommandSubmitOptions`，内部调用 `LowcodePlatformApi` 既有方法；含提交前校验、未知分类与登录核验。
- 新增 `src/lowcode/resources/system/platform-auth/runtime-bindings.ts`：按表名与资源身份核对后返回 commandBindings/projectionBindings。
- 组件扩展（同步 ClassModel 生成）：`FieldText` 增 `prefixIcon?: string`（同 `RendererButton.icon` 解析）；`RendererForm` 增回车 `submit` 事件（表单内文本输入回车触发，组合输入法时不触发）。
- 改写 `src/views/platform/LoginView.vue`：`NativePageRuntimeSession` 装配公开场景并提供 `PAGE_RUNTIME`；`RendererForm`/`FieldSelect`/`FieldText`/`RendererButton`；去掉原 Element Plus 表单与直调。
- 新增 `src/views/platform/login/user-registration-drawer.vue`、`src/views/platform/login/tenant-registration-drawer.vue`（`RendererDrawer` + 标准字段 + 验证码按钮倒计时）。
- 实施核定补充（2026-11-13）：`PAGE_RUNTIME` 须由父组件提供，登录表单拆为 `src/views/platform/login/login-form.vue`，验证码按钮两抽屉共用 `src/views/platform/login/verification-code-button.vue`；三者都按 `workflow-create-dialog.vue` 先例，宿主 `addRow` 命令行，子组件以 `useDataViewRecordEditing({mode:'edit', created})` 承接保存、取消与未知核验。公共保存链已支持列 `minLength`/`pattern`/`trim`，密码长度与四级域名格式改写入 pagedata 列元信息；命令表列不支持 `enumOptions`，性别、验证方式用 `FieldSelect` 静态 `options`，命令资源复核取值；列 `defaultValue` 不被 `addRow` 消费，初值由宿主 `addRow` 传入。
- 实施核定补充二（2026-11-13，用户确认）：`RendererDrawer` 无关闭保护，结果未知时用户关闭会让抽屉本地隐藏而宿主状态滞留；按 `RendererDialog.closeDisabled` 同一语义补 `RendererDrawer.closeDisabled`（拦截关闭按钮、遮罩、Esc、插槽 close，外部 modelValue=false 仍可释放），补组件测试并重新生成 ClassModel。公开场景 scenarioId 按登记 schema 用 32 位十六进制身份（非 `platform-login` 字面量）。明确失败后 DataView 以新对象替换已应用编辑的待新增行，`RendererForm` 固定行与 `useDataViewRecordEditing` 按设计失效；登录表单与两个抽屉在明确失败（非结果未知）时通知宿主，宿主放弃原待提交命令行、以保留的非凭据输入新开命令行，密码类字段须重新输入。
- 测试：公开装配入口、`PlatformAuthResource`（含未知与登录核验、回执无密码）、组件扩展、登录页与抽屉。
- 台账 `notes/data-space-retirement-ledger.md` 入驻管理节补登录页结果，删除原“LoginView 原表单”缺口。

## 技术方案
1. 按“查目录 → 查概要 → 查指南”核 `FieldText`、`FieldSelect`、`RendererForm`、`RendererDrawer`、`RendererButton` 合同；扩展 `FieldText.prefixIcon` 与 `RendererForm` `submit`，跑 `generate:class-model-surface`。
2. 写 `PlatformAuthResource`：每个命令 `inputFields` 取自 pagedata 列；`submit` 先校验、再调既有平台方法；登录回执 `{commandId, enterpriseName, account, outcome}`；注册类 `isUnconfirmed` 判网络/超时，`verify` 用原输入调 `login`，`allowAbandonUnconfirmed: false`；验证码命令无核验（未知按明确失败，可重发）。
3. 写 pagedata 与登记、公开装配入口、runtime-bindings。
4. 改写 LoginView 与两个抽屉：打开时向命令视图 `addRow` 新行，字段经 `dataViewKey` 绑定该行，按钮 `saveChanges({views:[{tableName, viewId, ids}]})`；成功后清密码列、记住企业、走登录后续；页面卸载释放运行实例。
5. 生成 `generate:lowcode-contracts`，跑验证计划，浏览器烟测。

关键决策：公开场景不进目录/应用作用域，防止未登录配置被当作服务端空间装配；凭据只存在命令行与请求内，不进回执、不跨页保留；确认密码作为不发送的命令输入列，避免另建静态表（pagedata 不支持 static-data）。

## 兼容性
- 登录、注册、注册租户请求与 wire 不变（复用 `LowcodePlatformApi`）；登录后续链不变。
- 去掉写死默认企业，改为记住上次企业（用户确认）。
- 登录页不再有三页签，`spark_login_tab=register` 改为打开抽屉；`register-tenant` 值同理打开租户抽屉。
- 不考虑向后兼容，删除原表单代码与无用导入。

## 验证计划
- `pnpm run generate:class-model-surface`、`pnpm run generate:lowcode-contracts`
- `pnpm run typecheck`、`pnpm run lint`
- vitest：新增测试 + `tests/runtime/auth-nav`、`tests/app/services/project`、`tests/app/config/vue-page-registry.test.ts`、spark-component 相关组件测试、system-scenario 相关测试
- `verify:arch`、`verify:pages-config`、`verify:class-model`、`verify:lowcode-contracts`、`verify:dirs`、`verify:page-thin`、`verify:rules`、`verify:docs`
- 浏览器烟测（用户手动登录，不猜凭据）：错误密码提示、企业目录下拉与输入、登录成功落点、两个抽屉打开；实服注册一个测试用户（用户指定企业、账号与接收验证码的联系方式，验证码由用户提供）。

## 风险项
- 公开装配入口被误用于已登录场景：登记 `scope: public` 并在目录/应用解析中排除，测试覆盖。
- 回车提交与组合输入法冲突：只在非组合状态触发，测试覆盖。
- 命令视图新行与会话切换：登录成功后路由刷新释放实例，迟到回执由 guard 拒绝。
- 注册未知结果的登录核验依赖账号密码正确；失败保持未知，提示用户稍后直接登录。
- 实服注册会真实创建账号，仅按用户指定执行一次。
