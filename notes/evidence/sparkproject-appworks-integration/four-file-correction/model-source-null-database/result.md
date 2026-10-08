# 数据库来源空库身份在线验收修复

在线探针 `../model-source-online-sync/probe-result.json` 显示数据库表列表首条 `Base_DataAccountDeveloper` 的 `dbid`、`DbName` 均为可读 `null`，同一列表后续记录有有效库身份。原 Reader 在 `sourceFromRow` 映射每行时拒绝空值，导致整页列表失败，无法选择有效记录。

本轮仅改两个文件。`src/lowcode/data-space/model-source/lowcode-data-space-model-source-reader.ts` 移除列表映射时的非空库身份判断；`prepare` 重新按来源 rowid 精确查询、比较全部候选身份之后，在字段查询之前拒绝 `dbid` 或 `DbName` 为空的数据库表/数据库视图，提示“数据库来源缺少数据库身份（dbid/DbName），无法创建模型”。`readFieldAccess` 对隐藏/脱敏字段仍在列表映射和重新查询时拒绝，未将无权读取等同于空值，也未猜默认库、过滤条目或改 total。

`tests/runtime/auth-nav/data-space/model-source/lowcode-data-space-model-source-reader.test.ts` 新增数据库表、数据库视图两组混合空库/有效库测试：列表保留两行及原 total；选中空库时只重新查身份、不查询字段；有效项继续完成 prepare；脱敏 `dbid` 仍拒绝。生产修改前运行新增测试，两组均按预期在列表映射处因旧保护失败。

修改前两个文件的真实字节副本按原相对路径保存在本目录，SHA256、大小见 [manifest.json](manifest.json)，复制后已与源文件逐一核对相等。最终 SHA256：Reader `20711CBC2B291C8BC8D20E1CF62C67D6C57FDC6BFD199E34AC51FEAE9401D5C6`；测试 `C953281A9BE2D8F6CE1FF4BA74A65ECF9ECB8332A770B3D672206425C9D3D35F`。主控审查后仅把新增测试 mock 的匿名 `options` 参数形状提取为具名 `QueryOptions`，没有改测试行为。

最终验证：Reader 套件 12/12，通过、退出码 0（[原始日志](reader-test.log)）；具名类型微调后根 `pnpm run typecheck` 退出码 0（[日志](typecheck.log)），两文件精确 ESLint 退出码 0（[日志](eslint.log)）；类型微调后未重跑未变行为的 Reader 套件。未重复四文件大套，未改页面、后端或线上配置，也未提交、推送、建分支。

剩余验收边界：本地修复已证合同；在线页面仍须在部署新 Reader 后由主控继续验证空库单条预览拒绝、有效来源保存与刷新重开。多表元数据保存的非原子风险未改变。
