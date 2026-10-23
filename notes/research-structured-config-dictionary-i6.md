# structured-config I6 hub（v3）

> **子域研读卡**：[字典](research-structured-config-dictionary-i6.md)（本文件下文 §字典） · [data-code](research-structured-config-data-code-i6.md) · [logic-view](research-structured-config-logic-view-i6.md) · [workflow-definition](research-structured-config-workflow-definition-i6.md)
> **实施计划**：[`plan-structured-config-i6-full.md`](plan-structured-config-i6-full.md) · **API 缺口**：[`api-gaps.json`](evidence/structured-config-i6/api-gaps.json)
> **vitest**：`tests/runtime/page/dictionary`（58）+ `tests/runtime/page/structured-config`（40）
> **下一迭代 I7**：[`research-semi-structured-i7-hub.md`](research-semi-structured-i7-hub.md)

---

# 字典专题（structured-config / data-dictionary）— I6 v3 研读卡

> 模板：[`resource-topic-template.md`](../docs/guides/resource-topic-template.md)。矩阵行：`data-dictionary-list-page`、`dictionary-setting`、`dictionary-data-page`（`dictionary-data-editor.vue` 路径待核对）。

## 1. 原理

| 项 | 内容 |
| --- | --- |
| 业务目的 | 程序员维护字典**方案**（类型、结构、编码规则）；业务用户维护**条目**数据 |
| 配置 vs 数据 | 设计：`_Base_DictType` + 结构元数据；数据：条目模型经 `LowcodeDictionary.loadEditor` 装配 |
| 数据空间 | `LowcodeDictionary` 资源；设计/数据 **分界面、分保存**（AGENTS 0.5 字典样板） |
| 执行链 | 标准组件 → DataView → DataSet.saveChanges；目录页 `data-dictionary-list-page` 绑定 catalog DataView |
| 下游 | 运行时字典消费、其它专题 option 源 |

## 2. 方案设计（本仓落点）

| UI | 职责 | 源码 |
| --- | --- | --- |
| 目录 | 列表、筛选、打开设计对话框、跳转数据页 | `data-dictionary-list-page.vue` |
| 设计 | 方案字段、结构、保存/删除 | `dictionary-setting.vue` + `use-dictionary-workspace.ts` |
| 数据 | 条目 CRUD（独立路由/页） | `dictionary-data-page.vue` |

## 3. 数据维护

- 数据页与 design 分离；保存范围仅为条目，不夹带方案标题（workflow 测试覆盖）。
- 权限：消费正式查询数据权限（本阶段 AGENTS 0.3 暂缓扩展专题验收）。

## 4. 调用分类（初稿）

| # | 能力 | 类别 | 落点 | vitest |
| --- | --- | --- | --- | --- |
| 1 | 字典目录查询 | 模型查询 | catalog DataView + list page | `dictionary-catalog.test.ts` |
| 2 | 方案 save/delete | 模型保存 | design workspace DataSet | `dictionary-workflow.test.ts` |
| 3 | 条目 save | 模型保存 | data page DataSet | workflow 数据用例 |
| 4 | 创建人显示 | 模型查询 | `Base_UserInfo` 可选 | catalog 测试 |

## 5. 验证基线（2026-10-22）

`pnpm exec vitest run tests/runtime/page/dictionary` → **58/58 通过**（含 `当前方案：配色` heading、目录方案设计、打开数据维护 tenant/非 tenant）。

## 6. 语义 diff（已核实项）

| 参考/合同 | 本仓 | 结论 |
| --- | --- | --- |
| 设计/数据分界面、分保存 | `dictionary-setting` / `dictionary-data-page` | 一致（DATAFLOW §字典） |
| 目录 → 数据维护带 `dictionaryId` | `openData` router.push | **已修**：无 tenant 前缀时原逻辑静默 return；现回退 feature 绝对路径 |
| 矩阵 `dictionary-data-editor.vue` | `dictionary-data-page.vue` | 命名差异，行为=data 维护页 |

## 7. I6 待办（相对 v3 / 矩阵）

| 项 | 状态 |
| --- | --- |
| 三页语义卡 | [`list-v3`](research-structured-config-dictionary-i6-list.md) / [`setting-v3`](research-structured-config-dictionary-i6-setting.md) / [`data-v3`](research-structured-config-dictionary-i6-data.md) |
| 页头与高亮（目录/数据） | **2026-10-22 已补**（对齐服务器管理页网格布局） |
| 参考仓逐屏文案微调 | 待授权实页或参考源码只读 diff |
| 整页矩阵「语义/合同/页面/实页」列 | 语义/页面 **部分**；实页待走查 |
| 与 database-management 无交叉依赖 | — |

## 8. 下一动作

参考仓逐屏文案/字段对照；编码类型变更 vs 存量条目校验等 workflow 已有测试，实页走查待 I6 后期。

## 9. page vitest（2026-10-22 续）

目录：方案设计对话框、打开数据维护（tenant / 非 tenant 路径）；`tests/runtime/page/dictionary` 合计 **57** 例。
