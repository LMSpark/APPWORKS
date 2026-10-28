> 最新结论（2026-10-29 窄复核）：host/runtime 静态 PASS。原 executionScope P2 已修复；初审、主控有效 RED 和修复过程保留如下。最终 runtime SHA256：BCFA7F21C5F66CB84459476581DBA20929312F500EA76600C6715E9C9586BC7F。本结论不包含 UI、真实 SPA 或本审查独立测试执行。
# 场景历史 host/runtime 只读复审

2026-10-29。基线 3531bf09f0c3a870f75c9f1b805a65f41fc60a95；唯一工作树 C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks。遵循 requesting-code-review/code-reviewer.md，只审指定 host/runtime 源码和对应测试。仅写本 Temp 报告；未修改产品、测试、台账、生成物或 Git，未启动/运行服务与 UI，未运行测试，未派子代理。

已读取主控日志 D:/USERCA~1/Temp/appworks-history-root-host-runtime.log，显示 3 文件 72 passed，耗时 14.27s。该证据是主控执行结果，不是本审查独立运行，且不能覆盖下述新问题。正文行号取报告末尾 SHA 对应的源码；新增测试仍可能由写者继续增加。

## Strengths

### manifest 分派与运行环境

- vite.config.ts:150 将 appworks.scenarioResources 传给唯一 repositoryScenarioPlugin；Store:57-69 校验 resourceId=scenarioId 的正式映射、唯一场景/路径与安全场景段。请求只提交 resourceId，实际位置由 manifest 与固定历史目录推导，不接受客户端路径。
- src/lowcode/lowcode-runtime.ts:687-714 按 resolveBuiltinScenarioResource(scenarioId) 分派，四场景不因 executionApp 改变而回退远端。普通非 builtin 场景继续正式 /api/File/ 协议，未删除动态目标。
- builtin list/read 在 !DEV 明确抛 HISTORY_UNAVAILABLE；create 也明确拒绝。Vite 插件 apply:serve，只注册 configureServer，没有 configurePreviewServer；build/preview 不挂文件端点。生产活动配置的既有只读行为没有被历史接线改变。
- 此处“来源不随执行应用改变”是程序资源身份要求，不代表旧执行代次可继续写入；下述问题正是两者需要分开。

### 实际存储、编号及并发

- tools/repository-scenario-store.ts:85-123 的列表/读取仅枚举已有 config/history/scenarios/<scenarioId>，没有目录时列表为空；GET 调用 safeHistoryDirectory(false)，不调用 mkdir。read 精确 N，版本校验为非负安全整数，包含 0；canonical 文件名是 N__pagedata.json。
- :126-168 createVersion 校验文本场景身份，读活动文件比较 expectedText，并强制 text===expectedText；按客户端已捕获的固定 N 写入，使用 open(target,'wx',0600)，不覆盖、不自动换号、不自动重试。
- :312-322 同一 resource queue 被活动读写、历史 list/read/create 共用。并发同 N 至多一个成功；活动保存先发生时，旧基线创建被冲突拒绝。边界明确为同一 Store 实例内串行，不宣称外部进程 OS 级 CAS。
- 写入后 sync/close，读取精确文件并核文本。写入后的普通错误返回 unknown，不删除已可能写入的文件、不伪造回滚。preimage 读取失败/不匹配、文本不符、真正 open 的 EEXIST 才有明确未应用结论。

### 路径、HTTP 与回执

- Store:253-291 逐层 lstat/realpath 历史父目录，拒绝符号链接/junction 与非目录；历史文件要求普通文件，拒绝链接/目录；root containment 与 scenario ID 白名单限制路径。存储根相对 manifest 有限资源，无外部输入绝对路径。
- tools/vite-plugin-repository-scenarios.ts:52-60 核真实监听地址、peer、Host；:62-83 GET 参数数量/重复值和 canonical N；:85-103 POST 必须同源 Origin；:117-147 JSON Content-Type、1MiB body、分块总长度、UTF-8 和 JSON object 检查。:163-179 拒绝 cross-site 与 Origin 不匹配，沿用实际 TLS 协议而非任意转发头。
- host-client.ts:93-102 在 fetch POST 之前同步调用 onAttempt；回调失败阻止请求。客户端不分配新 N，无重试路径，超时 AbortController，网络/非 JSON/错目标/错 N/错文件名/错文本/错 SHA 都失败，交上层保持 unknown。
- :104-114 仅接受匹配 resourceId+N 的显式 not-applied 失败 DTO；没有 N 或错 N 不足以清 attempt。读取 SHA256 与精确文本校验包含 UTF-8 BOM 原文。GET失败没有被客户端转换成 typed 写入拒绝。
- 文件读取后 assertScenarioText 出错虽然底层错误 DTO 写着 not-applied，但 createVersion 的写后 catch 会重新包装为 unknown；它不会直接穿透为本次写的未应用证明。

## Issues

### Critical（Must Fix）

无已确认项。

### Important（Should Fix）

**P2：历史创建可以由旧 Workspace/gateway 借同应用的新 execution scope 写入，与既有活动保存边界不一致。主控已采纳，写者正在先补 RED；本报告 SHA 尚未包含修复。**

- 主定位：src/lowcode/lowcode-runtime.ts:708-723，尤其 :712-718。createLowcodeProjectGateways 在 :619 捕获 executionScope，但历史创建只取调用当时 scope 并核 AppId，没有比较原 executionScope.token。
- 对照：同一 gateway 的 writeText:668-670 明确要求 currentScope.token===executionScope.token 及 AppId 一致。历史应遵循相同执行 owner 生命周期。
- 正式触发，无需省略 assertCurrent/onAttempt：
  1. 在 APP-A、scope-A 建立 Workspace 与 gateway。
  2. 同 APP-A 的 session/application revision 变化，使 readRequestScope 返回 scope-B。scope 包含 session.revision/application.revision（packages/spark-lowcode-api/src/lowcode-api.ts:114-125），所以相同 AppId 不能代表同一执行代次。
  3. 旧 workspace.loadScenarioViews 触发 currentScenarioScope（project-workspace.ts:576-586）清旧 owner，记录 B；gateway.readText:643-652 捕获当前 B，合法重载文件。
  4. workspace.createScenarioVersion 通过正式方法捕获 context.scope=B，并传 assertCurrent/onAttempt；gateway.createVersion 同样采用 B，所有 hooks 比较 B，最终 POST 新快照。
  5. 同 Workspace 若调用活动文件保存，writeText 却因原 executionScope=A 拒绝。历史写因而越过了活动保存既定的 gateway 生命周期边界。
- 实际复用可能性：src/services/project/project-shell.ts:57-83、88-99 按 tenant:project 缓存 Workspace，而不是按请求 revision。显式 resetAppProjectWorkspace:102-105 能 dispose，但不能据此假设每个同应用代次变化都已丢弃所有调用者持有的引用。即使 UI 有部分守卫，宿主正式写合同本身仍必须一致。
- 用户影响：旧会话/工作区对象在执行身份已改变后仍能向仓内追加历史文件，与“旧身份不可继续提交”的预期冲突；不是跨租户任意路径写入，也没有证据表明能改 manifest 外文件，故定 P2，不夸大成任意文件漏洞。
- 修复方向：history create 在进入异步准备、临近 dispatch 与回执返回时使用原 executionScope 的写身份校验，并与调用方 hooks 组合；继续按 scenarioId 确定仓内来源。失败不得 POST，不将新 scope 抄入旧 attempt。不要顺带改为四场景仅能由 builtin executionApp 使用。
- 有效 RED：完整 Workspace 路径，A→同 App 新 scope B→重载→创建，断言拒绝且 host POST 为 0；另保留新建 B Workspace 正常创建，四场景从普通 executionApp 仍能走仓内来源。

### Minor

无需要另列的问题。

## list/read 的作用域判断

builtin listVersions/readVersion 当前在 lowcode-runtime.ts:687-702 直接访问 host，没有像 readText 那样捕获并复核当前调用的 scope/AppId。这一点应按现有读取语义补前后守卫，但不能简单将所有只读行为强绑 gateway 创建时的 scope。

本次未把它独立升级为已证实的正式 UI 晚结果污染：Workspace.listScenarioVersions 在返回前 assertScenarioScope；previewScenarioVersion 核原 context；ScenarioDefinitionResource 与 DataViewSource 还检查原绑定/目标。因此正常 DataView→Workspace 路径会拒绝 scope 切换期间的晚结果，旧内容不会就此落入新视图。直接 gateway 调用缺守卫说明该层边界不完整，但不是本报告 P2 触发的必要前提；P2 已由带完整 hooks 的正式写路径成立。

建议补 list/read 当前 scope 的前后检查时保留这一区分：读取可在当前有效执行身份下重读固定程序来源，写入必须与原持有者执行代次一致。

## 测试与证据评估

已读新增测试：
- repository-scenario-store.test.ts:157-220 覆盖无目录 GET、N=0、固定 N 冲突不覆盖、并发、与活动保存共享队列、历史目录 junction、快照文本必须为当前活动文本。
- repository-scenario-middleware.test.ts:46-75 覆盖实际 HTTP list/create/read/冲突与活动文件不变；已有测试覆盖 Origin/body/UTF-8/Host/监听边界。
- lowcode-data-space-runtime.test.ts:378-392 等覆盖动态远端协议；:443-511 覆盖 builtin 与普通 executionApp 下的仓内历史分派，以及 padded scenario ID 保持仓内来源。
- 主控 72 pass 日志已经读取，未重跑。

测试缺口建议（不作为未经触发的产品缺陷）：新 host-client history 函数目前没有与原 active write 同等的故障矩阵；应覆盖 success响应丢失、错 resource/N/hash、HTTP错误但缺 N、只读读取失败不清 attempt、onAttempt 抛错无 POST。store 写后 readback 故障应明确落 unknown 并保留固定 N 文件。生产/preview 端点不存在和真实历史 create 的 HMR/Document=0 仍需相应真实验收，不能仅凭上述 72 项代替。

## Declined to judge（逐项未判及原因）

- 生产服务是否接受普通动态远端上传、其 collision 实际行为：本次没有访问服务，保留原正式 uploadTextVersion 协议；源码不等于当前服务支持证明。
- 真实浏览器创建历史后是否 Document=0：未运行 UI/Vite；目录位于活动 config/pages glob 外和现有精确 hotUpdate 是源码事实，不能等同 SPA 验收。
- 旧远端四场景历史库存及迁档：未读远端档案；仓内空目录不能据此宣称原历史为空或删除原档。
- 本地其他恶意进程在 lstat/realpath 与 open/read 之间实时替换目录的 TOCTOU：代码未宣称 OS 级原子路径锁/跨进程 CAS，本次核的是冻结合同要求的已存在父目录/文件链接拒绝；未构造外部攻击进程或扩大成主机恶意进程防护专题。
- 文件系统断电后目录 fsync 的持久保证：代码做文件 sync，没有本次合同或平台证据要求跨断电事务语义；不能把普通确认误宣传为跨文件/断电事务。
- UI 关闭/重开、pending/unknown 离开守卫、恢复为定义草稿与显式 DataSet 保存：仍由 UI 组实施和验收，本报告不背书其完成。
- 通用 DataViewSource/Workspace core 的最终后续改动：已另有 core 报告；本次只为正式触发读取其调用链，不替代任何后续源码 SHA 的重新复审。
- 主控已派写者修复的最终测试/代码：报告只覆盖末尾 SHA，不提前将进行中的 RED/修复写成完成。

## 初审 Assessment（已由末尾窄复核更新）

**Ready to merge: With fixes。** 宿主存储与 HTTP 边界未发现其余可具体触发的新增缺陷；runtime history create 的 executionScope 一致性 P2 仍需修复并独立验证。主控已采纳该问题；修复后应复核对应源码 SHA 与正式 Workspace RED，再给本组 PASS。整体历史切片仍需 UI 与真实 SPA 验收。

## 审查源码身份（SHA256）
tools/repository-scenario-store.ts  379496A1E7BA4ABE898682E05E0B2A69467879A87613772651EA5FA413405D76
tools/vite-plugin-repository-scenarios.ts  582C797A12C52C0B1E25A5564D1B46121AECD2A0E347A67CCA7340072FF360EE
src/lowcode/resources/shared/repository-scenarios/repository-scenario-protocol.ts  86613A01B46754CC6C4557777132A77CA703AC439C53DAF434412726EE64CFCC
src/lowcode/resources/shared/repository-scenarios/repository-scenario-host-client.ts  55B1A5CC0718A08A22F3055FBAB1F036F2744B3BC2929871972C2A2931003DD7
src/lowcode/lowcode-runtime.ts  F0DB80BC9CA8C57DCEC98A95C088D43DE356BB1EAA8A0812C0B274040B18200F

## 交付前补充：P2 已有主控独立 RED

主控于本报告交付前确认：写者新增正式 Workspace/runtime 用例 `does not create a history snapshot through an old gateway after the same app opens a new request scope`，主控独立运行得到 1 fail / 53 skip；实际 promise resolved undefined，预期应 reject。该反例与上文 A→同 App 新 scope B→旧 Workspace 重载→创建的正式调用链一致，证明 P2 不是仅由直接调用可选 hook 缺失推导的风险。主控已开放 runtime 修复；本报告尚未复审修复版本，结论仍为 With fixes。

## 窄复核：executionScope 修复已确认

本次仅重新读取 runtime 当前实现与三条新增执行用例，不扩大为其他切片审查。

- src/lowcode/lowcode-runtime.ts:619-625：assertExecutionScope 同时比较 gateway 创建时 token 与当前 AppId，旧 Workspace 在同应用新代次重载后不能借新的 scope 创建历史。
- :734-756 builtin create 在进入、活动原文读取后、临近创建调用以及回执后校验原 executionScope，同时保留调用方 assertCurrent/onAttempt；来源仍按四场景身份分派，未强制 executionApp 必须为 builtin 应用。
- :758-790 普通动态历史创建也在异步准备、上传前后与回读后核原执行代次，没有删除原文件服务协议。写入已派发后 scope 失效仍抛普通错误，Workspace 保留 unknown，不误称撤销/未应用。
- :626-636、704-732：list/read 捕获的是“本次读取开始时”的 scope，核当前 AppId，并在 await 返回后再核。它们没有错误地绑定旧 gateway 创建 token；因此当前有效的新读取可继续，晚结果被拒绝。
- 三条新增用例已读：lowcode-data-space-runtime.test.ts:407-419 的 list/read 中途切 App 两条，以及 :546-559 的旧 Workspace 同 App 换代次后创建拒绝。后者确实走旧 workspace.loadScenarioViews→createScenarioVersion，并断言 host POST 为 0，覆盖原已由主控复现的有效 RED。
- list/read 两条使用动态远端 transport，所以也会受既有 LowcodeDesignApi 自身 scope 守卫保护；它们证明正式动态路径晚结果拒绝，但单独不能证明 builtin host 分支的新守卫被执行。builtin 分支已逐行核对，其正确性当前有静态证据；后续可补 builtin deferred fetch 行为用例，不将此覆盖差距误报为已发现产品缺陷。

写者称五项定向通过；本审查没有运行测试，主控独立全 host 组仍待完成。没有把写者自测替代独立验证。

### 更新后的 Assessment

**host/runtime 静态复审 PASS，Ready to merge：本组源码层面 Yes。** 原 P2 已修复，窄复核未发现新增具体缺陷。整体历史切片仍须主控独立完整检查、UI 与真实 SPA 验收；初审 Declined to judge 其余边界继续有效。

最终窄复核身份：
- src/lowcode/lowcode-runtime.ts SHA256 BCFA7F21C5F66CB84459476581DBA20929312F500EA76600C6715E9C9586BC7F
- tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts SHA256 02DFE435B07CDE1367016E3D9D139A4005ADC55903AD37388EF7A4208F89C13B
- 其他 host 源码本轮未再修改/复审，以前一节已记录 SHA 和初审结论为准。
