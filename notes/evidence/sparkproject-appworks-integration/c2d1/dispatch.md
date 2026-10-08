状态：implementing

# C2d1 应用选择提交隔离

## 目标与授权

用户授权低阶模型实施、主控裁决和验收。C2c已验收，当前只有本任务一个写代理。主计划 implementing；本切片只封闭应用选择 owner 的 list→root→save，不宣称已封闭 App/main/caller 导航副作用。后者另列 C2d2。

## 已核对事实

- runtime.activateLowcodeApplication 在平台之外 await list，再调用 selectApplication；只在 select 内开始generation会把旧list迟到当成新意图。
- LowcodeApplicationStore.revision 在换app/enterprise或clear递增；同app换root不递增。因此receipt还必须核对已提交root/id事实，不靠revision代替全部身份。
- session.revision 对正常token refresh稳定，身份对象替换或clear递增。登录/登出开始和完成之间有网络await，必须在开始同步使既有selection失效，不等finally。
- 主控选择平台owner贯穿整段选择并签发可同步检查的receipt；UI消费者将于C2d2接线。不得自行另造全局选择状态。

## 精确生产/测试范围（仅4文件）

1. packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts
2. packages/spark-lowcode-api/src/platform/lowcode-platform-api.test.ts
3. src/lowcode/lowcode-runtime.ts（只修改activateLowcodeApplication）
4. tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts（保留原导航用例，新增wrapper选择相关用例）

其余文件只读，不改App/main/store/依赖/index/配置；确需新增文件先回报主控。证据文件写本目录。

## 设计裁决

1. 在 LowcodePlatformApi 新增 activateApplication(applicationId) 作为完整编排门面，在首个await之前启动单调selection意图，校验trim后的ID；await目录，唯一匹配目标，再await导航根，然后同步save。无匹配显式失败；多同ID异常不能暗取首个。
2. 内部具名type收束选择上下文/结果，不为实现细节加公共export。返回结果具备 application、navigationRootId、assertCurrent():void，readonly；assertCurrent捕获owner意图、session/app revisions，并核对提交后application/root一致。这是当前runtime实际消费的返回合同，后续供shell调用，不暴露可伪造generation。
3. 复用同一fence流程保护现有 selectApplication(application):Promise<string>，保留该公共合同，不留未保护save路径。两入口互相失效，不能双增generation让自身失效。helper若await返回，外层恢复后仍须检查receipt，不把内层检查当成原子操作。
4. 每个await成功/失败出口都校验意图与身份；当前原错误原样透传，过时请求显式应用选择失效错误，不吞成成功、空目录或默认app。save后更新自身期望app revision；其他clear/save使receipt失效，同app换root也能检测。
5. login/logout函数开始同步递增selection意图以失效已有选择；不改其远端协议、清空时序、刷新逻辑或并发登录策略。新选择需要当前有效session；避免增加与本闭环无关的认证框架。
6. runtime.activateLowcodeApplication 委托activateApplication，await恢复后同步receipt.assertCurrent再返回application，保留原Promise<LowcodeApplication>合同与中文无效ID/无权提示语义。目录clear继续用现有store，无新增入口。
7. 本切片不解决下游caller在runtime promise resolve之后的微任务窗口；必须记录待C2d2，不以本项通过声称端到端切换已验收。

## 必要行为验证

先最小RED，首次production修改后立即跑对应GREEN；每次仅一个问题。

- A list晚回而B已发起，A不得进入root/save；A root晚成功或晚失败不得覆盖B。
- list/root等待期间catalog clear、session clear/replacement失效；login/logout开始且网络尚未结束时已有selection不得提交。
- 两公共选择入口互相失效，正常select仍返回root。
- 当前目录/root错误保持原错误对象，已选择app不被误清；正常token refresh不取消选择。
- 正常选择正确app/root；无权/空/重复ID显式失败。
- receipt在新意图、clear、身份替换、同app外部换root后失败；正常receipt成功。
- 真实deferred.resolve + queueMicrotask覆盖helper外层或runtime wrapper await恢复窗口，不只测序号getter次数。

## 验证命令与记录

开工读取git status与4文件当前完整内容、直接依赖。C2c最终root typecheck已通过，仍记录本切片修改前基线。使用原始stdout+exitCode JSON，不能仅写摘要冒充日志。

- 包局部：pnpm --dir packages/spark-lowcode-api exec vitest run src/platform/lowcode-platform-api.test.ts --maxWorkers=1 --reporter=dot
- runtime局部：pnpm exec vitest run tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts --maxWorkers=1 --reporter=dot
- pnpm run typecheck；pnpm --dir packages/spark-lowcode-api run typecheck
- 对两个production文件定向eslint --max-warnings=0；生成/目录门禁
- 不自行跑根全量或build/browser；主控验收时按风险选一次。

## 约束

完整阅读后再改，保留先前C1–C2c；不commit/push/建分支/安装依赖/业务写入。一次一个最小闭环，失败先收敛。不用非as const断言，不导出无消费者helper，不吞错误。完成后report.md、sha256-final.json并冻结，主控接手。发现真正需要超范围则先回报。

