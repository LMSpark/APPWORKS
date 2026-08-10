# @spark-appworks/spark-app

> SPARK 应用层基础设施 - 提供应用启动、认证上下文接线、路由守卫、错误处理和日志系统

## 特性

- ⚡ **SparkApp.start()** - 声明式应用启动（推荐）
- 🔐 **Authentication Context** - 由应用宿主注入后端无关的认证上下文
- 🛡️ **Router Guards** - 鉴权和权限检查
- 🚨 **Error Boundary** - 全局错误处理
- 📝 **Logger** - 多级别、多传输器日志系统
- 🎯 **Composables** - Vue 3 组合式 API（推荐）

## 安装

```bash
pnpm add @spark-appworks/spark-app
```

## 快速开始

### 1. 使用 SparkApp.start()（推荐）

最简单的方式 - 100% 声明式配置：

```typescript
import { SparkApp } from '@spark-appworks/spark-app'
import App from './App.vue'

await SparkApp.start({
  rootComponent: App,
  routerMode: 'history',
  config: {
    apiBaseUrl: '/api',
    logLevel: 'debug',
    enableMock: import.meta.env.DEV
  },
  authenticate: async (config) => resolveAppContext(config)
})
```

### 2. 使用 SparkApp.bootstrap()（高级用法）

需要更多控制时：

```typescript
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { SparkApp } from '@spark-appworks/spark-app'
import App from './App.vue'
import routes from './routes'

const app = createApp(App)
const router = createRouter({ 
  history: createWebHistory(),
  routes 
})

await SparkApp.bootstrap({
  app,
  router,
  config: {
    apiBaseUrl: '/api',
    logLevel: import.meta.env.DEV ? 'debug' : 'warn'
  },
  authenticate: async (config) => resolveAppContext(config),
  beforeMount: async (context) => {
    console.log('即将挂载', context)
  }
})
```

## 核心功能

### 认证上下文

```typescript
import { SparkApp, type BootstrapAuthenticate } from '@spark-appworks/spark-app'

const authenticate: BootstrapAuthenticate = async (config) => {
  const session = sessionStore.get()
  return session === null ? publicContext(config) : sessionContext(session, config)
}

await SparkApp.start({ rootComponent: App, config, authenticate })
```

### 日志 API

```typescript
import { createLogger } from '@spark-appworks/spark-app'

const logger = createLogger('MyComponent')

logger.info('应用启动')
logger.warn('警告信息', { code: 400 })
logger.error('错误信息', new Error('Something went wrong'))
logger.debug('调试信息', { data: {...} })
```

### 服务访问（推荐使用 SPARK 能力系统）

```typescript
import { PAGE_RUNTIME_SERVICES, useSparkComponent } from '@spark-appworks/spark-component'
import { useRouter } from 'vue-router'
import { Logger } from '@spark-appworks/spark-utils'

export default {
  setup() {
    // 方式 1：直接使用标准工具（推荐）
    const router = useRouter()  // vue-router
    const logger = Logger('MyComponent')  // 工厂函数
    logger.info('组件初始化')
    
    // 方式 2：通过页面运行时服务能力获取（组件内）
    const { sparkConsume } = useSparkComponent({ type: 'my-comp' })
    const services = sparkConsume(PAGE_RUNTIME_SERVICES)
    if (services) {
      services.router?.push('/home')
      services.logger?.info('Action')
      services.auth?.logout()
    }
    
    return { router, logger }
  }
}
```

### 组件注册表访问

```typescript
import { useSparkRegistry } from '@spark-appworks/spark-app'

export default {
  setup() {
    // 访问 SPARK 组件注册表
    const registry = useSparkRegistry()
    const hasComponent = registry.has('my-component')
    
    return { hasComponent }
  }
}
```

### 配置管理

```typescript
import { loadConfig, isFeatureEnabled } from '@spark-appworks/spark-app'

// 加载配置
const config = await loadConfig({
  apiBaseUrl: '/api',
  enableMock: true,
  features: {
    enableExport: true
  }
})

// 检查功能开关
if (isFeatureEnabled(config, 'enableExport')) {
  // 显示导出功能
}
```

### 错误处理

```typescript
import { setupErrorHandler, createErrorBoundary } from '@spark-appworks/spark-app'

// 全局错误处理
setupErrorHandler(app, {
  enableFallback: true
})

// 错误边界组件
const ErrorBoundary = createErrorBoundary((error) => {
  // 自定义降级 UI
  return h('div', `发生错误: ${error.message}`)
})
```

## API 概览

### SparkApp 命名空间

| API | 描述 | 类型 |
|-----|------|------|
| `SparkApp.start()` | 启动应用（推荐） | 高级 API |
| `SparkApp.bootstrap()` | 初始化流水线 | 中级 API |
| `SparkApp.setupRouterGuards()` | 设置路由守卫 | 工具函数 |
| `SparkApp.setupErrorHandler()` | 设置错误处理 | 工具函数 |
| `SparkApp.loadConfig()` | 加载配置 | 工具函数 |
| `SparkApp.createAppContext()` | 创建应用上下文 | 工具函数 |

### 服务访问方式

| 方式 | 用途 | 示例 |
|------|------|------|
| `useRouter()` from vue-router | 路由导航 | `const router = useRouter()` |
| `Logger('module')` 工厂函数 | 日志记录 | `const logger = Logger('MyComponent')` |
| `sparkConsume(PAGE_RUNTIME_SERVICES)` | 页面运行时服务能力 | `const services = sparkConsume(PAGE_RUNTIME_SERVICES)` |
| `useSparkRegistry()` | 组件注册表 | `const registry = useSparkRegistry()` |

### 认证接线

| 方法 | 描述 |
|------|------|
| `BootstrapAuthenticate` | 应用宿主解析认证上下文的稳定契约 |
| `authenticate(config)` | 返回当前 `AppContext`，不绑定任何后端路径 |

### 日志系统

| 方法 | 描述 |
|------|------|
| `createLogger(scope)` | 创建作用域日志 |
| `logger.debug(msg, data?)` | 调试日志 |
| `logger.info(msg, data?)` | 信息日志 |
| `logger.warn(msg, data?)` | 警告日志 |
| `logger.error(msg, error?)` | 错误日志 |

## 类型定义

```typescript
type AppContext = {
  user: UserInfo
  tenant: TenantInfo
  env: EnvironmentInfo
  config: Record<string, unknown>
  initializedAt: string
}

type UserInfo = {
  id: string | number
  name: string
  email?: string
  roles: string[]
  permissions: string[]
}

type TenantInfo = {
  id: string
  name: string
  domain?: string
}
```

## 最佳实践

### ✅ 推荐用法

```typescript
// 使用 vue-router 标准 API
import { useRouter } from 'vue-router'
const router = useRouter()

// 使用 Logger 工厂函数
import { Logger } from '@spark-appworks/spark-utils'
const logger = Logger('MyComponent')

// 使用 SPARK 能力系统
import { PAGE_RUNTIME_SERVICES, useSparkComponent } from '@spark-appworks/spark-component'
const { sparkConsume } = useSparkComponent({ type: 'my-comp' })
const services = sparkConsume(PAGE_RUNTIME_SERVICES)

// 使用命名空间 API
await SparkApp.start({ ... })
```

## 依赖

```json
{
  "vue": "^3.4.0",
  "vue-router": "^4.2.0"
}
```

## 开发命令

```bash
pnpm run typecheck   # 类型检查
pnpm run lint        # 代码检查
pnpm run test        # 运行测试
pnpm run build       # 构建包
```

## 更新日志

查看 [CHANGELOG.md](../../CHANGELOG.md) 了解详细的更新历史。

## License

MIT

