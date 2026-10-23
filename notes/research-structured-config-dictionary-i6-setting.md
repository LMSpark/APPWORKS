# 字典方案设计（dictionary-setting）— I6 v3 语义卡

> 父卡：[`research-structured-config-dictionary-i6.md`](research-structured-config-dictionary-i6.md)。参考：`apps/appworks/.../dictionary-setting.vue`（270 行）。

## 1. 语义卡

| 项 | 内容 |
| --- | --- |
| 入口 | 目录对话框或独立路由（测试用 `/dictionary` + `dictionaryId`） |
| 目的 | 维护 TypeName、编码类型、六字段标题、functiondesc |
| 输入 | `dictionaryId`；`create` 时新 rowid |
| 输出 | `saveDesign` 回执；删除整资源 `removeDefinition` |
| 取消 | discard + 关闭；与目录 `editorPending` 联动 |
| 异常 | 校验失败、未知回执、切换 identity 时旧 save 迟到 |
| 下游 | 数据页读已保存标题；模型来源策划消费 `DictionarySchema` |

## 2. 调用分类

| # | 能力 | 类别 | 落点 | vitest |
| --- | --- | --- | --- | --- |
| 1 | 读定义 | 模型查询 | `DictionaryWorkspace.load` | workflow |
| 2 | 保存设计 | 模型 save | `saveDesign` → DataSet | workflow |
| 3 | 删除资源 | 模型 save + 完整性 | `removeDefinition` | workflow |
| 4 | 编码类型变更 | 业务校验 | `validateEntry` 全量编码 | workflow |

## 3. 布局 diff

| 项 | 合同 | 本仓 | 状态 |
| --- | --- | --- | --- |
| 表单字段 | TypeName、dictionaryType、六标题、functiondesc | `DictionarySchema` + 编码类型 select | 一致 |
| 按钮 | 保存/取消/删除 | 保存设计、取消设计修改并重读、放弃并关闭、删除字典资源… | 一致 |
| 容器 | 参考表单页 | 目录对话框内嵌或独立 mount | 可接受 |

## 4. 实页

`LowcodeDictionary.editorScenarioId` + pagedata 场景须可读；workflow vitest 覆盖主路径。
