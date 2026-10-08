# C2d2e 执行报告

状态：冻结待主控验收

## 完成内容

- `src/App.vue`：`switchAndReload` 先等待应用选择成功并通过组合 receipt 的 `assertCurrent()`，再 reset system-page instances，随后保持原有 dispose、设置和导航刷新顺序。激活失败时沿用原错误出口，旧路由与系统页实例保持可用。
- `tests/app/services/project/application-switch.test.ts`：新增真实 App + DynamicRouter deferred 激活拒绝测试。pending 阶段和拒绝后均核对同一真实实例，且检查 URL、lowcode applicationId、reset/dispose/reload 和原错误。

## 验证

- RED：`pnpm exec vitest run tests/app/services/project/application-switch.test.ts -t 'keeps the current real system-page instance while activation is pending and rejected'`，退出码 1；真实当前实例在 pending 时变为 `undefined`，确认旧实现提前 reset。
- GREEN：同一命令，退出码 0。
- 定向回归：application-switch、system-page-identity-tabs、navigation-sync、project-navigation-guard、lowcode-runtime-navigation，5 个测试文件、81 项通过。
- `pnpm run typecheck`：通过。
- `pnpm exec eslint src/App.vue tests/app/services/project/application-switch.test.ts`：通过。
- `pnpm run verify:ai-codegen`：通过，扫描 978 个文件。
- `pnpm run verify:dirs`：通过。

对应原始 stdout 与 command/cwd/start/end/exitCode JSON 均在本目录。未运行 root 全量、package 全量、完整 build 或 browser；由主控统一验收。

## 冻结文件 SHA256

| 文件 | SHA256 |
|---|---|
| `src/App.vue` | `3A95148F56DA351927F0D0CF5B89E83D356BE5BCF48E86CB179593197573ACB6` |
| `tests/app/services/project/application-switch.test.ts` | `253F2A3DE33D246DC6BE12574525684661140EC3E0BD31EAF27108A38DC6E1E9` |

未 commit、push 或建分支。既有工作树改动保留。
