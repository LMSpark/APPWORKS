# @spark-appworks/spark-utils

SPARK 的基础设施包，负责日志、请求层、文件加载器和通用类型，给上层包提供统一底座。

## 适用定位

- `spark-data`、`spark-project-model`、`spark-component`、`spark-app` 的共享底层
- 与具体 UI 框架解耦的通用能力
- 需要被多包复用的基础类型、符号和工具函数

## 主要模块

- 日志系统：`Logger` 及相关日志接口
- 请求层：统一请求实例、拦截器、错误处理
- 文件加载：`FileLoader` 与缓存策略
- 通用类型：权限、导航、HTTP、沙箱相关基础类型

## 基本使用

### 1. 在组件里提供和消费能力

```typescript
import { useSparkComponent } from '@spark-appworks/spark-component'
import { defineCapability } from '@spark-appworks/spark-component'

const USER_SERVICE = defineCapability<{
  getUser(id: string): { id: string; name: string }
}>('app:user-service')

const { sparkProvide, sparkConsume } = useSparkComponent({ type: 'user-panel' })

sparkProvide(USER_SERVICE, {
  getUser: (id) => ({ id, name: `User-${id}` }),
})

const userService = sparkConsume(USER_SERVICE)
```

### 2. 使用日志与请求层

```typescript
import { Logger, createRequest } from '@spark-appworks/spark-utils'

const logger = Logger('MyModule')
const request = createRequest({ baseURL: '/api' })

logger.info('ready')
const users = await request.get('/users')
```

## 结构约束

- 本包保持在基础层，避免依赖 `spark-data`、`spark-component`、`spark-app`。
- 能力键和能力类型由 `@spark-appworks/spark-component` 维护。
- 与 Vue、Element Plus、路由等框架绑定的逻辑不要落到本包。

## 开发命令

```bash
pnpm --filter @spark-appworks/spark-utils run build
pnpm --filter @spark-appworks/spark-utils run typecheck
pnpm --filter @spark-appworks/spark-utils run test:run
```

## 进一步阅读

- [../spark-component/README.md](../spark-component/README.md)
- [../../docs/README.md](../../docs/README.md)
