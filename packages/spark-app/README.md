# @spark-appworks/spark-app

SPARK 应用壳基础设施：负责应用启动、动态导航、页面运行实例、路由、插件、主题、日志与应用级错误边界。

## 职责边界

- 组合 Vue、Vue Router、`spark-component` 与 `spark-project-model`，不承载数据模型或业务页面。
- 通过宿主注入认证、导航、场景装载和页面文件读取；不写死后端服务地址或保存平台凭据。
- 页面运行数据由 `PageRuntime` 与 `DataSet`/`DataView` 承接，应用壳不建立第二套查询或保存链。
- `spark-utils` 提供框架无关基础；`spark-component` 持有组件注册与页面运行时能力。

## 公共入口

包只公开根入口 `@spark-appworks/spark-app`。

### 启动与上下文

- `SparkApp.start` / `start`
- `bootstrap`
- `createAppContext`
- `AppContext`、`AppConfig`、`BootstrapAuthenticate`、`StartOptions`

```ts
import {SparkApp} from '@spark-appworks/spark-app'
import App from './App.vue'

await SparkApp.start({
  rootComponent: App,
  config: {
    apiBaseUrl: '/api',
  },
  authenticate: async () => resolveCurrentAppContext(),
})
```

具体配置字段以 `src/app/start.ts`、`src/app/bootstrap.ts` 和导出的 TypeScript 类型为准。

### 导航与页面运行

- `DynamicRouter` / `createDynamicRouter`
- `NativePageRuntimeSession`
- `setupRouterGuards`
- `normalizeNavRuntimePath` / `resolveNavNodeRuntimeTarget`
- `useNavigation` / `useNav` / `useTabPages`
- 运行导航类型、receipt 类型与 page publication 类型

### 插件、主题与页面宿主

- `PluginManager`、`PluginRegistry` 与 preset 注册能力
- `createThemeService`、`useTheme`
- `AppPageUiHost`、页面对话框/选择器服务
- `setupAutoRegister`
- `useSystemPageDirtySource`

### 日志、错误与 AI 适配

- `createLogger` / `createAppLogger`
- 全局 transport 配置
- `setupErrorHandler` / `createErrorBoundary`
- `createAiRunAdapter`、`createAiToolApprovalBridge`
- `useSparkRegistry`

AI Agent、ClassModel 和业务模型不属于本包；它们分别由 `@spark-appworks/spark-ai` 与对应业务宿主实现。

## 依赖关系

运行时依赖 Vue、Vue Router，以及 AppWorks workspace 的 AI、组件、数据、JSON、项目模型和公共工具包。根应用开发与测试通过源码 alias 读取 workspace，不依赖已构建的 `dist/`。

## 验证

```bash
pnpm --filter @spark-appworks/spark-app run typecheck
pnpm --filter @spark-appworks/spark-app run lint
pnpm --filter @spark-appworks/spark-app run test:run
pnpm --filter @spark-appworks/spark-app run build
```

架构与发布说明见 [仓库文档入口](../../docs/README.md)。

## License

MIT
