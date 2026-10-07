# 插件管理系统

**位置**: `@spark-appworks/spark-app/plugins`
**职责**: 提供统一的插件注册、配置和加载机制

## 📋 概述

插件管理系统是 SparkApp 应用层基础设施的重要组成部分，提供：

- ✅ **统一注册表**: 管理插件名称到加载器的映射
- ✅ **配置驱动**: 通过 JSON 配置控制插件加载
- ✅ **动态加载**: 按需加载插件，支持懒加载
- ✅ **优先级控制**: 控制插件加载顺序
- ✅ **类型安全**: 完整的 TypeScript 类型支持
- ✅ **可扩展**: 支持注册自定义插件
- ✅ **跨项目复用**: 可在任何 SPARK 应用中使用

## 🏗️ 架构

### 核心组件

```
plugins/
├── index.ts              # 统一导出
├── registry.ts           # createPluginRegistry/getGlobalPluginRegistry + PluginManager
└── presets.ts            # 内置插件预设
```

### 类图

```
┌─────────────────────────┐
│  PluginRegistry         │  插件注册表实例
├─────────────────────────┤
│ + register()            │  注册插件加载器
│ + get()                 │  获取插件加载器
│ + has()                 │  检查是否已注册
│ + getAll()              │  获取所有插件
└─────────────────────────┘
            ▲
            │ create/get
            │
┌─────────────────────────┐
│ createPluginRegistry()  │  创建隔离注册表
│ getGlobalPluginRegistry() │ 获取全局注册表
└─────────────────────────┘
            │
            │ 使用
            ▼
┌─────────────────────────┐
│   PluginManager         │  插件管理器
├─────────────────────────┤
│ + loadPlugins()         │  批量加载插件
│ + loadPlugin()          │  加载单个插件
└─────────────────────────┘
```

## 🔧 核心 API

### Registry APIs

```typescript
// 创建隔离注册表（测试/微前端）
const registry = createPluginRegistry()

// 获取全局注册表（应用默认）
const globalRegistry = getGlobalPluginRegistry()

// 常用能力
registry.register(id, loader)
registry.registerAll(loaders)
registry.get(id)
registry.has(id)
registry.getAll()
registry.unregister(id)
registry.clear()
```

### PluginManager

```typescript
class PluginManager {
  // 根据配置加载插件（批量）
  static async loadPlugins(
    configs: Record<string, PluginConfig>
  ): Promise<PluginInstance[]>

  // 加载单个插件
  static async loadPlugin(
    id: string,
    config: PluginConfig
  ): Promise<PluginInstance | null>
}
```

### Types

```typescript
// 插件配置（支持简单和详细格式）
type PluginConfig = boolean | {
  enabled: boolean
  options?: Record<string, any>
  priority?: number
  lazy?: boolean
}

// 插件加载器
type PluginLoader = {
  id: string
  name: string
  module: string
  loader: () => Promise<{ default: Plugin }>
  defaultOptions?: Record<string, any>
  description?: string
  version?: string
}

// 插件实例（加载后）
type PluginInstance = {
  plugin: Plugin
  options?: Record<string, any>
  loader: PluginLoader
}
```

## 📚 使用示例

### 1. 基本用法

```typescript
import {
  registerBuiltinPlugins,
  PluginManager
} from '@spark-appworks/spark-app'

// 注册内置插件
registerBuiltinPlugins()

// 加载插件
const plugins = await PluginManager.loadPlugins({
  'element-plus': true,
  'vxe-table': {
    enabled: true,
    options: { zIndex: 999 }
  }
})

// 使用插件
plugins.forEach(({ plugin, options }) => {
  app.use(plugin, options)
})
```

### 2. 注册自定义插件

```typescript
import { getGlobalPluginRegistry } from '@spark-appworks/spark-app'

getGlobalPluginRegistry().register('pinia', {
  name: 'Pinia',
  module: 'pinia',
  loader: async () => {
    const { createPinia } = await import('pinia')
    return { default: createPinia() }
  },
  description: 'Vue 状态管理'
})
```

### 3. 在 SparkApp.start() 中使用

```typescript
import { SparkApp, registerBuiltinPlugins, PluginManager } from '@spark-appworks/spark-app'

async function startApp() {
  registerBuiltinPlugins()

  const config = await loadConfig()
  const pluginInstances = await PluginManager.loadPlugins(config.plugins)
  const plugins = pluginInstances.map(p => p.plugin)

  await SparkApp.start({
    rootComponent: App,
    plugins
  })
}
```

## 🎨 内置插件

### Element Plus

```typescript
{
  id: 'element-plus',
  name: 'Element Plus',
  module: 'element-plus',
  defaultOptions: {
    size: 'default',
    zIndex: 2000
  }
}
```

### VXE Table

```typescript
{
  id: 'vxe-table',
  name: 'VXE Table',
  module: 'vxe-table',
  defaultOptions: {}
}
```

## 🔄 工作流程

```
1. 注册插件加载器
  getGlobalPluginRegistry().register('my-plugin', loader)

2. 定义插件配置（JSON）
   { "my-plugin": { "enabled": true, "options": {...} } }

3. 加载插件
   PluginManager.loadPlugins(config)

4. 按优先级排序
   priority: 1 → 2 → 3 → ...

5. 动态导入模块
   await loader.loader()

6. 合并选项
   { ...defaultOptions, ...userOptions }

7. 返回插件实例
   { plugin, options, loader }
```

## 🎯 设计原则

### 1. 关注点分离

- **PluginRegistry**: 管理映射关系
- **PluginManager**: 管理加载流程
- **Presets**: 提供预设插件

### 2. 配置驱动

通过 JSON 配置控制插件行为，无需修改代码。

### 3. 类型安全

所有 API 都有完整的 TypeScript 类型定义。

### 4. 可扩展性

支持注册自定义插件，不限于内置插件。

### 5. 配置兼容

支持简单布尔值和详细配置对象两种格式。

## 📈 性能优化

### 动态导入

```typescript
loader: () => import('element-plus')  // 懒加载
```

### 按需加载

```json
{
  "element-plus": true,   // 启用
  "vxe-table": false      // 禁用（不加载）
}
```

### 优先级控制

```json
{
  "pinia": { "priority": 0 },         // 状态管理先加载
  "element-plus": { "priority": 1 }   // UI 框架后加载
}
```

## 🧪 测试

```typescript
import { createPluginRegistry, PluginManager } from '@spark-appworks/spark-app'

describe('registry', () => {
  it('should register plugin', () => {
    const registry = createPluginRegistry()
    registry.register('test', {
      name: 'Test',
      module: 'test',
      loader: () => import('./test')
    })

    expect(registry.has('test')).toBe(true)
  })
})

describe('PluginManager', () => {
  it('should load plugins', async () => {
    const plugins = await PluginManager.loadPlugins({
      'test': true
    })

    expect(plugins).toHaveLength(1)
  })
})
```

## 🔗 相关文档

- [SparkApp 包说明](../../../README.md)
- [文档入口](../../../../../docs/README.md)

## 🚀 未来扩展

### 支持的扩展方向

- [ ] 异步插件初始化
- [ ] 插件依赖管理
- [ ] 插件生命周期钩子
- [ ] 插件热重载
- [ ] 插件版本兼容性检查
- [ ] 插件性能监控

### 示例：插件依赖

```typescript
getGlobalPluginRegistry().register('my-plugin', {
  name: 'My Plugin',
  module: './my-plugin',
  loader: () => import('./my-plugin'),
  dependencies: ['element-plus']  // 依赖 element-plus
})
```

---

**维护者**: SPARK Team
**最后更新**: 2026-02-10
