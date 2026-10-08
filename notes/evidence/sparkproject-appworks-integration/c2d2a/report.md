# C2d2a 冻结报告

状态：冻结待主控复审

此切片仅在 dispatch 的 5 文件范围内贯通应用目录/选择 receipt。平台公开 `LowcodeApplicationSelectionReceipt` 只提供同步 `assertCurrent()`；激活返回值由应用/root字段与此契约组成，目录与激活都使用同一私有签发逻辑。`enterApplicationCatalog()` 开始新的平台选择意图后清空 application，并签发期待当前 application 为空的 receipt。新 activation 即使仍在 list 首次 await 中，也会立即撤销旧目录 receipt；后续 clear、session更换、意图替换或应用上下文变为非空都会使 receipt stale，同身份 token refresh保持有效。

`packages/spark-lowcode-api/src/index.ts` 显式导出该公共 type。runtime 的两个选择 wrapper 返回平台签发的同一 receipt 对象；activation wrapper 在外层 await 后仍先执行 `assertCurrent()`。变化已写入返回类型和 JSDoc。App/main 不在此切片改动；调用方后续消费检查按后续授权切片完成。C2d1 的成功/失败外层 fence 与真实平台 wrapper continuation microtask 测试均保留。

## RED/GREEN 与验证

- `catalog-receipt-red.*`：现有目录 wrapper 清除应用成功，但返回 `undefined`，新增receipt契约断言失败；平台/runtime接线后在 `platform-green.*`、`runtime-green.*` 通过。初次 GREEN 暴露两个旧 runtime 测试仍断言返回 application；已按新 receipt 返回合同更新断言，再次最终通过。
- 平台 API 定向测试：35/35 通过，`platform-final.*`。
- runtime 导航测试：28/28 通过，`runtime-final.*`。
- 根 typecheck、spark-lowcode-api package typecheck、三个 production 文件定向 ESLint、`verify:ai-codegen`（扫描975文件）、`verify:dirs` 均 exit 0；详见对应 `*-final.*`。
- 未运行根全量、build、browser；按 dispatch 留待后续组合切片由主控验收。

最终 5 文件 SHA-256 见 `sha256-final.json`。保留既有 C1–C2d1 工作树状态，未 commit、push、建分支、增依赖或触碰 App/main。
