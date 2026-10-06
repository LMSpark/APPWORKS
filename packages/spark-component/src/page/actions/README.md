# page/actions

页面声明式动作层：将 `rule.json` 中的按钮意图描述为强类型 `ActionDescriptor`，
由统一执行引擎 `executeActionDescriptor` 驱动，不依赖组件实例。

## 文件职责

| 文件 | 职责 |
|------|------|
| `action-types.ts` | 所有 ActionDescriptor 联合类型（14 种）、执行上下文接口、路由接口 |
| `executor-helpers.ts` | 执行器内部辅助工具：值解析、行辅助、通知、数据能力解析、BuiltinAction 元数据、禁用判断 |
| `action-data.ts` | 数据变更类执行器：append-row / delete / patch / move / message-row / refresh / clear-rows / set-field / submit-current-form |
| `action-executor.ts` | 主执行引擎：路由分发（dispatchAction）、UI 类动作、链式 then、错误处理 |
| `node-to-descriptor.ts` | SparkNode（r-button）props → ActionDescriptor 翻译器 |
| `button-templates.ts` | r-button 三层优先级样式解析（action 推导 → template 覆盖 → 显式 props）|
| `index.ts` | 模块统一导出入口 |

## 适用场景

1. `rule.json` 中的 `on` 事件绑定
2. 容器区域子节点（如 `r-toolbar` / `r-header` / `r-footer`）
3. 用配置代替脚本函数的零代码交互

## A/B/C 执行模型

| 术语 | 含义 |
|------|------|
| **A** | 组件默认行为（如表单 submit） |
| **B** | ActionDescriptor 业务处理 |
| **C** | `{ cancel: boolean }` 控制器（CancellableControl） |

`cancelDefault: true` 不由绑定层篡改事件参数，而是由 `action-executor.ts`
在执行 descriptor 时显式设置 `control.cancel = true`，并继续向 `then / onConfirm / onCancel`
链路透传，与容器/字段事件的 A/B/C 模型保持一致。

## 执行流程

数据动作及保存前的可用状态经 DataView 的集中权限入口取得，不能从公开行的权限字段或旧快照判断。批量目标必须逐行可用；保存检查包含编辑补丁、脏记录、删除快照和待新增记录。失败保留的旧结果暂停动作，过期请求身份明确失败。该检查只用于前端呈现与执行提示，后端仍依据签发快照验证写入；新增 allowAdd 不代表草稿字段授权。

```
SparkNode props
  → nodeToActionDescriptor()       翻译为 ActionDescriptor
  → executeActionDescriptor()      执行引擎入口
      → cancelDefault → control.cancel = true
      → dispatchAction()           按 action 字段路由到具体执行器
      → 异常捕获 + notifier 展示错误
      → then 链式动作（可嵌套）
```
