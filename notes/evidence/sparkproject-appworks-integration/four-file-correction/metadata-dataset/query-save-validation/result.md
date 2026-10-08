# 正式查询保存列校验局部闭环

状态：本轮五文件闭环已通过主控与独立验收；完整DataSet/AppWorks仍在实施。

## 行为

- `DataValidator.validateColumns` 复用原列规则；原 `validate` 仍执行自定义整行回调，正式增量保存只调用列规则。
- 查询保存新增行校验全部适用非计算/非系统列；更新按原查询唯一身份和实际提交 delta 校验，跳过未变字段与 `undefined`，删除不验旧值。失败诊断只含表、视图、字段和原规则消息。
- `DataSet.saveChanges` 在应用任何编辑缓冲前，对所有活动正式目标只读预检当前行加实际 overlay；`DataView.saveChanges` 与 `saveQueryViews` 在 owner/变更状态前复检。选择行、`applyEditingRows:false` 和无操作选择保留原语义。
- pagedata 文件 owner 保存带规则定义后，fresh workspace 装配正式模型；无效编辑由 `DataSet.saveChanges` 拒绝且保存 HTTP 为零，修正后正式 BatchTableOperateRequestByCRUD 请求和回执成功。此项是传输边界夹具验证，未执行线上写入。

## 证据

- 根类型基线由主控 `root-baseline-typecheck.log` 验为退出码 0。开工前四个既有文件字节与 SHA 在 `before/`、`before-hashes.json`；新测试文件无前像。
- `red.log`：改前非法 `title` 更新进入 owner；`first-green.log`：首改后同一用例 1/1 通过。
- `final-focused.log`：约定四套 4 files / 59 tests passed，退出码 0。
- `final-lint.log`：精确五文件 ESLint 退出码 0；范围内 `git diff --check` 退出码 0。
- 最终五文件 SHA 在 `after-hashes.json`。未 commit/push/建分支，其他 dirty 文件未改。
- 主控最终根类型 `root-final-typecheck.log` 退出0；`root-ai-codegen.log` 通过（1016源文件）。
- 主控影响回归 `root-regression.log` 7套274/274。原命令8路径中，runtime/data-space-runtime-api.test.ts不符合根include，已单独在spark-lowcode-api包级配置运行，`root-runtime-owner.log` 1套98/98；没有把被遗漏的路径当成已测。
- 独立报告 `.superpowers/sdd/plan-data-space-metadata-dataset/query-save-validation-review.md` 通过，4份前像和5份最终SHA核对一致。前像文件名以路径斜杠转双下划线存储，精确差分在 `query-save-validation-final.patch`，冻结哈希在 `root-final-hashes.json`。
- 主控冻结前发现capture清理reverted dirty发生在校验前，现static入口先全目标只读预检，原成功清理行为不变；相应原生失败保持测试通过。隐藏字段夹具已同时核fieldAccess/readFieldAccess和实际view字段状态，显式新值仍校验。

## 边界

本轮仅消费列规则，不把配置当作授权；未按本地 E/R 裁剪候选行，服务端授权与正式保存 owner 保持原状。未改 Java/UI、非 scenario CRUD 或事务模式。本轮无线上请求或写入，真实owner加传输夹具验证不冒充线上业务保存。
