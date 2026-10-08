# 新增输入与新行字段权限：现有合同复核

状态：只读发现，可用于后续恢复创建入口；没有实现模型或关系新增，不是权限放行结论。

## 当前源码事实

- `packages/spark-data/src/data-view.ts`：fieldAccess 只消费当前正式查询中的行权限；不存在当前行/上下文时返回 denied。addActionState 独立消费本次查询的新增权限。不能把 allowAdd 转成某个假新行的字段可写权限。
- 同文件 addRow 经原查询 owner 的 prepareNewRow 分配正式 key，再追踪 pending-create；不要求先把新行塞进 r-form 编辑，也不需要页面自己伪造权限。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context.ts`：prepareNewRow 剥离调用方凭据并确认唯一正式 key；prepareSaveChanges 的注释明确业务候选值交后端强验证。buildSaveRequest 为新增回放原查询的模型凭据（自引用子新增另走真实父行合同），prepareSaveRow 仍校验实际正式输出字段、拒绝 computed/未知字段。它不合成新行 fieldAccess，也不从任意旧行借编辑权限。
- `config/pages/data-platform/data-space-catalog/script.js` 的 addCatalogEntry 已采用独立输入收集：当前 addActionState 检查 → 正式授权候选项选择/名称描述输入 → 再次核新增状态 → 原 DataView.addRow → 同一 DataSet 明确行 saveChanges → 回读。取消输入前不追加行。旧 pilot plan 也明确记录这一取舍；这里只把当前源码作为现行依据。

## 后续实施决策边界

模型/关系创建不应因“没有不存在行的 fieldAccess”而永久禁用。已有可复用路径是：业务创建命令的输入表单独立于已存行编辑，提供按该用例核定的有限字段和正式可读候选；新增入口与提交前继续核当次 DataView.addActionState；正式身份/模型/字段校验和保存均走原 owner，服务器独立验证并返回拒绝或结果。

这不是“allowAdd 让全部字段可写”，不改变 r-form 的已存行权限合同，不显示隐藏/脱敏来源字段，不假造新行权限，不借首行/admin/客户端保存凭据。若某创建用例需要额外可见性或字段授权，仍须由该用例的真实接口/模型合同提供，不能因为输入来自用户就推定授予所有能力。

先完成当前 layout-lifetime，再按原页面语义分别收口来源模型创建和关系创建的输入、唯一性、默认值、取消、部分成功、回执与回读。本记录解决可用路径的证据，不授权并行修改当前页面，也不将旧悬而未决的通用提问当成新的接口事实。
