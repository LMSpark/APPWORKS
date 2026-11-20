# 统一请求层使用指南

## 概述

统一请求层提供了基于拦截器模式的现代化 HTTP 请求能力，支持：

- ✅ 拦截器系统（请求/响应双向拦截）
- ✅ 自动重试机制
- ✅ 内置缓存（GET 请求）
- ✅ 超时控制
- ✅ RESTful 快捷方法
- ✅ TypeScript 类型安全
- ✅ 错误处理和日志

## 快速开始

### 基本使用

```typescript
import { createRequest } from '@spark-appworks/spark-utils'

// 创建请求实例
const request = createRequest({
  baseURL: '/api',
  timeout: 10000
})

// GET 请求
const users = await request.get('/users')

// POST 请求
const newUser = await request.post<User>('/users', { name: 'John' })

// PUT 请求
const updatedUser = await request.put<User>('/users/1', { name: 'Jane' })

// DELETE 请求
await request.delete('/users/1')
```

### 带查询参数

```typescript
// GET /api/users?page=1&pageSize=10&status=active
const users = await request.get('/users', {
  page: 1,
  pageSize: 10,
  status: 'active'
})
```

## 拦截器系统

### 拦截器接口

拦截器使用 `RequestInterceptor` / `ResponseInterceptor` 对象注册，`use()` 返回取消函数。

#### 自定义请求拦截器

```typescript
// 添加认证头
const unsubscribe = request.interceptors.request.use({
  name: 'AuthInterceptor',
  onRequest: (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers = { ...config.headers, Authorization: `Bearer ${token}` }
    }
    return config
  },
  onRequestError: (error) => {
    console.error('请求失败:', error)
  }
})

// 移除拦截器
unsubscribe()
```

#### 自定义响应拦截器

```typescript
// 处理 { code, message, data } 标准应答格式
request.interceptors.response.use({
  name: 'ApiResponseInterceptor',
  onResponse: (response) => {
    const body = response.data as { code: number; message: string; data: unknown }
    if (body.code !== 0 && body.code !== 200) {
      throw new Error(`API 错误 ${body.code}: ${body.message}`)
    }
    return { ...response, data: body.data }
  },
  onResponseError: (error) => {
    if (error.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/'  // 跳平台首页，由路由守卫处理
    }
    return error
  }
})
```

#### 租户头拦截器示例

```typescript
request.interceptors.request.use({
  name: 'TenantInterceptor',
  onRequest: (config) => {
    const tenantId = localStorage.getItem('tenantId')
    if (tenantId) {
      config.headers = { ...config.headers, 'X-Tenant-Id': tenantId }
    }
    return config
  }
})
```

#### 日志拦截器示例

```typescript
request.interceptors.request.use({
  name: 'RequestLogger',
  onRequest: (config) => {
    console.log(`[HTTP] ${config.method} ${config.url}`)
    return config
  }
})

request.interceptors.response.use({
  name: 'ResponseLogger',
  onResponse: (response) => {
    console.log(`[HTTP] ${response.status} ${response.statusText}`)
    return response
  }
})
```

### 启动配置示例

```typescript
import { createRequest } from '@spark-appworks/spark-utils'

// 创建全局请求实例
const request = createRequest({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
  headers: { 'X-App-Version': '1.0.0' }
})

// 认证拦截器
request.interceptors.request.use({
  name: 'Auth',
  onRequest: (config) => {
    const token = localStorage.getItem('token')
    if (token) config.headers = { ...config.headers, Authorization: `Bearer ${token}` }
    return config
  }
})

// 响应拦截器
request.interceptors.response.use({
  name: 'Error',
  onResponseError: (error) => {
    if (error.status === 401) window.location.href = '/'  // 由路由守卫处理
    return error
  }
})

export { request }
```

## 高级功能

### 缓存

```typescript
// 启用缓存（仅 GET 请求）
const users = await request.get('/users', {}, {
  cache: true,
  cacheExpiry: 300000  // 缓存 5 分钟
})

// 清除缓存
request.clearCache('/users')      // 清除特定 URL（精确匹配）
request.clearCache()              // 清除所有缓存
```

> `clearCache(url)` 只按 URL 精确匹配（不含 query 参数部分），不会使用模糊包含匹配。

### 重试

```typescript
// 自动重试
const data = await request.get('/unstable-endpoint', {}, {
  retry: 3,          // 失败后重试 3 次
  retryDelay: 1000   // 每次重试延迟 1 秒
})
```

### 超时控制

```typescript
// 设置超时
const request = createRequest({
  baseURL: '/api',
  timeout: 5000  // 5 秒超时
})

// 单独请求的超时
const data = await request.get('/slow-endpoint', {}, {
  timeout: 30000  // 30 秒超时
})
```

### 不同响应类型

```typescript
// JSON（默认）
const data = await request.get<{ name: string }>('/data.json')

// 文本
const text = await request.get<string>('/script.js', {}, {
  responseType: 'text'
})

// Blob（文件下载）
const blob = await request.get<Blob>('/file.pdf', {}, {
  responseType: 'blob'
})
```

### 页面卸载期上报

```typescript
import { sendBeacon } from '@spark-appworks/spark-utils'

// 页面卸载期日志上报
sendBeacon('/logs/batch', { logs: [] }, '/api')
```

### 文件上传

```typescript
const formData = new FormData()
formData.append('file', file)
formData.append('name', file.name)

const result = await request.post('/upload', formData)
```

## 完整配置示例

### 业务 API 封装

```typescript
// services/UserService.ts
import { request } from './request'

export class UserService {
  async getUsers(params?: { page?: number; pageSize?: number }) {
    return request.get('/users', params)
  }

  async getUserById(id: number) {
    return request.get(`/users/${id}`)
  }

  async createUser(data: Partial<User>) {
    return request.post<User>('/users', data)
  }

  async updateUser(id: number, data: Partial<User>) {
    return request.put<User>(`/users/${id}`, data)
  }

  async deleteUser(id: number) {
    return request.delete(`/users/${id}`)
  }
}

export const userService = new UserService()
```

## 与现有代码集成

### 替换 fetch

```typescript
// 旧代码
const response = await fetch('/api/users')
const data = await response.json()

// 新代码
import { request } from './request'
const data = await request.get('/users')
```

### 与 FileLoader 集成

FileLoader 已经实现了文件加载功能，不需要替换。Request 主要用于业务 API 请求。

```typescript
// 配置文件加载 - 使用 FileLoader
import { createFileLoader } from '@spark-appworks/spark-utils'
const fileLoader = createFileLoader()
const config = await fileLoader.load('rule.json', { timestamp: 123456 })

// 业务 API 请求 - 使用 Request
import { request } from './request'
const users = await request.get('/users')
```

## 错误处理

```typescript
try {
  const data = await request.get('/api/endpoint')
} catch (error) {
  if (error instanceof Error) {
    const requestError = error as any
    console.error('错误信息:', error.message)
    console.error('HTTP 状态:', requestError.status)
    console.error('请求配置:', requestError.config)
  }
}
```

## 并发请求

```typescript
const [users, posts, comments] = await Promise.all([
  request.get('/users'),
  request.get('/posts'),
  request.get('/comments')
])
```

## 最佳实践

1. **使用全局实例**：创建一个全局 Request 实例并配置好拦截器
2. **业务 API 封装**：将 API 请求封装成服务类
3. **类型安全**：使用 TypeScript 泛型指定响应类型
4. **错误处理**：使用拦截器统一处理错误
5. **日志记录**：开发环境启用日志拦截器
6. **缓存策略**：对不频繁变化的数据启用缓存
7. **重试机制**：对不稳定的接口启用重试

## API 参考

### createRequest(config)

创建请求实例。

**参数**：
- `baseURL?: string` - 基础 URL
- `timeout?: number` - 超时时间（毫秒）
- `headers?: Record<string, string>` - 默认请求头

**返回**：`Request` 实例

### Request 实例方法

- `request<T>(config): Promise<T>` - 通用请求方法
- `get<T>(url, params?, config?): Promise<T>` - GET 请求
- `post<T>(url, data?, config?): Promise<T>` - POST 请求
- `put<T>(url, data?, config?): Promise<T>` - PUT 请求
- `patch<T>(url, data?, config?): Promise<T>` - PATCH 请求
- `delete<T>(url, config?): Promise<T>` - DELETE 请求
- `clearCache(url?): void` - 清除缓存

### RequestConfig

请求配置项：

```typescript
type RequestConfig = {
  url: string                        // 请求 URL
  method?: 'GET' | 'POST' | ...      // HTTP 方法
  params?: Record<string, any>       // 查询参数
  data?: any                         // 请求体
  headers?: Record<string, string>   // 请求头
  timeout?: number                   // 超时时间
  retry?: number                     // 重试次数
  retryDelay?: number                // 重试延迟
  cache?: boolean                    // 是否缓存
  cacheExpiry?: number               // 缓存过期时间
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer'
}
```

## 参考资料

- [Request 源码](./src/http/Request.ts)
- [FileLoader 源码](./src/http/FileLoader.ts)
- [HTTP 类型定义](./src/http/types.ts)
