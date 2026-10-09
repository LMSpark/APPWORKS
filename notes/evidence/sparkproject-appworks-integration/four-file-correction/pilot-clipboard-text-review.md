# M0 复制 API 任务 1：主控只读审查

## 补证复审

上轮唯一阻断已关闭。新增 native delayed rejection 用例在 `tests/runtime/page/page-components-access.test.ts:62-88` 控制原生 `writeText` Promise：确认 settle 前 `copyText` 仍 pending、拒绝后以同一个 Error 对象 reject，并确认写入只调用一次（没有 retry）；`finally` 按原 descriptor 恢复或删除 clipboard stub。该断言直接覆盖计划要求的 native 拒绝传播。

生命周期新增断言见 `tests/runtime/page/runtime/page-script-lifetime.test.ts:43-61`。`it.each(['abort', 'dispose'])` 分别使 runtime 在写入等待期间失效，完成写入 Promise 后均断言脚本 Promise stale reject 且成功通知未执行。原有调用前 abort 用例仍断言宿主零调用。该参数化覆盖调用前与 await 后两侧防护需求。

修复结果记录报告聚焦两文件 13 项及 lint 通过；本次复审不重复运行验证。

## 审查结论

通过补证复审。原生 clipboard 拒绝传播缺口已补齐；新增 stub 在 `finally` 中恢复；abort 与 dispose 等待中失效都具有行为断言。此前针对任务 1 的其他审查项保持原结论，本次未扩大审查范围。
