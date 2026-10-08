# 字段输入级联局部闭环

状态：本轮精确闭环已通过主控与独立验收；完整 DataSet / AppWorks 计划仍在实施。

## 范围与行为

- 本轮只改精确范围内 13 个源码/测试文件；`src/lowcode/data-space/lowcode-data-space-assembler.ts` 经核原样透传即可，字节 SHA 与开工前相同。
- `viewCascades` 同域持久 query/field 联合；字段分支严格校验目标、多个父字段、选项视图、显式值策略及环。旧查询级联索引和 CRUD 只处理 query 分支。
- DataSet 持有字段级联运行 owner；按目标视图、编辑行、字段隔离状态和代次，读取当前编辑父值与当次字段权限，独立查询选项，仅自动父变化按策略改编辑缓冲；取消、重查、定义替换、销毁均使旧结果失效。状态订阅在 owner 重建后仍有效，返回副本。
- 字段/表重命名更新字段级联引用，删除被引用结构受保护；修复混合 query/field 重建时的旧 query 索引顺序。文件 owner 保存后在 fresh workspace 重开，原生 DataSet 通过正式查询管线消费级联定义。
- 验收修正：DataView 的两种显式取消路径均发布 `editingDiscarded`，在普通 `editingChanged` 前使指定行或全部行的待返回级联失效；无 patch 的合法取消也有效，空行集合不取消其他请求。监听回调异常被隔离并记录固定诊断与错误类别，日志不带回调消息或业务数据。四处根类型错误对应的可选字段/只读配置写法已修正。

## 验证实证

- 首条父字段编辑测试先红后绿：`red.log`、`first-green.log`。
- 验收前四套聚焦：`final-focused.log`，4 files / 111 tests passed，退出码 0。
- 取消独立探针原红：`reviewer-red.log`，迟到响应写出 `{city:null}`。修正后同一探针的旧 `ready` 期望与取消后 `idle` 合同相反，故 `reviewer-postfix.log` 停在该期望；独立探针未改。正式同构测试以 `idle` 且无 patch 验证。
- 修正后最终四套聚焦：`correction-final-focused.log`，4 files / 113 tests passed，退出码 0；其中新增同父值迟到响应、零 patch 取消和行隔离。
- 修正后精确 13 文件 ESLint：`correction-final-lint.log`，退出码 0。
- 根类型再报的两处只读索引错误，已仅将持久化测试的 `config` 顶层改成展开后的可写对象；该保存重开用例 `final-type-fix-minimal.log` 1/1 通过，该文件 ESLint `final-type-fix-lint.log` 退出码 0。最终 SHA 已更新至 `after-hashes.json`；根类型检查仍由主控复跑。
- 本轮路径 `git diff --check -- <范围内既有文件>` 退出码 0。全树 diff check 发现其他既有 dirty 路径空白，未触碰。
- 前像在 `before/`，SHA 见 `before-hashes.json`；最终 14 路径（含原样 assembler）SHA 见 `after-hashes.json`。3 个新文件无前像。

## 主控与独立验收

- 最终根类型：`root-accepted-typecheck.log` 退出0；两次此前失败保留在 `root-typecheck.log`、`root-final-typecheck.log`，没有覆盖失败记录。
- AI codegen：`root-final-ai-codegen.log` 通过，检查1015源文件；此后仅测试可写副本单行修正，没有生产修改。
- 主控初次相关回归：`root-regression.log` 10套206/206；取消修正后的事件/取消/保存回归：`root-final-event-regression.log` 4套105/105。不把两轮计数当不重叠测试总数。
- 独立报告 `.superpowers/sdd/plan-data-space-metadata-dataset/field-cascade-review.md` 通过。原取消探针保留红记录，复验改为等待受控查询完成后核idle和无patch，1/1通过；探针变更及日志在 `review-probes/`。
- 主控与独立审查均核14份最终哈希、11份前像；`root-final-hashes.json` 与 `field-cascade-final.patch` 固定本轮实际13文件差分，未混入其他dirty。
- 字段级联端点此轮明确定义为同一编辑行 `rowMode='editing-row'`；跨视图父行定位无正式合同，不在本轮支持。UI 与 Java 均未改。
- 保存重开/正式查询/目标编辑使用真实owner与传输边界夹具。本轮无线上请求或写入，未修改正式数据库记录；不声称线上字段级联配置已上传。
