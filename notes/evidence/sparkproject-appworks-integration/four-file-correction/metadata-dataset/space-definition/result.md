# 正式空间 Name 装配：验收通过

状态：本闭环验收通过，完整DataSet计划继续实施。下述暂停/回退为已解决的历史过程。

线上只读探针 `online-header-result.json` 显示，元空间 `Base_DataSet` 正式查询即使显式请求 `rowid`、`Name`，仍未返回 `Name`（模型 `Name.IsOutput=false`）。本轮方案前提不成立，未将夹具结果当作可交付的真实链路。

仅下列五个本轮改动文件恢复为 `before/` 中的原始字节。回退前逐一校验当前 SHA-256 与暂停时状态一致，并检查差异仅为本轮改动；回退后逐一校验 SHA-256 与前像一致。其余七个方案范围文件未修改。

| 文件 | 回退前 SHA-256 | 回退后及前像 SHA-256 |
| --- | --- | --- |
| `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts` | `33e386524ba5f96061a44afa02b37c889510bc92db90a0fd45a2fb951f89cc04` | `ace4cddf16de544fffc11f484d4776dd111d2015ebb01897fd223427f4bdb287` |
| `src/lowcode/data-space/lowcode-data-space-assembler.ts` | `40ca52e36e7cb2cc47e664663ea38ac5a0951ff98f9ff9cc6b2f359f089f0e98` | `7f44f8597b39f7d09edb8fbbf84eacd794d3c740118ff0df8a030491e88e24e4` |
| `src/lowcode/data-space/lowcode-data-space-runtime.ts` | `8e9ff53d91bbff8e48a1a995e4200ecae7ac9723fccbe5aa53c6fc71a1165162` | `585cde2e50441b4868753fdca64fbd28f36fb940ad82c4009acf138170aebb2b` |
| `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.test.ts` | `c11204c7c1f601d38961ee8cc942f2eab9c3dedbf9b856f0fb6724345f3267c2` | `68701fe3052fb7b1f5c40f9b2115664d5c3abba8b49da1e7226118ca7418f957` |
| `tests/runtime/auth-nav/data-space/lowcode-scenario-assembly.test.ts` | `fc11029a462d6eb2f4cf35685dc36a0f1e31476c26d26f1c9d5b556d5866004c` | `e862bf50474be9e74153f313f1c23c6fa3d80240740b0c086243ad1b170eac1f` |

`red.log`、`first-green.log`、`api-minimal.log` 保留为本地夹具红绿证据，仅证明当时夹具中的预期与实现；不能证明正式线上 Name 可读或本方案可交付。本轮暂停后未继续测试扩散，未进行线上写入，也未执行 git checkout、stash、commit、push 或建分支。等待正式查询来源查明及方案修订。

## 修正正式定义后恢复实施

主控执行的 `space-name-output-apply-result.json` 已记录唯一正式元模型定义写入（`IsOutput: 0→1`、`writes: 1`、`savedCount: 1`）以及独立读回、正式模型 `Name.output=true` 和同一元空间对两个空间名称的可读查询。本段源码实施没有再执行线上写入。

开工时 12 个精确源文件及 `before/` 前像逐一与 `before-hashes.json` 一致。恢复后 12 个文件的最终 SHA-256 见 `after-hashes.json`；其中测试夹具只补正式空间输入、必要的 loader/权限及工作区重开断言。原失败、回退和数据库修正证据全部保留。

本轮最小用例先红（正式名称断言实际得到 `SCENE`，退出码 1），修改 assembler 后立即绿（1 passed，退出码 0）；这两次为本轮真实工具输出，未另造日志。随后包内 API 完整测试 74 passed（退出码 0），根目录五套聚焦 38 passed（退出码 0）；lint 首次发现 assembler 不必要的 optional chain（退出码 1），修正后单文件 5 passed（退出码 0），精确 12 文件 ESLint 退出码 0，真实输出保存于 `writer-12-file-lint.log`。先前一次 PowerShell 数组参数拼接导致 ESLint 未找到文件（退出码 2），未作为源代码失败，已用显式路径复跑。

实际消费证据：`lowcode-data-space-persistence.test.ts` 在文件保存及新工作区重开后确认正式名称作为 `DataSet.dataSetName`，随后只改变正式名称夹具再次装配即得到新名称，而 pagedata 文件文本完全不变且不含该名称。`lowcode-data-space-metadata.test.ts` 确认内部元空间名称与目标 `formid` 保持分离。包内 API 测试确认仅请求 `rowid`、`Name` 且保留名称原值，错误、权限和 scope 分支拒绝交付。

待主控执行：根类型检查、AI 生成代码规则检查、三套大范围回归及真实 session 零写验证。源码现冻结，未执行 commit、push、建分支、Java 或 UI 修改。

## 根回归发现的夹具类型修正

主控首次大套结果保留于 `root-related.log`：194 passed、9 failed。八项关系流程失败的直接前提是设计页测试夹具把 `Base_DataModel_Relation.cascadeDel` 声明为 `boolean`，而 `contract.json` 的正式字段 `52D937A294224691AB955A6FC9267565` 类型为 `int`，原脚本保存的是 `0/1`。本轮仅将 `tests/runtime/page/design/data-space-design-four-file.test.ts` 此字段夹具类型改为 `int`，没有修改生产校验或业务脚本。改前该文件 SHA-256 为 `e247acd7fb94a004193c0c8158c4df856513d882e749ae0ba435cc7ad219574f`，改后为 `9a7621d7cfdf000cd193c4ebaa2add6a54897728f5afa5d47b5e652590300854`；`after-hashes.json` 已同步。

指定 `saves Join in the same DataSet request` 单用例 1 passed（退出码 0，`design-single-green.log`）；无并发负载下该整文件 102 passed（退出码 0，`design-full-102.log`），包含先前超过默认 5 秒的命名视图用例。仅该文件 ESLint 退出码 0，`design-file-lint.log` 留存主控末次执行命令与exitCode=0；writer空输出未形成文件，主控已补跑该文件并实际留证。原失败日志未覆盖。

## 方案修订依据
独立只读预检 online-source-preflight-result.json 核实：目录场景能读出元空间名“数据空间设计”和测试目标名“四文件编辑验收-20261007”（以JSON内精确值为准），而元空间Name字段定义IsOutput=0且该属性原查询可见可写。后续按 space-name-output-brief.md 修正单条正式字段输出配置后再恢复前端装配；预检本身writes=0。输入声明已有 script.js 的 designParameters DataView→saveChanges→独立回读完整路径，不新增DataSet声明属性，也不要求无关inputParams权限。

唯一数据库定义修正已验：space-name-output-apply-result.json记录writes=1，既有DataView+DataSet.saveChanges回执savedCount1/failed0，独立新元数据DataSet读回IsOutput=1、readModel确认Name.output=true；同一元空间正式query读元空间/目标名称均成功。两个DataSet已销毁，无Java/UI/权限变更。此项修复原可行性前提，后续恢复12文件前端Name装配。


## 主控最终验收
- API74、根聚焦38；root大套2套101通过，设计页独立102通过，合计315项已验证用例。初次9个失败已由真实字段类型夹具修正和隔离负载复验解决，未降低生产校验/跳过断言。各轮单用例和重跑不重复计总数。
- root-final-typecheck.log退出0；root-ai-codegen.log通过1016源；12文件lint及最终单行测试修正的design-file-lint.log退出0。末次改动只是既有测试字符串类型值boolean→int，生产代码无变化。
- space-definition-review.md及追加单行复核通过。root验证12/12前像、12/12最终SHA并保存root-final-hashes.json、space-definition-final.patch（420行），没有将HEAD其他dirty混入。
- online-session-result.json新实际入口writes0：1空间、7模型、119字段、0关系、7表7视图，元/目标两名称来自正式记录，参数载体保留，销毁完成。
- 本轮全部线上写入只有space-name-output-apply-result.json所记元字段IsOutput0→1一次；此前五文件回退已恢复实施，不存在待回退源改动。无Java/UI/权限变更、无分支/提交。整体DataSet/AppWorks目标仍未完成。
