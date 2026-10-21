# Git 暂存区 / 证据 / stash 梳理（2026-10-21 收敛）

## 清理前快照

| 项 | 值 |
| --- | --- |
| **HEAD** | `7d34e5359`（branch `10-17`，ahead 2：`17b2034aa`、`9081c7a83` 之上） |
| **暂存区** | **0** 文件 |
| **已跟踪未提交** | **51** 文件（约 +2550 / −611），主体 I5 database-management |
| **未跟踪（git）** | **~5478**；其中 `notes/evidence/data-space-config-storage` **5414** |
| **磁盘 evidence 树** | `data-space-config-storage` 约 **13196** 文件、**85** 个顶层 `e62-*-before` / `i7-*` 目录（整包源码快照 + log/json/png） |
| **stash** | **33** 条（含多条 `lint-staged automatic backup`） |

详见 [`research-evidence-deletion-manifest-20261021.json`](research-evidence-deletion-manifest-20261021.json)。

## 根因（与 2026-10-20 一致）

1. **误 add 风险**：`notes/evidence/data-space-config-storage/**` 曾为一次未完成的 commit 塞满 index（历史 ~5468）；当前 index 已空，但磁盘仍留整树未跟踪。
2. **实施面与证据混放**：I5 源码 + 小 JSON evidence 应与 e62 整包快照分开；快照仅本地验收用，不入库。
3. **stash 堆积**：lint-staged hook 自动 backup + 历史分支 WIP，与当前 `10-17` 实施面无关。

## 本轮动作（计划 `git_workspace_cleanup`）

1. 删除 `notes/evidence/data-space-config-storage/`（删前保留 `native-design-regression-i4-convergence.log` → `notes/evidence/database-management-i5/`）。
2. stash：inventory 后 **仅 drop** `lint-staged automatic backup`。
3. 验证 + `generate:class-model-surface` / contracts 后 **分组 commit**（功能 / 公共层 / 生成物 / 台账+小 evidence）。
4. **禁止** `git add notes/evidence/data-space-config-storage/**`。

## 清理后常态

- 提交前：`git diff --cached --stat` 行数应 **&lt;100**；若出现 `notes/evidence/data-space-config-storage` 立即停止并 `git restore --staged`。
- 大体积验收：写 `notes/evidence/<topic>/` 下 **少量 JSON/log**，或仓外归档；不复制 `src/`/`packages/` 快照进 evidence。
- 优先 `git add` 路径白名单：`src/`、`packages/`、`tests/`、`generated/`（生成后）、`notes/data-space-retirement-ledger.md`、小 evidence JSON。

## 清理后回填（2026-10-21 已完成）

- evidence 删除 **13196** 文件；stash drop **12**；功能提交 `0b1b39d23`、`e37527425`、`8ec5bc9b4` + 本条 notes commit。
- 详见 [`data-space-retirement-ledger.md`](data-space-retirement-ledger.md) § 2026-10-21 工作区收敛。
