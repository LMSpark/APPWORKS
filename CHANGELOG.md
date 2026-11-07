# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Breaking changes

- `WorkflowExecutionResource` 改为绑定正式场景声明的命令视图，不再动态创建表或公开 `requests`；执行目标及首轮定义由宿主准备并固定，未知执行保留原命令且禁止放弃后重跑。
- `DataSpaceRuntimeApi.bindModelView(view, model, options)` 的第三个参数统一为具名绑定选项；数组来源改用 `{arrayRows}`。首次绑定确定读取或命令模式，不保留旧数组参数签名，也不允许重绑切换模式。


### feat

- [AI-FE-20260420] DevSystem 数据设计器新增“多模态细粒编辑”能力：聊天模式可复用细粒度编辑执行链路，支持文本/附件/语音输入后直接驱动 FC 工具修改 DataSet 模型，并在界面中增加新功能标识与说明。

### docs

- 新增 API-first 提示词模板，当前收口于 `docs/ai/prompts/platform/API_FIRST_PROMPT.md`（前端优先调用 API，禁止默认改后端）。
- 更新 AI Server 文档：补全后端完整 API 清单，并明确多租户优先与扁平兼容路径约束。
- 明确历史迁移策略：迁移由前端显式调用 API 触发，禁止后端启动期隐式迁移。

---

## [0.4.0] — 2026-02-26

### spark-utils@0.4.0

#### ✨ Features - spark-utils
- **`normalizeKey(name)`** — 新增公开导出。将字符串名称标准化为 `Symbol.for(name)`，symbol 原样返回，使字符串键与符号键在 `capabilities` Map 中等价
- **`CapabilityTypeMap` 接口** — 可扩展的能力类型映射表，任意包可通过 `declare module '@spark-view/spark-utils' { interface CapabilityTypeMap { ... } }` 注入类型，消费方无需 import 符号对象即可获得精确类型
- `provide` 和 `lookup` 内部调用 `normalizeKey`，字符串键与 `defineCapability` 符号键完全等价

### spark-component@0.4.0

#### ✨ Features - spark-component
- **`consume` 新增 `CapabilityTypeMap` 字符串键重载** — `consume('spark:capability:selection')` 直接返回 `ISelectionCapability | null`，无需 import 符号对象；declaration merging 可扩展
- **`provide` 新增 `CapabilityTypeMap` 字符串键重载** — 同上，类型安全

#### ⚡ Performance - spark-component
- **`capabilities` / `children` markRaw** — `Map` 和子上下文数组从 Vue 深层响应系统中摘出，消除每次 `provide/consume` 的依赖追踪开销
- **去掉双重 `reactive()`** — `reactive(reactive(obj))` 改为单次 `shallowReactive({})`
- **全局单调 ID 计数器** — `spark-${++_idCounter}` 替代 `Date.now()+random`，更快、确定、SSR 友好
- **Logger 惰性缓存** — 首次成功 lookup 后缓存结果（O(1) 快路径）；`provide(LOGGER/APP_SERVICES)` 时主动失效；fallback 不缓存保留重查机会
- **`SparkComponentRenderer` 零 context 化** — 渲染器不再创建中间 `ComponentContext`，直接 `inject(SPARK_REGISTRY_KEY)` 解析组件。能力链从 `root→renderer→business` 简化为 `root→business`
- **`getAll()` 返回 `ReadonlyMap`（零拷贝）** — 不再每次 `new Map(components)`，O(1) 直接暴露内部引用

#### 🐛 Bug Fixes - spark-component
- `SparkPlugin` 和 `createSystem()` 的 `capabilities`/`children` 补充 `markRaw`，与 `useSparkComponent` 保持一致
- `createSystem().createContext()` 的 id 改用单调计数器

#### ♻️ Refactor - spark-component
- `provide`/`consume`/`consumeEvents`/`initialize` 的 debug 日志加 `import.meta.env.DEV` 守卫，生产构建零字符串构建开销

### spark-data@0.4.1

#### ✨ Features - spark-data
- `capability-keys.ts` 补充 `declare module '@spark-view/spark-utils'` 声明合并，`PAGE_DATASET` / `DATA_SOURCE` 加入 `CapabilityTypeMap`；消费方可用 `consume('spark:capability:data-source')` 获得 `IDataSource | null` 精确类型

### spark-app@0.3.2

#### 🐛 Bug Fixes - spark-app
- `logger/index.ts`：`process.env.NODE_ENV` → `import.meta.env.PROD`
- `utils/simpleEnv.ts`：`process.env.VITEST` → `import.meta.env['VITEST']`
- `start.ts`：修复 TS2352 类型断言

---

### 🏗️ Refactor - spark-data 统一事件系统

**目标：** 消除多种数据处理模式（EventManager / SubscriptionManager / 直接方法调用），统一为单一事件中枢（DataEventHub）

#### 架构变化
- **新增** `DataEventHub` 类（`core/data-event-hub.ts`）— 统一的事件发布/订阅系统
  - 提供 `on/off/emit` 标准事件接口（兼容 spark-utils EventProvider 模式）
  - 新增 `has(event)` / `hasPrefix(prefix)` 查询方法（原 SubscriptionManager 优化能力）
  - 事件命名规范：`view:stateChanged`、`view:{table}.{ctx}:changed`、`load:*`、`crud:*`

- **删除** `EventManager` 类（`core/event-manager.ts`）— 被 DataEventHub 取代
- **删除** `SubscriptionManager` 类（`core/subscription-manager.ts`）— 订阅逻辑合并到 DataEventHub

#### DataView 解耦（SRP 改进）
- DataView 不再直接调用 `dataSet.updateRelatedTables()` + `dataSet.notifySubscribers()` + `dataSet.emit()`
- 改为只发射单一事件 `view:stateChanged`，所有后续处理由 DataSet 事件监听器完成
- DataView 对 DataSet 的依赖接口从 3 个方法简化为 1 个（`emit`）

#### 事件驱动数据流
- DataSet 构造函数中注册 `view:stateChanged` 监听器，统一协调：
  1. 级联关系更新（RelationEngine）
  2. 视图订阅通知
  3. 具名事件广播（`currentRowChanged` / `selectedRowsChanged` / `contextCleared`）
  4. 能力层 `tableChanged` 通知

#### 导出
- 新增 `ViewStateEvent` 类型和 `DataEventHub` 类导出

### 🧹 Refactor - spark-data 深度清理

**目标：** 移除错误的、重复的、冗余的、过时的逻辑，不考虑向后兼容

#### 删除的类型（types.ts）
- `EventCallback` — 未使用
- `IDataSetConfig` — 未使用
- `IDataTable` / `IDataView` / `ITreeManager` — 冗余类型别名，外部直接使用类
- `PagedDataResponse` / `SingleDataResponse` — 向后兼容别名，无调用方
- `ImportConfig` / `ExportConfig` / `ImportResult` / `ExportResult` / `AuditLogEntry` — 预设性接口，从未实现

#### 删除的方法
- `SparkData.createContext()` — `createDataView()` 的重复
- `SparkData.createDataSetFromMetadata()` — `DataSet.fromConfig()` 的薄包装，无外部调用
- `DataSet.fromMetadata()` — 死代码，无调用方
- `defaultCrudService` — 空配置实例，始终失败

#### 删除的冗余代码
- `DataTable.override tableName` 属性声明和构造函数重复赋值（父类已处理）
- `DataTable.toData()` 中重复条件赋值块（值已在对象字面量中设置）
- `DataTable.fromTableData()` 中注入 `__permissions: {}`（无实际用途）
- `spark-data.ts` 底部重复的核心引擎导出和类型导出（与 index.ts 重复）
- `FlatTreeCache` 从导出改为 tree-manager 内部类型

#### 修复
- `SparkData.createDataView()` 参数 `hostTable` → `tableName`（与 DataView 属性一致）
- `index.ts` 权限导入移除 `.js` 扩展名（与项目其他文件一致）
- `data-view.ts` / `subscription-manager.ts` 中 `ITreeManager` / `IDataView` 类型别名替换为直接使用类

#### 文档同步
- 更新 `packages/spark-data/API.md`：移除 `createContext` / `BindingContext` / 已删类型引用
- 更新 `docs/guides/VIEW_STATE_ADVANCED.md`：`hostTable` → `tableName`
- 同步类型和 API 变更说明

**影响文件：**
- `packages/spark-data/src/types.ts`
- `packages/spark-data/src/spark-data.ts`
- `packages/spark-data/src/data-table.ts`
- `packages/spark-data/src/dataset.ts`
- `packages/spark-data/src/index.ts`
- `packages/spark-data/src/crud-service.ts`
- `packages/spark-data/src/data-view.ts`
- `packages/spark-data/src/tree-manager.ts`
- `packages/spark-data/src/core/subscription-manager.ts`
- `tests/spark-data-namespace.test.ts`

**验证结果：**
- ✅ 83 tests passed (19 test files)
- ✅ Type check passed（零错误）
- ✅ Lint check passed（零警告）

### ✨ Features & Refactor - 权限快照与数据清理

- 实现 **服务端权限快照（JWT-like）**：服务端一次计算并返回快照，前端保存 snapshot 并在写操作时回传，避免服务端重复计算。
- CRUD 服务集成权限令牌传递：统一从 `modelPermission` / `instancePermission` 提取 `permissionToken`，并作为请求头 `X-Permission-Token` / `X-Instance-Permission-Token` 发送。
- 上传前自动清理权限字段：在 `create` / `update` / `batch` 操作中移除从服务端返回的 `_perm` / `_modelPerm`，避免将权限元数据发送回服务端。
- 统一 `CrudOperationConfig` 权限传递设计：使用完整的权限对象（`modelPermission` / `instancePermission`）用于提取令牌与字段级控制。
- 小范围重构：`DataView.hostTable` 重命名为 `tableName`，并同步更新 `IViewMetadata`。
- 测试与类型：新增单元测试覆盖权限字段清理（`tests/crud-service-permission.test.ts`），并完善类型注释。

**影响文件（示例）**：
- `packages/spark-data/src/crud-service.ts`
- `packages/spark-data/src/types.ts`
- `packages/spark-data/src/data-view.ts`
- `tests/crud-service-permission.test.ts`

### 💥 Breaking Changes - 统一网络请求层

**目标：** 完全迁移到 Request 类，删除 HttpClient

#### 删除

- ❌ **HttpClient 类和工厂函数**
  - `HttpClient` 类
  - `createHttpClient()` 工厂函数
  - `packages/spark-utils/src/http/HttpClient.ts` 文件
  - `packages/spark-utils/src/http/` 目录

#### 移动

- 📦 **IApiContext 类型定义**
  - 从：`@spark-view/spark-utils`
  - 到：`@spark-view/spark-data`
  - 原因：现在由 ApiAdapter 使用

#### 变更

- 🔄 **ApiAdapter 重构**
  - 构造函数：从双参数 `(client, context)` 改为单参数 `(context)`
  - 内部实现：使用 Request 类代替 HttpClient
  - 自动配置：认证和租户拦截器自动添加

#### 新增

- ✅ **Request 类（统一请求层）**
  - 拦截器系统：请求/响应双向拦截
  - 自动重试：支持配置重试次数和延迟
  - 内置缓存：GET 请求自动缓存
  - 超时控制：基于 AbortController
  - 9 个预设拦截器：认证、租户、日志、错误处理等

- ✅ **RequestInterceptors 预设库**
  - 请求拦截器：`createAuthInterceptor`, `createTenantInterceptor`, `createRequestLogInterceptor`, `createTimestampInterceptor`, `createHeadersInterceptor`
  - 响应拦截器：`createStandardApiInterceptor`, `createResponseLogInterceptor`, `createErrorTransformInterceptor`, `createRedirectInterceptor`

- ✅ **完整文档**
  - `REQUEST_GUIDE.md` - 使用指南
  - `MIGRATION.md` - 迁移指南
  - `Request.example.ts` - 12 个使用示例

#### 迁移指南

详见 [MIGRATION.md](./packages/spark-utils/MIGRATION.md)

**快速迁移示例：**

```typescript
// ❌ 旧代码
import { createHttpClient } from '@spark-view/spark-utils'
const client = createHttpClient({ baseURL: '/api', token: 'xxx' })
const users = await client.get<User[]>('/users')

// ✅ 新代码
import { createRequest, createAuthInterceptor } from '@spark-view/spark-utils'
const request = createRequest({ baseURL: '/api' })
request.interceptors.request.use(createAuthInterceptor(() => 'xxx'))
const users = await request.get<User[]>('/users')
```

**影响范围：**
- `@spark-view/spark-utils` - 导出变更
- `@spark-view/spark-data` - ApiAdapter 重构，IApiContext 移入

## [0.3.0] - 2026-02-09

### Breaking Changes - DI 架构统一

**目标：** 统一到单一 DI 管道（SPARK 能力系统），删除冗余的 Vue 原生 DI

**删除的 Symbol 常量（5 个）：**
- `APP_CONTEXT_KEY`
- `ROUTER_KEY`
- `LOGGER_KEY`
- `CONFIG_LOADER_KEY`
- `AUTH_SERVICE_KEY`

**删除的 Composable 函数（10 个）：**
- `useAppRouter()` → 使用 `useRouter()` from vue-router
- `useLogger()` → 使用 `Logger('module')` from @spark-view/spark-utils
- `useAppContext()` → 使用 `consume(APP_SERVICES)`
- `useAuth()` → 使用 `consume(APP_SERVICES).auth`
- `usePermissions()` → 使用 `consume(APP_SERVICES)` + 自定义逻辑
- `useCurrentUser()` → 使用 `consume(APP_SERVICES)?.auth?.getCurrentUser()`
- `useCurrentTenant()` → 使用 `consume(APP_SERVICES)?.auth?.getCurrentTenant()`
- `tryUseAuth()` → 使用 `consume(APP_SERVICES)` (已支持 undefined 返回)
- `tryUseAppContext()` → 使用 `consume(APP_SERVICES)` (已支持 undefined 返回)
- `useConfigLoader()` → 使用 `consume(APP_SERVICES).configLoader`

**保留的核心基础设施（3 个）：**
- `SPARK_REGISTRY_KEY` - 组件注册表（Vue DI）
- `SPARK_PARENT_CONTEXT_KEY` - 父上下文引用
- `CAPABILITY_MANAGER_KEY` - 能力管理器

**新增能力系统组件：**
- `capability-types.ts` - 集中定义所有能力接口
- `DataSetCapabilityManager` 重构 - 支持 Logger、parentContext、injectIntoContext()
- 新增 79 tests 验证（16 test files）

**文档更新：**
- 统一 DI 架构说明
- 更新 `packages/spark-app/README.md` - 移除废弃 API 说明
- 更新 `docs/guides/USE_COMPOSABLES.md` - 简化为推荐用法指南
- 修正 API 命名：`createVuePlugin` → `createPlugin` (11 处)
- 更新测试统计：45 → 79 tests (16 files)

**迁移指南：**
```typescript
// ❌ 旧方式（已删除）
import { useAppRouter, useLogger, useAuth } from '@spark-view/spark-app'
const router = useAppRouter()
const logger = useLogger()
const auth = useAuth()

// ✅ 新方式（推荐）
import { useRouter } from 'vue-router'
import { Logger } from '@spark-view/spark-utils'
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'

const router = useRouter()
const logger = Logger('MyComponent')
const { consume } = useSparkComponent({ type: 'my-comp' })
const services = consume(APP_SERVICES)
```

**验证结果：**
- ✅ 79 tests passed (16 test files)
- ✅ Type check passed
- ✅ Lint check passed

## [0.2.0] - 2026-02-06

### Refactor - 代码清理与优化（7轮）

**目标：** 移除冗余代码，优化 API 设计，完善文档质量

**第一轮清理（~1000行）：**
- 删除 `packages/spark-app/src/events/AppEventBus.ts` - 完全未使用的事件总线系统
- 删除 `packages/spark-app/src/logger/README.md` - 子目录重复文档
- 删除 `packages/spark-app/src/constants/README.md` - 子目录重复文档  
- 删除 `packages/spark-app/src/environment/` - SSR 兼容层（SPA 不需要）
- 从 bootstrap 中移除对 DI 容器的依赖
- 新增 `simpleEnv.ts` 替代复杂的环境检测模块

**第二轮清理（~238行）：**
- 删除 `docs/guides/AUTO_IMPORT.md` - 描述未实现的 unplugin 配置
- 标记 DI 容器为 `@deprecated`，推荐使用 Composables API

**第三轮清理（~346行）：**
- 删除 `packages/spark-app/src/di/container.ts` - 完全移除依赖注入容器（314行）
- 删除 `provideAppContext()` - 未使用的包装函数
- 从 `index.ts` 移除 15+ 个废弃的导出
- 项目全面采用 Vue 3 Composables 模式

**第四轮优化（API 清理）：**
- 从公共 API 移除 6 个内部使用的函数导出
  - `useAppContextOptional`, `hasPermission`, `hasAnyPermission`
  - `hasAllPermissions`, `hasRole`, `hasAnyRole`
- 为所有内部函数添加 `@internal` 和 `@deprecated` JSDoc 标记
- 推荐使用 `usePermissions()` composable 替代旧的工具函数
- 更清晰的 API 边界，引导最佳实践

**第五轮优化（类型和文档）：**
- 优化 `simpleEnv.ts` 类型定义
  - 新增 `EnvironmentInfo` 接口替代内联类型
  - 添加详细 JSDoc 注释，提升 IDE 体验
- 为 7 个内部使用常量添加 `@internal` 标记
  - `BootstrapPhases`, `LogLevels`, `PermissionActions`
  - `ResourceTypes`, `StorageKeys`, `AppEvents`, `ConfigSources`
- 明确区分公共 API 和内部实现
- 减少开发者接触到的 API 表面积

**第六轮优化（文档完善）：**
- 重写 `packages/spark-app/README.md`
  - 移除已废弃的 API 示例（ConfigManager, createAuthGuard 等）
  - 更新为实际可用的 API（SparkApp.start, authService, Composables）
  - 添加完整的 Composables 使用示例
  - 新增 API 概览表格和类型定义参考
  - 新增最佳实践和迁移指南
- 确保文档与代码完全同步
- 所有示例代码可直接复制使用

**第七轮优化（API 示例修复）：**
- 修复 `packages/spark-utils/README.md`
  - Logger.create() → Logger(context)
  - Logger.consoleTransport() → createConsoleTransport()
  - Capability.create() → 使用正确的类型导入
  - PermissionChecker/Filter/FieldRenderHelper.create() → create* 函数
- 修复 `packages/spark-page-config/README.md`
  - new ConfigLoader() → createConfigLoader()
  - registerDynamicRoutes → setupDynamicRoutes
  - validatePageConfig → validateRouteConfig/validateRuleConfig
- 确保所有示例代码与实际导出 API 完全匹配

**清理成果：**
- 删除代码：~1584 行
- 删除模块：6 个
- 简化 API：移除 21+ 个导出（第三轮 15 个 + 第四轮 6 个）
- 标记内部 API：14 个（7 个函数 + 7 个常量组）
- 类型优化：1 个接口提取
- 文档重写/修复：3 个 README（spark-app、spark-utils、spark-page-config）
- 减少认知负担，统一使用 Composables 模式

### Documentation
- 更新 `ASYNC_DATA_LOADING.md` 文档，添加 DataViewKey详细说明
- 更新 `ASYNC_DATA_QUICK_REF.md` 快速参考，补充文本绑定示例

## [0.1.0] - 2026-02-04

### Added
- 初始版本发布
- SPARK 组件系统核心功能
- 混合渲染系统（Vue 组件 + 配置页面）
- DataSet 数据管理
- 页面配置加载器
- 异步数据加载支持
