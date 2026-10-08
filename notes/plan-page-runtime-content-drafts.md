状态：superseded

已由 `notes/plan-appworks-four-file-integration.md` 当前布局生命周期闭环及 `notes/evidence/sparkproject-appworks-integration/four-file-correction/layout-lifetime-brief.md` 替代。下文保留旧研读背景，不再据此实施；现有 read/save/create 已落地，按新 brief 接入实际内容 owner。

# D2 布局文本保存与 PageRuntime 草稿闭环

## 任务目标

将已验证的 8D 数据空间布局文本草稿纳入其 `PageRuntime` 生命周期，并由固定布局 host 实际保存；旧 renderer 卸载不取消/遗失已发出的上传 flight，新 renderer 可读 pending/unknown 状态。输入参数另走正式 DataView，不在此重复实现。

## 影响范围

- `packages/spark-project-model/src/page/runtime-page.ts`：让 `PageRuntime` 成为原文 baseline/current、pending flight、unknown 状态的唯一内存 owner；`isDirty` 在文本不等、pending 或 unknown 时为 true，包含 current 恰好等于旧 baseline 的 unknown 情况。renderer/context 不持有第二个 flight owner。
- `packages/spark-project-model/src/page/content/`：只新增被 D2 消费的 raw text owner；key 由宿主绑定的数据空间身份构成，不包含 8D、SysForm、HTTP、permission 领域。使用实际成功/失败结果推进 baseline，不另做未消费的通用五方法 ticket API。
- `src/lowcode/data-space/lowcode-data-space-layout.ts`：扩展现有 `createReader()` 固定 scope owner 为固定路径提供 `read` 与 `write`；继续捕获 `X-AppId`、token 和 8D FormKey，路径严格为 `SysForm/<validated-id>.json`。写复用 `LowcodeDesignFileUpload.uploadWorkingText()` 的单文件 replace、Code/receipt 校验、原字节回读及 scope 检查。
- `packages/spark-component/src/runtime/app-services.ts`、`packages/spark-component/src/page/context/buildPageContext.ts`、`packages/spark-component/src/runtime/script-context-types.ts`、`packages/spark-component/src/page/context/types.ts`：增加最窄 D2 布局 snapshot/set/save/read/reconcile 脚本合同。save 交给仍存活的 PageRuntime owner 包装真实 host promise；旧 context 的 await 结果仍按 `assertCurrent` 丢弃，但 owner 内部 settle 不依赖 renderer signal。pending 时新 context 只能读 snapshot，不得重新读服务端覆盖；flight 完成后才允许受控 fresh read 处理 unknown。
- 后续 D2 消费者 `config/pages/data-platform/data-space-design/script.js` / `rule.json`：在参数编辑闭环合入后再接图布局 handler 和显式保存/放弃交互；不覆盖参数 writer 当前正在改的脚本。`onBeforeRender` 仍只读同步投影。参数编辑仍由 8D `Base_DataSet@designParameters` DataView `updateEditingValue`、`discardEditingRows`、`applyEditingRows` 与 `saveChanges` 负责。
- 直接验证：`packages/spark-project-model/tests/page-runtime.test.ts`、`packages/spark-lowcode-api/src/design/lowcode-design-file-upload.test.ts`、`tests/runtime/page/runtime/page-script-lifetime.test.ts`、`tests/runtime/page/runtime/page-runtime-tabs.test.ts`、`tests/runtime/page/design/data-space-design-four-file.test.ts`。更新 `$page` typed fixtures 时先反向 rg；仅改真实消费者，不据类型猜测修改 `src/App.vue`。

## 技术方案

1. 明确读、编辑与保存状态分离：读取返回当前 owner 快照（baseline/current/pending/unknown）；首次真实读取建立基线。纯读取不建草稿、不清状态；只有交互 `set` 改 current。保存命令由 owner 捕获当前 submitted 文本并登记唯一 flight，然后调用固定 host writer；renderer signal 不传给 HTTP，不可把 UI abort 当成网络取消。
2. 成功回执经 uploader 字节回读后由同一个 PageRuntime owner settle：baseline 前进到 submitted 文本，current 保持原值，因此在途新编辑仍 dirty。确定的后端拒绝结束 flight、保留 baseline/current 并允许用户修正后重试。写请求已发出但 transport/readback/scope 失效使结果无法确认时，结束 pending、置 unknown、始终 dirty；不自动重试。旧/重复 settle 与已 dispose runtime 无效。
3. 新 renderer 对同一 PageRuntime 读取 pending/unknown；pending 时禁止新的 layout query/save。flight 结束后 fresh query 才是恢复入口。unknown 不能仅因当前文本等于旧 baseline 清除；页面需展示状态，用户显式选择以刚读远端文本接纳/放弃本地内容后才能 reconcile。远端查询失败保持 unknown/dirty。该读取比较不提供 CAS，也不声称判断谁覆盖了谁。
4. 运行时 owner 操作需要区分 renderer 可调用的 guarded 方法与 host settlement：读/编辑/发起保存前检查 signal、generation、DataSet 身份和 runtime 存活；等待 host 后旧 renderer 不接收 UI 回调，但 runtime owner 仍处理本次 flight 的成功/失败/unknown。runtime `dispose()` 是最终清理点；renderer `release()` 只中止渲染。页面进程硬刷新不保证内存草稿保留。
5. 测试采用真实 owner 层级：PageRuntime 单元测试验证 flight 与 dirty；uploader 已有测试扩展/复用验证固定 multipart、Scope、receipt、字节回读；脚本生命周期验证 abort 后 owner 仍 settle 而旧 context 不可继续操作；真实 tab/KeepAlive 测试验证 remount 观察到同一 flight；D2 测试经真实脚本事件验证保存动作而不是直接调用伪实现。

## 兼容性

- 文件读写继续经既有 `LowcodeDesignApi`/`LowcodeDesignFileUpload`，不新增裸 HTTP、不把数据空间领域写入 `spark-project-model`、不新增角色或文件端权限声明。
- `LowcodeDesignFileUpload` 的真实工作文件写入是 `isReplace=true`，单文件回执后 `LowcodeDesignApi.readFileBytes()` 逐字节核对；它不提供 CAS。页面参数的 DataView CRUD、行/字段权限合同保持原样。
- owner 只活到 PageRuntime dispose；renderer 卸载/重挂载保持 owner。浏览器进程刷新导致内存丢失的恢复语义不在本闭环中。

## 验证计划

- 核实根配置为 `"test:run": "vitest run"`；项目包配置为 `packages/spark-project-model/package.json` 的 `"test:run": "vitest run"`。单闭环命令：`pnpm exec vitest run packages/spark-project-model/tests/page-runtime.test.ts packages/spark-lowcode-api/src/design/lowcode-design-file-upload.test.ts tests/runtime/page/runtime/page-script-lifetime.test.ts tests/runtime/page/runtime/page-runtime-tabs.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts`；实施时按父任务阶段另跑 typecheck。
- RED/GREEN：同一 runtime flight 跨 renderer abort 后仍 settle；remount 在 flight 中读到 pending 且不触发 fresh query；成功只推进 submitted baseline、不覆盖后续编辑；known rejection可重试；unknown 即使 current==baseline仍 dirty，flight结束后 fresh query后须显式 reconcile；disposed owner 忽略迟到 settle。
- 上传验证确认 8D FormKey、实际 app scope、`SysForm/<id>.json`、`isReplace=true`、不自动重试、Code 非 200/坏回执/byte mismatch/scope stale 的分类与状态处理。不得以 mock `assertCurrent` 通过代替 host/owner flight 集成。
- tab/脚本验证确保旧 renderer没有后续 UI副作用，且真实 PageRuntime owner没有提前 disposal；真实 D2 脚本 handler负责 set/save，纯 `onBeforeRender` 不触发 IO 或 dirty 变化。

## 风险项

- HTTP 取消不由 renderer AbortSignal 控制。flight必须归 PageRuntime owner；把 settle 放在 guarded context 的 `await` 之后会在卸载时丢回执，可能永久 pending。
- 上传后回读字节不符、网络中断或 scope 变更时，服务端结果可能未知；不能自动重发、也不能清 unknown。fresh read只能提供当前字节，不构成 CAS/因果证明，必须由用户显式协调。
- 当前 `readDataSpaceLayout` 只提供读取能力；需要一条写入能力的固定 host extension，并让实际 D2 handler消费，避免再造未消费的 ticket 框架。

## 主控当前裁决（05:24）

本稿继续draft。实际实施前需收口：①列精确content文件、图组件/props及其测试；②低层uploader测试必须使用lowcode-api包配置，根include不覆盖其src/design；③请求发出后的非200不一概当作无副作用失败，无明确服务合同则按unknown处理；④明确正式数据权限门禁、target身份和不存在布局的独立确认重建；⑤专用验收空间当前无布局/模型，不得为了验收写90A平台图，先跟随实际模型新增闭环建立可验证目标。已验PageTextFile仅script/style、ScenarioViewFile仅场景JSON，不直接冒充布局owner。新内容owner需实际flight、raw baseline/current、pending/unknown与原有dirty出口完整消费；禁止单dirty flag。
