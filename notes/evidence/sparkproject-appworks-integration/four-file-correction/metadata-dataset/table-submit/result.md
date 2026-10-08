# DataTable 提交配置：冻结的局部验证记录

状态：局部改动已验证并冻结；用户要求先梳理整体语义，暂无新增实施。本记录不表示完整 DataSet 或 AppWorks 已完成。

## 改动与边界

七文件清单与前后哈希见 `root-final-hashes.json`，精确补丁见 `table-submit.patch`。六个生产文件、一个新增测试文件；主控直接实现、自审，没有本轮独立代理审查。

`ScenarioViewConfig → ScenarioViewFile/ProjectWorkspace → Assembler → DataTable → DataView.saveQueryViews → DataSpaceRuntimeApi/DataSpaceRequest` 接通 create/update/delete 的 SPARK 兼容端点配置及有限调用策略。配置从实际提交视图所属表捕获 api/crudConfig 值，不传 DataTable 实体，不从共享查询上下文反推表配置。

仍使用原查询身份、权限与凭据、CrudModel 请求和实际动作回执。同一批次活动操作的端点或超时不同，发送前失败；不承诺跨端点、跨模型原子事务或任意 REST 转换。自动重试、关闭校验、身份头覆盖和函数持久化不在已实现范围。名称未改。

## 已保留验证

- `root-regression-final.log`：7 套件，174/174。
- `api-regression-final.log`：2 套件，208/208；合计 382 个用例，9 套件。
- `post-lint-test.log`：最终仅删除冗余判断后，新提交配置用例 17 项通过。
- `typecheck-frozen.log`：根 typecheck，exitCode=0。
- `lint-frozen.log`：精确七文件 ESLint，exitCode=0，保留完整命令。
- `ai-codegen-final.log`：1018 文件规则扫描通过；随后仅移除上述冗余判断，最终类型/lint/17 用例重新通过。
- `before/`、`status-before.log`、`typecheck-before.log` 保留前像、工作树及编译基线。

传输使用 HTTP 边界夹具，贯穿真实文件 owner 保存、新工作区重开、正式装配、查询基线、实际提交请求及回执接纳。未做线上写入、Java/UI 修改、commit/push/建分支。

## 返工与限制

1. 查询在途缓存可能共享上下文，context→单个 DataTable 映射错误，已移除。
2. 保存命令传完整 DataTable 触发循环序列化，既有测试未改弱；修正为 tableConfig 值，原失败用例通过。
3. 非 JSON 参数 Date 曾被归一成空对象，以红测试确认并修复，循环/非 JSON 对象明确拒绝。
4. 最终 lint 冗余 null 判断已修正并复验。

历史失败输出保留，不以最终通过掩盖返工。完整操作矩阵、部分成功恢复与业务线上端点兼容性未验；参见主研读 `notes/research-data-space-data-chain.md` 后再修订下一闭环。
