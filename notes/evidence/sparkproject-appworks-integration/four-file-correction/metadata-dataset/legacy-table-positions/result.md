# 旧布局节点位置导入原生 DataSet

日期：2026-10-09。状态：实现及局部验收通过，完整回归未通过；整体计划继续 implementing。

## 结果与范围

单目标设计会话新增显式 `stageLegacyTablePositions({expectedText, expectedLayoutText})`，复用既有只读布局 reader。将旧图正式模型 ID 唯一映射到原生表名，再补入 `pagedata.layout.tablePositions`。不自动迁移，不复制模型/字段/关系，不改变旧图文件；边路径和扩展仍留在原文件。候选走原生装配校验及既有保存 owner。

精确改动为三个生产路径和一个既有测试：

- `src/lowcode/data-space/view-design/lowcode-data-space-view-layout.ts`：新增节点位置转换。
- `src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts`：显式暂存命令、身份/草稿/异步失效检查。
- `src/lowcode/data-space/lowcode-data-space-design.ts`：注入既有布局 reader。
- `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-design-session.test.ts`：新增16项行为测试，现共38项。

## 验证证据

| 验证 | 结果 |
| --- | --- |
| typecheck 基线/最终 | 通过，见对应日志 |
| 精确 Lint / AI规则 | 通过；AI扫描1027文件 |
| 首个红→绿 | 缺失方法失败→真实装配/保存/重开通过 |
| 相关五套件 | 74项通过；随后复审修复读失败时作用域失效未释放的问题 |
| 最终会话测试 | 38项全部通过，2.88秒，见 race-green.log |
| 线上只读 | 136读、0写；7个真实节点坐标精确映射；本地草稿还原，旧图和两个pagedata文件未变 |
| 最终完整根测试 | 210套件通过、1套件失败；2786项通过、3项失败；456.26秒，退出1 |
| 原条件局部复验 | 3项均超过原有5000ms；25.44秒，退出1 |
| 修改前源码隔离对照 | 同3项均超过5000ms；28.24秒，退出1；未覆盖工作区文件 |

根失败位于既有 `data-space-design-four-file.test.ts`：命名视图创建/重开（462行）、关系创建/重开（1060行）、关系编辑删除（3796行）。首次是两项超时和一项重开后未渲染关系内容；局部复验及修改前对照都是三项超时。对照配置只在测试转换时替换本轮两个既有生产文件的前像，日志确认设计会话模块已替换；宿主模块未进入这三个用例，新导入命令未被调用。证据不能确定超时深层原因，也不能据此宣称完整零回归。

没有放宽超时、跳过失败项或更改业务断言。完整根测试结束后未反复盲跑。四个源文件最终哈希与冻结记录一致，见 verification.json。

## 兼容核对

本轮重新核对用户要求：`DataView.value` 继续按 `valueField + selectionDelimiter` 输出已有字符串格式；通用级联读取实际字段值或选中主键数组。显式 `selection-string` 子值经过选项重查后仍写回字符串，例如 `01|0|gone` 保留有效项为 `01|0`；原生数组与普通含分隔符字符串不被猜测转换。本轮未修改这些实现；对应现有测试在根回归通过。线上本轮只验节点位置，不重复声称已完成字符串业务字段提交。

## 边界及下一步

保留本轮已验源码，不对巨大脏工作区做整文件Git回滚。没有Java/UI修改、远端写入、提交或代理派工。原生节点位置的本地保存重开已有测试，线上只是本地候选，未发布。完整旧图迁移及整体AppWorks集成均未完成。

下一验证事项是单独定位既有三个页面用例的超时/重开渲染时序，先建立当前与前像的行为对照，不直接延长阈值。在此之前不将本闭环标作全量验收通过，不重复已验值级联探针。其余完整DataSet矩阵缺口仍按主计划推进。

待沉淀发现暂留本记录：异步读取拒绝也必须复查会话作用域，避免失效实例继续存活；已有保存开始会改变generation，过期导入可先报STALE，不必强求SAVE_PENDING。未写入knowledge。
