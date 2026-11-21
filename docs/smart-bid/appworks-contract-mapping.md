# 新投标 APP 在 AppWorks 的契约映射

日期：2026-11-21。本文只说明“正式方案如何落到当前 AppWorks 源码”；源码存在不等于真实服务和浏览器业务验收，后者以[唯一迁移台账](../../notes/data-space-retirement-ledger.md)为准。

## 当前实现边界

- 目标范围：6 个业务模块、21 个能力节点、19 个逻辑页面。
- 平台侧 3 页由宿主承接；SmartBid 业务侧实现 16 个 `page04`–`page19` 四文件页面。
- 47 个业务 ClassModel 与 61 个公开动作已形成源码与生成闭包。
- `rule.json` 负责结构、绑定和标准动作；16 个业务页脚本默认空，页面不复制查询、权限、草稿或保存 owner。
- `pagedata.json` 是场景共享第四文件，不在每页复制。
- Agent 在前端运行，通过后端 SSE/turn 桥接；注册与指南由源码声明及 ClassModel 自动生成。

## 来源与真源

| 契约 | 当前 AppWorks 落点 | 边界 |
| --- | --- | --- |
| 项目蓝图、节点与导航 | `spark-project-model` 蓝图与运行导航 | 节点身份不等于业务实例身份 |
| 四文件与运行实例 | PageTool + 共享场景配置 + PageRuntime | 三工具文件与场景文件分别读取，整组 proof 后物化 |
| 业务数据 | `PageRuntime -> DataSet -> DataTable -> DataView` | 页面不建立第二套 rows、权限、草稿或保存器 |
| 动作发现与执行 | SmartBidOperationModule、公开 action modules、ClassModel | 声明存在不证明服务 owner 已完成业务写入 |
| Agent 轮次 | 前端 host、SSE、tool result 回传 | 只有原业务 owner 回执可标记 `ACTION_APPLIED` |
| 保存恢复 | 原 DataView owner/receipt | unknown 只核原捕获，不自动重发 |

## 19 页承载

| 页面范围 | 承载方式 | 当前状态边界 |
| --- | --- | --- |
| 01–03 平台页 | 现有平台宿主、数据空间和服务页面 | 归平台能力，不复制到 SmartBid 目录 |
| 04–10 权威资料、项目与响应 | `authority` / `collaboration` / `followup` / `response` 下四文件页 | 源码与声明已收敛；真实服务权限和写回按页验证 |
| 11–15 编制、制作、递交与协作 | `authoring` / `collaboration` 下四文件页 | 零脚本动作已统一；候选、采用、实发、回执仍分别核正式结果 |
| 16–17 知识与 ClassModel | `knowledge` 页与生成产物 | 只读指南/声明不能替代实例绑定和业务回执 |
| 18 Agent 作业 | Page18 host + 前端 SSE + command/claim DataView | 必须取得原 owner receipt；否则为 `NO_ACTION_RECEIPT` |
| 19 配置编审 | `configuration` 页与启停动作 | 编译、发布和实服指针分别验收 |

## 必须保留的业务边界

1. 一棵项目内容树与一个已采用修订头；来源文件不是第二编辑根。
2. Candidate、Adoption、Delivery 分别保存，候选不自动成为正式内容。
3. 签署、递交和回执分别证明，渠道回执不能替代实际内容反查。
4. 数据库、pagedata、工具文件和业务命令分别确认结果，不承诺跨来源事务。
5. 前端无角色授权；组件只消费当次 DataView 的数据权限。
6. 四文件和声明式动作是页面实现机制，不是完成业务验收的证明。

## 验收与开放项

源码级交付已覆盖：

- 47/61 的声明与生成闭包。
- 16 个业务页零脚本与标准动作。
- published route、PageRuntime、DataView owner 和 command envelope 收敛。
- package、规则、ClassModel 与生产构建验证。

仍须分别取得：

- 正式服务的写入、权限和原请求终态。
- 19 页冷重开、字段权限、取消、unknown 恢复和下游回读。
- 实际制件、签署、递交、截止及评分证据。

具体断点与最新现场状态只追加到[唯一台账](../../notes/data-space-retirement-ledger.md)，不在本映射重复保存第二份进度。
