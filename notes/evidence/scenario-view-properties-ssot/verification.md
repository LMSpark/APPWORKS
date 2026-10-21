# 场景视图属性 SSOT 验收

日期：2026-10-09。用户批准：“确认，继续视图配置 SSOT 清理”。本人实施与复核，两个生产文件、对应两个测试文件及主文档。完成后的计划按 AGENTS.md 阶段 7 删除，批准范围与验收证据在此保留。

## 批准范围

- `packages/spark-project-model/src/scenario/scenario-view-config.ts`：统一 15 项正式视图属性判定，保留属性内容校验。
- `src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts`：删除属性清单副本，stage/clear 复用正式合同，保留字段引用、权限、候选装配和保存语义。
- 两个对应测试文件：场景文件校验与设计器编辑、保存重开、无效输入拒绝；相关会话、持久化与运行链回归。
- `docs/architecture/DATAFLOW_ARCHITECTURE.md`：按验证结果更新唯一属性清单 owner 和覆盖边界。

## 实现结果

- ScenarioViewConfig 拥有唯一、不可变的 15 项正式视图顶层属性表；文件校验和宿主 stage/clear 共用它。
- 属性表按 ViewMetadata 排除 tableName/viewId/rows 后的键做完整性检查。原属性内容校验、正式模型字段引用校验、草稿并发与保存链保持原位。
- isViewProperty 同时检查字符串类型和 own-property，保留旧 Set 对非字符串项及未知/原型键的拒绝。没有开放运行行或身份编辑。
- 主文档已更新 owner 和当前覆盖说明；没有把这次清单收敛写成全部旧逻辑已删除。

## 验证证据

| 检查 | 结果 |
| --- | --- |
| 根类型基线 | 通过；[typecheck-before.log](typecheck-before.log) |
| 补充行为后的原实现基线 | 2 文件 / 103 项通过；[behavior-baseline.log](behavior-baseline.log) |
| 共享清单后的同一行为集 | 2 文件 / 103 项通过；[behavior-after.log](behavior-after.log) |
| 非字符串 clear 回归 RED | 中间版本缺少字符串检查，数组和可转为合法属性名的对象均错误放行；2 项失败，[clear-coercion-confirmed-red.log](clear-coercion-confirmed-red.log) |
| 非字符串 clear 回归 GREEN | 补回原 Set 的严格类型语义后 2 项通过；[clear-coercion-green.log](clear-coercion-green.log) |
| 最终相关链路回归 | 5 文件 / 192 项通过，含文件、设计编辑、设计会话、持久化与运行装配；[final-tests.log](final-tests.log) |
| 根类型最终 | 通过；[typecheck-accepted.log](typecheck-accepted.log) |
| project-model 类型最终 | 通过；[model-typecheck-final.log](model-typecheck-final.log) |
| 根 lint | 通过；[lint-final.log](lint-final.log) |
| 架构 | 通过；[architecture.log](architecture.log) |
| AI 代码规则 | 1030 文件通过；[ai-codegen.log](ai-codegen.log) |
| 文档门禁 | 346 文件通过；[docs.log](docs.log) |
| ClassModel | 当时常规门禁通过，含 4 文件 / 49 项；[class-model.log](class-model.log)。后续查明该命令不刷新已有产物；新方法实际生成及直接 schema 对账见[后续生成验收](../permission-grant-source-ssot/verification.md)，不再以本行单独证明生成合同已更新 |
| 源码属性对账 | 旧文件 15 项、旧设计器 15 项与新清单完全相等；内容校验逐语句不变；宿主本地 Set 删除、两处改用共享判定；[property-audit-final.json](property-audit-final.json) |
| 差异检查 | git diff --check 通过，保留既有 CRLF 文件，使用 cr-at-eol |

192 项包含前面的定向用例，不相加报测试总数。15 项完整配置经 stage、写入文件夹具和重开保持；无效编辑/clear、同时赋值和清除保持原错误码、文本、版本和历史，未调用装配或远端写入。原权限、实例销毁和正式模型引用的回归继续通过。

## 中间诊断说明

首次新增测试有 satisfies 换行语法错误，非字符串边界夹具随后补了显式返回类型；对应中间日志保留，最终已修正，不能将这些测试书写错误当成产品 RED。源码对账第一次将 CRLF/LF 差异计入内容比较，最终只统一换行符后确认校验语句相同；没有格式化生产文件。

## 边界

本轮不改变 Java、界面、数据库、线上场景文件、数据权限、DataView.value 字符串或级联语义。文件持久化测试采用原正式 owner 的 I/O 夹具，不冒充在线整页验收。未提交推送；其他 SSOT 队列仍待处理。
