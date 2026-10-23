# 字典数据维护（dictionary-data-page）— I6 v3 语义卡

> 父卡：[`research-structured-config-dictionary-i6.md`](research-structured-config-dictionary-i6.md)。矩阵历史名：`dictionary-data-editor.vue`（参考 inventory **无**独立文件；本仓 **`dictionary-data-page.vue`** 为正式数据页，对齐 DATAFLOW / `vue-pages.json`）。

## 1. 语义卡

| 项 | 内容 |
| --- | --- |
| 入口 | `dictionary-data-page?dictionaryId=`（shellTool；tenant 前缀可选） |
| 目的 | 六业务字段 + ordIdx 条目 CRUD；不编辑方案 |
| 输入 | URL `dictionaryId` |
| 输出 | `saveData` 回执；列表刷新 |
| 取消 | discard / 重读核验 |
| 异常 | 缺 ID、未保存方案、权限拒绝、未知回执 |
| 下游 | 运行时 GetDictData / 选项源 |

## 2. 调用分类

| # | 能力 | 类别 | 落点 | vitest |
| --- | --- | --- | --- | --- |
| 1 | 读条目 | 模型查询 | `_Base_DictData` scoped by typeid | workflow |
| 2 | 新增/改/删条目 | 模型 save | `saveData` / `removeEntry` | workflow |
| 3 | 动态列标题 | 只读定义 | `fieldLabel` from definition | workflow |
| 4 | dirty / 关闭保护 | 页面编排 | system-page dirty source | workflow |

## 3. 布局 diff

| 项 | 合同 | 本仓（2026-10-22） | 状态 |
| --- | --- | --- | --- |
| 页头 | 独立数据页 | h1 + 当前方案名称/ID | **已补** |
| 表格+表单 | 选中行编辑 | Table + Form + 操作区 | 一致 |
| 按钮 | 新增/删/保存/重读 | 同文案 | 一致 |
| 当前行 | — | highlight + stripe | **已补** |

## 4. 实页

须已保存字典定义可读；条目权限随正式查询。vitest workflow 为主验收；实页走查待 I6 后期。
