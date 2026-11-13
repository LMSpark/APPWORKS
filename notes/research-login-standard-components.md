# 研读：登录页改用 SPARK data 标准组件

用户决定（2026-11-13）：登录页改用标准组件，认证命令走数据层命令适配，不把凭据绑到业务 DataView。研读复述已获用户确认。

## 已定决策
- 登录前 DataSet：仓内 `config/pages/platform/login/pagedata.json` 声明命令、静态输入与企业目录只读查询表，新增公开作用域装配入口，只接受这三类表，不读服务端模型定义。
- 布局分层（用户要求）：不在一个页面堆功能；登录页只承载登录主任务，注册、注册租户等次要流程用标准 `RendererDrawer`/`RendererDialog` 分层打开。

- 其余答复：注册入口各开右侧抽屉；登录回执不含密码与 token、提交后清空密码；注册未知结果只用登录核验、不重发；验证码独立命令 + 60 秒倒计时；企业下拉可搜索可输入、记住上次企业；必填/枚举进列元信息，长度/格式/两次密码进命令资源；扩展 `FieldText` 前缀图标与 `RendererForm` 回车提交；验收含实服注册一个测试用户（用户指定）。方案见 `notes/plan-login-standard-components.md`。

## 原实现事实
- `src/views/platform/LoginView.vue`：登录、注册、注册租户三页签，原 Element Plus 表单，本地 `reactive` 状态与 `FormRules`。
- 直调五个公开、免认证接口（`lowcodeApi.platform`）：`listEnterprises`（企业目录查询）、`login`、`registerUser`、`registerEnterprise`、`sendVerificationCode`。
- 登录成功：会话保存 → `reloadAndSyncNavigation` → `enterEnterpriseLanding`；注册与注册租户成功后自动登录。
- 关联：`App.vue` `isLoginPage`；`HomePage.vue` 经 `spark_login_tab` 指定页签；导航守卫无会话回 `/login`；`config/navigation/vue-pages.json` 登记为 public 页。无现有测试。

## 可复用机制
- spark-data `bindDataSetCommandSubmit`：一行新增即一次后端命令，`saveChanges` 提交并接纳回执，未知结果走 verify；数据层命令资源样例 `EnterpriseInitializationResource`，经场景 `commandBindings` 绑定。
- `bindDataSetReadonlyCommandQuery`：企业目录作只读查询视图，供企业下拉选项。
- `ensureDataSetStaticInputTable`：确认密码等不提交的输入（参照入驻管理密码对话框）。
- 标准组件：`RendererTabs`/`RendererTabPane`、`RendererForm`、`FieldText`（`showPassword`）、`FieldSelect`（`allowCreate`）、`RendererButton`。

## 核心约束
- 现有场景装配（`loadScenarioDataSet`）都先读服务端空间/模型定义，需登录会话；目录作用域也要求已认证。
- 登录页在登录前，无导航身份与 `PageRuntime`；需新的登录前装配入口（仅命令、静态输入与只读查询表，不读服务端模型定义），配置落点与登记方式待定。

## 待核实
- 组件缺口：输入前缀图标、输入框内“发送验证码”按钮、回车提交、下拉可搜索（以 ClassModel 为准）。
- 语义：登录结果是会话而非数据行，仍由 `lowcodeApi` 保存；提交后密码不得留在 DataView；注册未知结果无法核验，不自动重发；发送验证码可重复。

## 复杂度
复杂：>3 文件、新登录前装配路径、新数据层命令资源、可能扩展组件。
