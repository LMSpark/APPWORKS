# 字典目录（data-dictionary-list-page）— I6 v3 语义卡

> 父卡：[`research-structured-config-dictionary-i6.md`](research-structured-config-dictionary-i6.md)。参考路径（inventory）：`apps/appworks/.../data-dictionary-list-page.vue`（565 行，含 list-page-shell；**数据维护在本仓拆为独立路由**）。

## 1. 语义卡

| 项 | 内容 |
| --- | --- |
| 入口 | 导航 `blueprintScenarioId` → `LowcodeDictionary.loadCatalog` |
| 目的 | 应用内字典方案目录；筛选、选中、打开设计或数据页 |
| 输入 | 导航场景 ID；隐式 `DictionaryCatalogInput.AppId` 级联 |
| 输出 | 选中 `rowid`；设计对话框或 `dictionary-data-page?dictionaryId=` |
| 取消 | 关闭设计对话框 → `DictionarySetting` discard；目录刷新清选中 |
| 异常 | 缺 scenarioId、用户目录失败、创建人未解析（status 提示） |
| 下游 | `dictionary-setting`、`dictionary-data-page` |

## 2. 调用分类

| # | 能力 | 类别 | 落点 | vitest |
| --- | --- | --- | --- | --- |
| 1 | 目录查询/筛选/排序 | 模型查询 | catalog `_Base_DictType` + 级联 | catalog.test |
| 2 | 新增字典（草稿 ID） | 模型查询+后续 saveDesign | 对话框 `create=true` | catalog（未保存不读设计） |
| 3 | 方案设计 | 模型 save（子组件） | `DictionarySetting` | catalog 打开对话框 |
| 4 | 打开数据维护 | 页面编排 | `router.push` + tenant | catalog 双路径 |
| 5 | 创建人/分类选项 | 模型查询 | `Base_UserInfo` / `Base_StructureType` | catalog |

## 3. 布局 diff（本仓 vs 参考 / DATAFLOW）

| 项 | 参考/合同 | 本仓（2026-10-22） | 状态 |
| --- | --- | --- | --- |
| 页头标题 | list-page-shell 标题区 | `h1` 数据字典 + 说明（对齐 `vue-pages.json`） | **已补** |
| 工具栏四按钮 | 新增、设计、数据维护、刷新 | 新增字典、方案设计、打开数据维护、刷新 | 语义一致 |
| 列表列 | TypeName、functiondesc、分类、创建人、时间 | 同字段绑定 | 一致 |
| 设计容器 | 参考内嵌 setting | 对话框 + footer 关闭 | 分界面一致 |
| 数据维护 | 参考可能同页抽屉/路由 | **独立** `dictionary-data-page` | 本仓目标架构 |
| 当前行高亮 | 常见 list-page 行为 | `highlight-current-row` + stripe | **已补** |

## 4. 实页

依赖导航 FormKey 下 `_Base_DictType` 等正式模型可读；无 I5 式五表 gap 专档，仍须授权环境走查。vitest **57** 不替代实页。
