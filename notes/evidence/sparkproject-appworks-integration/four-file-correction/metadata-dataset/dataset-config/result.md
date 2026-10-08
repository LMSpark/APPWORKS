# 原生 DataSet 顶层文件配置闭环

状态：主控验收与独立源码审查通过。仅修改 active plan 指定的四个源码/测试文件；无 Java、UI、数据库或线上写入，未 commit/push/建分支。工作树其他既有改动保留。

## 前像与范围

四文件原字节副本存于 `before/`，修改前 SHA256 在 `before-hashes.json`，最终 SHA256 在 `after-hashes.json`。前像是本轮开始时的混合工作树版本，不是 Git HEAD。

## 实际验证

- `red.log`：新增原生顶层配置文件用例首次失败，`pagedata.schemaVersion 不属于场景视图配置`。
- `green.log`：首次生产修改后同一用例通过。
- `final-two-suite.log`：ScenarioViewFile 与真实持久化套件，2 文件、82 测试通过。
- 四文件精确 ESLint 在本轮工具输出中退出 0；当次无 stdout，未生成原先标注的 `final-four-file-lint.log`。主控将在最终复核时实际落盘 lint 证据。`git diff --check --` 四文件退出 0。
- 根 typecheck、AI codegen 与原生回归由主控集中执行；本 writer 未重复运行。主控 typecheck 指出测试中两处索引签名访问错误后，已仅将 `Parents` 改为括号索引；新增用例 1/1 复验见 `type-fix-focused.log`。

## 行为与边界

文件允许可省略的正安全整数 schemaVersion（显式 3 已验，缺省仍由原生 DataSet 取 2）、非负安全整数 version（0 已验）、严格的 `layout.tablePositions` 以及场景可用的 `saveChanges.mode=perView`。未知表、非有限坐标、旧图布局键、事务策略/端点、额外键和文件自定数据库/宿主身份在原文及历史改变前被拒绝。

装配器只显式转交四项已验证配置，并为 layout/saveChanges 创建独立副本。真实 ScenarioViewFile/ProjectWorkspace 保存，经 fresh workspace 重开后 DataSet.toJson 保留配置；文件 revision 增加不改变 version 0；stageView 修改视图仍保留顶层配置。两个装配实例中的 layout/saveChanges 临时修改互不影响，也不改变文件真源。恢复的 DataSet.saveChanges() 触发原有 BatchTableOperateRequestByCRUD，请求剥离本地计算列。清除四项并再次保存重开后，schemaVersion 回到原生默认 2，其余三项无残留。

## 主控最终证据

- `root-regression.log`：原生 metadata-schema、scenario-model-identity、commit-mode 和单目标设计会话 4 文件、105/105 通过；`root-ai-codegen.log` 退出 0，扫描 1012 文件。
- `root-typecheck.log` 保留两处测试 TS4111 的首次失败；仅将这两处字典点访问改为括号索引后，最小用例通过，最终 `root-final-typecheck.log` 退出 0。`root-final-lint.log` 为主控实跑四文件精确 ESLint，退出 0（没有 stdout）。不伪造未留存的 writer lint 日志。
- 独立只读审查 `.superpowers/sdd/plan-data-space-metadata-dataset/dataset-config-review.md` 通过。其结论为代码差分审查，不代替主控类型门禁；测试索引修正两行由主控单独核对。最终四文件 SHA256 与 `after-hashes.json` 一致，主控记录 `root-final-hashes.json`；精确本轮差分 `dataset-config-final.patch` 位于同一 sdd 目录。
- 未重复线上登录。新增配置的持久重开/查询保存证据来自真实 owner 加传输边界夹具，不宣称线上新增配置保存或整个 DataSet 已完整。旧画布迁移、数据库来源映射、多父字段输入级联及完整矩阵其余项继续在原计划实施。
