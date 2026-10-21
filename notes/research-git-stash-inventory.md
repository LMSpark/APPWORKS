# Git stash inventory（2026-10-21）

清理策略：drop 全部 lint-staged automatic backup；具名 stash 保留。

## 条目

- **stash@{0}** On (no branch): protected-local-files-before-push
  - stat tail:  2 files changed, 120 insertions(+), 2 deletions(-)
- **stash@{1}** On feat/agent-workflow-node-contract: rollback-warning-fix-attempt
  - stat tail:  29 files changed, 469 insertions(+), 269 deletions(-)
- **stash@{2}** On codex/vcm-metadata-script-sandbox: temp-before-commit-second-batch-v2
  - stat tail:  73 files changed, 1690 insertions(+), 2002 deletions(-)
- **stash@{3}** On codex/vcm-metadata-script-sandbox: temp-before-commit-second-batch
  - stat tail:  423 files changed, 17241 insertions(+), 17713 deletions(-)
- **stash@{4}** On main: codex-temp-column-rules-after-hook
  - stat tail:  3 files changed, 34 insertions(+), 38 deletions(-)
- **stash@{5}** On main: codex-temp-renderer-keys-after-hook
  - stat tail:  2 files changed, 22 insertions(+), 22 deletions(-)
- **stash@{6}** On main: codex-temp-catalog-after-hook
  - stat tail:  1 file changed, 1 insertion(+), 1 deletion(-)
- **stash@{7}** On main: codex-temp-unstaged-before-commit-check
  - stat tail:  29 files changed, 3054 insertions(+), 3010 deletions(-)
- **stash@{8}** lint-staged automatic backup
  - stat tail:  20 files changed, 79 insertions(+), 474 deletions(-)
- **stash@{9}** lint-staged automatic backup
  - stat tail:  15 files changed, 1399 insertions(+), 145 deletions(-)
- **stash@{10}** lint-staged automatic backup
  - stat tail:  13 files changed, 6608 insertions(+), 2316 deletions(-)
- **stash@{11}** lint-staged automatic backup
  - stat tail:  2 files changed, 69 insertions(+), 11 deletions(-)
- **stash@{12}** On master: autostash before switch-to-main-core-layer leftover
  - stat tail:  2 files changed, 3 insertions(+), 2 deletions(-)
- **stash@{13}** On master: autostash before restore-to-core-layer ede10106
  - stat tail:  26 files changed, 197 insertions(+), 868 deletions(-)
- **stash@{14}** lint-staged automatic backup
  - stat tail:  89 files changed, 2466 insertions(+), 2251 deletions(-)
- **stash@{15}** WIP on main: 34d29b91 docs(spark-data): clarify JSDoc on types.ts; fix tree-demo r-tree structured props
  - stat tail:  38 files changed, 690 insertions(+), 927 deletions(-)
- **stash@{16}** On refactor/action-capability-cleanup-2026-04-30: wip: catalog snapshot before main merge
  - stat tail:  1 file changed, 3557 insertions(+), 4029 deletions(-)
- **stash@{17}** WIP on fix/baseline-vitest-failures: bc2aa7f5 chore(spark-ai): sync component catalog snapshot
  - stat tail:  1 file changed, 18447 insertions(+), 563 deletions(-)
- **stash@{18}** On refactor/public-api-internal-jsdoc: wip: catalog snapshot
  - stat tail:  1 file changed, 20493 insertions(+), 2137 deletions(-)
- **stash@{19}** On review/b9f73ad1: temp-switch-back-latest-20260430
  - stat tail:  1 file changed, 4007 insertions(+), 1951 deletions(-)
- **stash@{20}** lint-staged automatic backup
  - stat tail:  119 files changed, 5130 insertions(+), 6760 deletions(-)
- **stash@{21}** lint-staged automatic backup
  - stat tail:  41 files changed, 1452 insertions(+), 397 deletions(-)
- **stash@{22}** WIP on feat/capability-hard-cutover-20260417: 5a918aed feat(spark-ai): unify live edit session and tool layout
  - stat tail:  1 file changed, 92 insertions(+), 48 deletions(-)
- **stash@{23}** WIP on feat/capability-hard-cutover-20260417: 5a918aed feat(spark-ai): unify live edit session and tool layout
  - stat tail:  1 file changed, 15 insertions(+), 12 deletions(-)
- **stash@{24}** On feat/capability-hard-cutover-20260417: temp-before-restore-8456f45b
  - stat tail:  1 file changed, 962 insertions(+), 975 deletions(-)
- **stash@{25}** lint-staged automatic backup
  - stat tail:  24 files changed, 4053 insertions(+), 1405 deletions(-)
- **stash@{26}** lint-staged automatic backup
  - stat tail:  23 files changed, 6586 insertions(+), 4052 deletions(-)
- **stash@{27}** WIP on feat/capability-hard-cutover-20260417: b825ed51 refactor(spark-component): internalize bodyWrapper/grid in RendererHostScope
  - stat tail:  1 file changed, 1 insertion(+), 1 deletion(-)
- **stash@{28}** lint-staged automatic backup
  - stat tail:  16 files changed, 1811 insertions(+), 1202 deletions(-)
- **stash@{29}** On main: temp-recover-after-second-lint-staged
  - stat tail:  1 file changed, 19643 insertions(+), 17853 deletions(-)
- **stash@{30}** lint-staged automatic backup
  - stat tail:  97 files changed, 58041 insertions(+), 34413 deletions(-)
- **stash@{31}** On main: temp-recover-after-lint-staged
  - stat tail:  1 file changed, 16676 insertions(+), 17933 deletions(-)
- **stash@{32}** lint-staged automatic backup
  - stat tail:  96 files changed, 35902 insertions(+), 18331 deletions(-)

## Drop 计划（lint-staged）

Indexes（删前）: 8, 9, 10, 11, 14, 20, 21, 25, 26, 28, 30, 32

## 执行结果（2026-10-21）

- **已 drop**：12 条 `lint-staged automatic backup`
- **剩余 stash**：21 条（具名 WIP / protected-local-files 等，未动）
- 30 天后可复核 stash@{2..} 大体积 temp 是否仍需要

## 执行结果（2026-10-21 post-cleanup 复核）

- **模式 drop**（自 `stash@{0}` 迭代）：`codex-temp-*`、`temp-before-commit-second-batch*`、`temp-recover-after-lint-staged`、`temp-switch-back-latest`、`temp-before-restore-8456f45b`、`wip: catalog snapshot`
- **当前 `git stash list`**：**空**（上述 21 条均已 drop，含原 `protected-local-files-before-push` / `rollback-warning-fix-attempt`；当前 `10-17` 以已推送 commit 为准，不再依赖 stash）
- **恢复**：若需旧 WIP，从对应分支 reflog / 远程分支查找；勿再从 lint-staged 备份恢复
