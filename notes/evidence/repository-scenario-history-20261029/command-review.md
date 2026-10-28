# 场景历史命名 command / 类型收敛窄复核（2026-10-29）

结论：静态 PASS。本轮已读源码未发现命名 command 或类型/lint修正破坏既签 core/host 合同。此结论不表示 typecheck、lint、测试或真实 SPA 已通过；审查者未执行这些命令。工作树仍由单写者修改，以下 SHA 锚定末次读取版本。

唯一工作目录 C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks；每条 shell 显式指定该目录。仅写本 Temp 报告，没有修改 repo、Git、产品、测试、台账、生成物，没有访问凭据或运行服务/UI。相对路径和行号均基于该工作树。

## 范围与实际调用方

1. packages/spark-project-model/src/project/project-workspace.ts:84-87 定义 ScenarioViewVersionCreateCommand，含 scenarioId/version/text/onAttempt/assertCurrent；:548 是生产调用点，逐字段传递原捕获值。包入口 index.ts:38-44 已显式导出该类型。
2. src/lowcode/lowcode-runtime.ts:734 是 ScenarioViewGateway.createVersion 唯一生产实现，解构命名 command；仓内分支 :753 调 createRepositoryScenarioVersion 命名对象，动态分支 :772-775 保留原 hook→upload 顺序。
3. src/lowcode/resources/shared/repository-scenarios/repository-scenario-host-client.ts:92-104 定义并解构 CreateRepositoryScenarioVersionCommand，唯一生产调用方是上述 runtime:753。
4. tools/repository-scenario-store.ts:130-134 createVersion 命名对象由 tools/vite-plugin-repository-scenarios.ts:98 调用；测试 helper repository-scenario-store.test.ts:224-225也已转换。没有生产遗留位置参数调用。
5. 相关真实测试调用已静态核：packages/spark-project-model/tests/scenario/scenario-view-file.test.ts:1029及各createVersion mock；tests/runtime/auth-nav/data-space/view-design/scenario-definition-resource.test.ts:19和:316-317；tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts:382、391、428、474、511、521。DataView.sourceLifecycle().createVersion() 是另一层无参业务API，不应机械转换。

检索限于此次接口与实际引用（src/packages/tools/tests的确切symbol及createVersion定义/调用），没有将DevFileEditor里同名UI函数混入本改造。

## 保持的合同

### 原 attempt 捕获、callback 未调用与错误分类

- Workspace:502-510 先捕获 scenario/scope/file/text/revision上下文并建立pending，:505-506继续阻止pending/unknown新建。
- :520-534 先核活动原文和实际历史，分配固定安全整数N；:535-546在gateway回调时逐项验证scenarioId/scope/version/fileName/text/resourceId，并冻结attempt。onAttempt字段没有被换成仅“创建后summary”。
- 命名对象:548仍携带原text和原onAttempt；didCaptureAttempt闭包:513只读取真实布尔值，没有假定必然被调用。网关正常返回却未回调时:550仍抛ATTEMPT_MISSING，不会宣称confirmed。前置检查/调用方hook在写前抛错时未捕获attempt，会按原逻辑清临时pending。
- :549设置gatewayCreateReturned；:562只有尚未正常返回的网关错误且typed resourceId/scope/N精确匹配才not-applied。网关返回后summary校验、再读取或回读失败不因typed错误而清为not-applied，仍unknown。
- :553读取原N，:555核原文；成功只更新history状态，不保存/覆盖用户后续草稿。固定N不换号、不重发的前置unknown守卫未改变。
- “onAttempt类型为必填函数”不等于任意第三方实现一定调用。当前唯一生产gateway在可能上传前均调用；对一个违反网关合同、未hook却自行写入的替代实现，本轮不推断可以恢复其不可知attempt，也不据此扩大本次接口改造。

### runtime执行身份与动态来源

- runtime:735-747在仓内创建前核原executionScope及AppId；:748读取当前活动原文，:749-752再次核scope和文本；:753原值传client后，:754-755继续核原scope/调用方。
- client:105-107先校验N/scope并同步onAttempt，再在:108-112发单次fetch。回调若抛错，fetch尚未执行。超时只abort，不重试；重定向仍error。
- 动态来源分支:758-788仍先核现有N、活动原文，:772捕获后:773-774再次守卫、:775上传，随后精确目录/原文回读。没有因命名command改造回退仓内到远端。
- 构建态仓内历史仍在:743明确不可用，普通动态场景正式协议保留。

### store、JSON真实校验和HTTP边界

- store.createVersion:131解构后仍按resource白名单、#assertVersion和同resource队列执行；:138-144读取当前活动文件并同时比较current===expectedText以及text===expectedText。
- :145-155校验历史目录/文件；:158使用wx独占固定N，写入/sync/close后精确读回；:170-175冲突明确not-applied，其余写阶段错误unknown。没有新增覆盖、自动换N或重试。
- protocol.isNonnegativeSafeInteger:56-58 是 typeof number + Number.isSafeInteger + >=0的真实运行时检查，不是类型断言。middleware:94-98的JSON version通过它之后才入store；client:152、159的列表/成功DTO也用同检查；failure DTO:53若携带version也必须通过。0仍有效，字符串/布尔/null/小数/负数/不安全整数拒绝。
- client:114-117仅在失败DTO有匹配resourceId与固定version且outcome=not-applied时转typed；普通HTTP失败、DTO身份/版本/精确文本/SHA不匹配保持unknown。未将仅HTTP状态、未匹配version或回读失败降为未应用。
- middleware:52-59仍核实际loopback监听与peer、Host；:62-78 GET严格参数形状且不创建；:86 POST要求Origin；:120-148仍限制JSON Content-Type、1MiB、UTF-8和对象形状。requestChunkBytes:151-154将实际ArrayBuffer view按byteOffset/byteLength复制，不靠未知值断言放宽body类型。
- Host/Origin:157-204仍核当前监听端口、同源协议/host及cross-site拒绝；apply:serve/configureServer未改为preview/build入口。store链接/越界防护及共享资源队列未随command改造移除。
- active write仍原独立调用链；Store辅助failure/assertScenarioText改为对象参数后，resourceId、outcome、replacementStarted语义没有变换。

## 本轮发现并已由写者补齐的两处集成缺口

- 首次读取时包index缺ScenarioViewVersionCreateCommand导出，但资源测试已经从包入口import type；已通知写者。末次读取index.ts:43已补，不能以运行时擦除type掩盖公开入口缺项。
- scenario-definition-resource.test.ts:316首轮仍断言五个位置参数，而fixture已接对象；已通知写者。末次读取:316-317按同scenarioId/version/text/onAttempt/assertCurrent断言对象，保留原业务语义。此为接口迁移遗漏，不是产品错误，不应改产品迁就旧mock。

两项均只静态确认修改，不声明本审查者跑过RED/GREEN或typecheck04。

## 未判项与证据边界

- 本轮不重新审全部历史UI，也不重复已签的完整core/host业务审查；只检查此次接口/类型收敛及直接调用方。
- 未跑测试/lint/typecheck/工程规则，是否最终全部退出0由主控/写者实际日志证明。
- 未重新验证HTTP现场监听、浏览器unknown注入或真实文件落盘；已有现场验收不因静态PASS自动更新到此SHA。
- 新公开type导出与JSDoc派生产物是否完成正式生成属于工程收口验证，本轮未写或生成产物。

## 末次读取 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| packages/spark-project-model/src/project/project-workspace.ts | B7622F9B16C4731C78597DADAF40D1FBAFCAA99F7D10986CFF8E103F37A6DAFF |
| packages/spark-project-model/src/index.ts | CFF1118A488022DD5E9105819F434936FC1282CA4FE4377AD3168E2E46838EF9 |
| src/lowcode/lowcode-runtime.ts | E47836A6E3842C84E815523CB6F480BA8EB8F9367EB1CABF6E923ACC9D346EA1 |
| repository-scenario-host-client.ts | 546328DA74E1C3E339C8F104CD8BE70E3506D88A75D49E353803527016B4AA2F |
| repository-scenario-protocol.ts | A18B4EEF3AF9A065F99E437297F7C3C55A4575D5F2B50D3A63390D79A0D0E9E9 |
| tools/repository-scenario-store.ts | 9D83482EBC35B22386786792341EB8FDA6112848637D7852864F59D6946B550E |
| tools/vite-plugin-repository-scenarios.ts | B3C8E6E65ABD5AF7ED753392D039612DEE8B8E433D44308BCF8C54410BC6BFDB |
| tests/runtime/auth-nav/data-space/view-design/scenario-definition-resource.test.ts | B32C6000117357910511B752407DA6FC9E4478B5F54DBAB840DE511851164545 |
