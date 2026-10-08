# 场景视图文件与正式模型装配组合验收

仅新增 `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-persistence.test.ts`。测试使用真实 ProjectWorkspace、ScenarioViewFile、LowcodeDataSpaceViewDesign、LowcodeDataSpaceAssembler、DataSpaceRuntimeApi 和 DataSet；文件存储、正式模型读取及 HTTP 传输为边界夹具。没有 mock 装配器或 DataSet。

测试覆盖：两个正式模型各自的 default、shared、detail 视图，同名 shared 隔离；原生 ViewMetadata 全部配置项与合法正式 fieldProjection；stage/save 后全新工作区重读并装配、实际 owner 查询；列从正式模型生成，正式列新增后重开可见，文件无 columns/rows 副本；正式 resourceRelations 与显式 viewCascades 同时保留；缺失、损坏和错误绑定分别失败。

验收修正后，queryContext 使用普通业务参数 formid（PARENT/CHILD），正式 title 投影使用 resource 来源与正式 resourceFieldId。指定文件 Vitest 2/2 通过，精确 ESLint 通过。日志为 `test.log`、`lint.log`。根 typecheck 由主控执行并已通过。测试说明已有两类来源可组合恢复目标 DataView，但不等于元数据 DataSet 已纳入目标 DataView 定义的读写维护层；该层仍待后续闭环。未改生产文件、UI、Java、公共 API、权限，也未提交或上传。
