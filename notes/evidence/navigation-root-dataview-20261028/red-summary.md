# Navigation root DataView RED

范围：仅增加测试；未改产品源。所有命令原始输出保存在本目录 `red-*.log`。

| 层 | 结果 | 失败证据 |
| --- | --- | --- |
| Platform 注入/fail-closed | 10 failed / 49 skipped。fixture 为旧查询返回有效 `LEGACY-ROOT`；当前代码忽略注入 reader 并使用旧结果提交，导致应返回注入 `ROOT-B`、拒绝空/非字符串 ID、缺 reader fail closed 且不发 HTTP等断言失败。失败不是由损坏响应制造。 | `red-platform-selection.log` |
| Host DataView reader | 17 failed / 11 skipped。所有目标用例先失败于新导出 `readLowcodeNavigationRootId` 缺失；因此这是独立的 export/behavior contract RED。正向夹具使用真实 DataSpace GetData envelope 与后端 `lingma_sys_params` 的 `r/e/h/m` 集合，未 mock `DataView.fieldAccess`，也未构造假 `DataView.rows`。 | `red-root-reader.log` |
| 显式导航 | 2 failed / 36 skipped。两个确定性用例中，APP-A 执行 scope 下目标 APP-B 的导航仍未调用共享 root reader；旧 resolver 被 mock 保证失败由断言而非网络错误导致。 | `red-explicit-navigation.log` |

覆盖已写入的 host 用例：唯一 root、0/2/3 roots、三身份字段 h-hidden/m-masked、跨 SysId/非根 parent、模型/字段/space 不匹配、查询错误释放 DataSet、metadata/query guard stale。平台用例覆盖对象版选择与 reader 注入、缺 provider、空/空白/非字符串 root ID、trim 后保留 `ROOT-B != APP-B`。旧 scope、abort、最新意图、稳定错误、receipt 由原回归用例保留；显式目标与执行 app scope 的已有用例已改为期待共享 reader。

没有进行 GREEN 或真实 SPA 烟测。测试改动后 `pnpm run typecheck` exit 0；本 RED 轮只运行上表三组定向 Vitest及 typecheck。
