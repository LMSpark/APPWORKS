# RendererTree 组件使用示例

## 基本用法

在 `tree-demo` 页面中已经展示了 RendererTree（r-tree）组件的基本使用方法。

### 1. 页面配置（rule.json）

```json
{
  "type": "r-tree",
  "dataSource": "hierarchicalTreeData",
  "props": {
    "node-key": "id",
    "highlight-current": true,
    "default-expand-all": false,
    "expand-on-click-node": false
  },
  "on": {
    "node-expand": "handleNodeExpand",
    "node-collapse": "handleNodeCollapse",
    "node-click": "handleNodeClick"
  }
}
```

### 2. 数据格式（pagedata.json）

RendererTree 需要**嵌套的层级结构**数据：

```json
{
  "hierarchicalTreeData": [
    {
      "id": 1,
      "label": "根节点",
      "name": "根节点",
      "type": "root",
      "children": [
        {
          "id": 2,
          "label": "子节点1",
          "name": "子节点1",
          "type": "child",
          "children": []
        },
        {
          "id": 3,
          "label": "子节点2",
          "name": "子节点2",
          "type": "child"
        }
      ]
    }
  ]
}
```

### 3. 必需属性

- **`label`**: 节点显示的文本（必需）
- **`id`**: 节点唯一标识（与 `node-key` 属性对应）
- **`children`**: 子节点数组（可选，嵌套结构）

## 关键特性

### 1. 数据绑定

使用 `dataSource` 属性自动绑定 pageData 中的数据：

```json
{
  "type": "r-tree",
  "dataSource": "hierarchicalTreeData"
}
```

这会自动从 `pageData.hierarchicalTreeData` 读取数据并传递给 el-tree 的 `data` 属性。

### 2. 事件处理

支持所有 el-tree 的事件：

```json
{
  "on": {
    "node-click": "handleNodeClick",
    "node-expand": "handleNodeExpand",
    "node-collapse": "handleNodeCollapse",
    "check": "handleCheck",
    "check-change": "handleCheckChange"
  }
}
```

在 script.js 中定义事件处理函数：

```javascript
function handleNodeClick(data, node, component) {
  console.log('节点被点击:', data)
  _pageState.selectedNode = data
}

function handleNodeExpand(data, node, component) {
  console.log('节点展开:', data)
}
```

### 3. 自定义节点内容

RendererTree 组件默认显示节点的 `label` 或 `name` 属性。

如果需要自定义节点渲染，可以在组件实现中使用 slot：

```vue
<template>
  <r-tree :data="treeData">
    <template #default="{ node, data }">
      <div class="custom-node">
        <span>{{ data.label }}</span>
        <span class="node-badge">{{ data.count }}</span>
      </div>
    </template>
  </r-tree>
</template>
```

## 与 el-tree 的区别

| 特性 | el-tree | r-tree (RendererTree) |
|------|---------|----------------------|
| 数据绑定 | 手动通过 `:data` | 自动通过 `dataSource` |
| 上下文提供 | 无 | 提供 `fieldContext='tree'` |
| 字段组件支持 | 无 | 支持 r-text, r-number 等 |
| 配置化使用 | 需要手动配置 | 直接在 rule.json 中使用 |

## 查看示例

访问 http://localhost:5174/tree-demo 查看完整的 RendererTree 示例。

## 注意事项

1. **数据结构**：必须使用嵌套结构（children），不支持扁平结构的自动转换
2. **label 属性**：确保每个节点都有 `label` 或 `name` 属性
3. **node-key**：设置 `node-key` 属性以指定节点的唯一标识字段
4. **事件参数**：事件处理函数接收 `(data, node, component)` 三个参数
