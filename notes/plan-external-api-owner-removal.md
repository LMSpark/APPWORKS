状态：superseded（2026-10-24）。转入[唯一台账](data-space-retirement-ledger.md)的完整整合计划；四个owner与专题装配器当前仍存在。本轮仅修复显式重读与公共保存规则回归，不宣称删除方案完成。以下保留为历史候选设计，不能独立继续实施。

## 任务目标
外部API管理统一到SPARK data：删除4个owner与LowcodeApiProvider专题装配器，页面经标准场景入口装配，全部数据行为由spark-data DataView/DataSet承接，页面只绑定并转发简单事件。

## 阶段与业务语义
- 服务商目录与基础信息、请求方案（公共参数/公共头部/令牌前缀）、接口方案（定义/输入/头部/输出只读）三页的查询、编辑、新增、删除限制、校验、保存、未知回执重读完整闭环。
- 输入：导航场景ID、服务商ID（scenarioInputs.providerId）、接口当前行（查询级联）。输出：正式记录写入与回读，目录刷新。
- 异常：校验失败保留草稿；未知回执禁止重放，仅discardAndReload显式重读；有草稿时锁定当前行。

## 影响范围
- 删除：packages/spark-lowcode-api/src/platform/resources/external-api/api-*-design.ts（4个）及index.ts导出；src/lowcode/resources/external-api/lowcode-api-provider.ts；config/pages/integration/{api-management,api-config,api-interface,api-interface-context}/pagedata.json。
- spark-data：types.ts、validation/、data-view.ts、dataset.ts、cascade field runtime。
- spark-project-model：scenario-view-config.ts 列/视图白名单。
- 页面：src/views/features/integration/api-management/ui/ 三个页面。
- 测试：tests/runtime/page/api-provider/*，spark-data单测。
- 文档：docs/architecture/DATAFLOW_ARCHITECTURE.md、notes/data-space-retirement-ledger.md。

## 技术方案
A 现有配置：columns.required、filterExpression+scenarioInputs、viewCascades、autoLoad、commitMode。
B spark-data新增：unique、trim、immutable、optionsView、valueFunction、allowDelete、queryConfig.fields外字段拒收、新行归属默认值与父新建时禁新增子行、字段级联fill、discardAndReload、lockCurrentWhilePending。
C 删除：逐行范围断言、校验期草稿指纹、保存前重复fieldAccess/addActionState检查、私有busy/uncertain。
完整方案见用户审批的计划（external_api_owner_removal）。

## 兼容性
- B7仅对声明queryConfig.fields的视图生效；回归出现破坏则改为显式开启。B11显式开启。
- 前提：线上SysForm场景pagedata存在或可经数据空间设计器标准保存写入，否则页面阶段阻塞，不保留本地装配器兜底。

## 验证计划
- pnpm run typecheck（基线通过，2026-10-24）
- pnpm run lint / pnpm run verify
- vitest：spark-data新增单测、tests/runtime/page/api-provider、tests/runtime/page、全量回归
- 在线：三页各一次新增/修改/保存并重开

## 风险项
- 线上场景文件缺失为最高风险。
- 不commit、不push。
