# 数据编码（data-code）— I6 v3 研读卡

> 父卡：[research-structured-config-dictionary-i6.md](research-structured-config-dictionary-i6.md)。导航 FormKey：`A133D679691178F192D7E9DA06829506`（live-navigation）。

## 1. 原理

| 项 | 内容 |
| --- | --- |
| 业务目的 | 维护编码方案（规则树/节点）与辅助配置（序列、类、父码、时间片、初始化数据） |
| 配置 vs 运行 | 方案设计在 editor；取号/测试生成走 `/api/Codeing/*` 专用接口（D7） |
| 参考 API | `DataCode.ts`（catalog page/remove）；`DataCodeEdit.ts`（detail/save/对话框数据） |

## 2. 本仓落点

| UI | 职责 |
| --- | --- |
| `data-code-list-page.vue` | 目录、打开方案设计、删除、刷新 |
| `data-code-editor-page.vue` | 规则设计 + 打开 6 对话框 |
| `ui/dialogs/*` | 类选择、父码、序列、时间片、初始化、类编辑 |

## 3. 调用分类

| # | 能力 | 类别 | 落点 |
| --- | --- | --- | --- |
| 1 | 编码目录 | 模型查询 | catalog DataView |
| 2 | 方案 detail/save | 写命令/专用 POST | `DataCodeDesignClient` |
| 3 | 序列/类/初始化 | 专用 POST | 对话框 + client |
| 4 | 测试生成 | 只读/写命令 | `/api/Codeing/TestGetCodeString` 等（缺口登记） |

## 4. 缺口

见 [api-gaps.json](evidence/structured-config-i6/api-gaps.json) `dataCode`.
