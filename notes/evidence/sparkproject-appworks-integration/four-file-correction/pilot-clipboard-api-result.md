# 复制 API 子计划执行结果

## 执行范围

- 新增 `config/pages/data-platform/data-space-design/pagedata.json`：固定设计场景 `8D1AB14DD8277F3E7017CD38F77B09FD`，仅绑定正式模型 `Base_DataModel` / `Base_DataModel_Field`，分别配置 `apiInfoModels` / `apiInfoFields`，默认视图与命名视图均 `autoLoad: false`，命名视图 `pageSize: 500`，字段视图按 `rowid asc` 排序；`viewCascades` 为空。
- 修改 `config/pages/data-platform/data-space-catalog/script.js`：为可读且有正式 rowid 的当前行增加“复制 API”；以固定设计场景的两个正式 DataView 执行 `allPages: true` 查询，逐字段检查可读权限、数据空间与模型归属，按源格式生成文本，并通过任务1提供的 `$page.copyText` 复制。缺场景显示已定文案，其他失败使用受控提示；页面失效、owner scope 失效、结果替换或行切换不显示迟到通知。
- 修改 `tests/runtime/page/catalog/data-space-four-file.test.ts`：保留原 CRUD 断言，补真实 `PageRuntime` 双场景、正式装配与 runtime owner 查询夹具，覆盖多页查询、源格式及完整声明名碰撞、空模型、隐藏/掩码、数据归属、缺少声明场景、行 ID 隐藏、行切换、目录/设计 view 刷新替换、页面 abort/dispose、查询 scope 变化、剪贴板拒绝与重试，并确认不发业务保存请求。

## 关键合同复核

曾基于只读初查错误判断 `DataView` 没有全页查询入口。主控指出扩展参数合同后，已完整核对并更正：`captureDataSpaceViewQuery` 明确接收 `allPages/maxRows`；`DataSpaceQueryResource.query` 通过 `collectDataSpaceQueryPages` 检查每页数量和一致 total，并仅在所有页成功后创建同一权限上下文；既有 `data-space-runtime-api.test.ts` 也通过 `view.loadFromServer({ pageSize: 1, allPages: true, maxRows: 2 })` 验证双页收集。本任务未改底座或 DataView 泛型层，也没有使用 raw HTTP。

多页主用例使用实际页面运行时和 `LowcodeDataSpaceAssembler`。测试将两个真实 DataView 的运行页大小设为 1，模型查询返回 4 页，字段查询返回 3 页；断言了正式 FormKey、字段过滤、rowid 升序查询、页码序列、完整输出文本和零保存请求。

另按固定参考 `normalizeText` 与 `normalizeBinaryNumber` 语义验证空白 `type` 回落 `dataModel`、空白主键字段名回落 `rowid`、数字字符串主键标记按 `Number(value) !== 0` 处理。完整常量声明名集合检查避免模型名与其它模型的 `_Type` / `_PK` 声明冲突。剪贴板 Promise 已开始后系统写入不能撤回；若等待期间页面或设计查询身份失效，代码只抑制迟到成功通知。

最终顺序复核中，先对所有模型记录逐字段确认 `read === 'visible'` 并通过数据空间/行 ID 校验，之后才读取已授权的模型 rowid 建立字段归属集合；字段行同样先通过逐字段权限校验才读取归属信息。

## 写前快照

- `copy-api-before/script.js.txt` SHA-256：`341E7952A15769FFC42ED69878DBA5D3464C1510891BE1E574067FD5E90A4A25`
- `copy-api-before/data-space-four-file.test.ts.txt` SHA-256：`748D8E45CDAF07ADC97375BF4CD6A23860988A7468FC9AA00014F7FAAF89C20B`
- 开始时新设计场景 `pagedata.json` 不存在。
- 早期行为断言 RED：缺少“复制 API”按钮，断言得到 `false`；最小实现后通过。

## 验证结果

- `pnpm run typecheck`：通过，退出码 0。
- `pnpm exec eslint config/pages/data-platform/data-space-catalog/script.js tests/runtime/page/catalog/data-space-four-file.test.ts`：通过，退出码 0。
- 最终 `pnpm exec vitest run tests/runtime/page/catalog/data-space-four-file.test.ts`：1 个文件、49 项通过，退出码 0（包含原 CRUD 回归断言）。
- 最终 `pnpm run typecheck` 与指定两文件 ESLint：均通过，退出码 0。
- 主实现阶段指定七文件聚焦回归套件：7 个文件、124 项通过，退出码 0；最后一轮审查修正仅重跑样板、typecheck 和两文件 ESLint。
- 主实现阶段在 `packages/spark-component` 工作目录执行 `pnpm exec vitest run src/tests/runtime/createSandbox.test.ts`：1 个文件、25 项通过，退出码 0。根目录使用包配置时收集不到测试，故按包配置要求从包目录执行。
- `pnpm run verify:ai-codegen`：通过，检查 982 个文件。
- `pnpm run verify:dirs`：通过。
- `pnpm run verify:pages-config`：通过。
- 主控最后顺序修正后，样板 49 项及目标两文件 ESLint 再次通过；未重跑其它套件和门禁。
- 最终 `script.js` SHA-256：`3B21C483CAEBA42E4ABAD19395C1794AA193862029DE65B93A9B2276B21DA2EF`。
- 最终 `data-space-four-file.test.ts` SHA-256：`80CCD5195805793F386172BC1B1CF3242496B657CA51A11B4E55905506F121F3`。

## 边界与待办

- 仅修改上述三个资产文件；保留混合工作树中的既有改动；未提交、推送、建分支或在线部署。
- 线上保存、字节回读、浏览器剪贴板验收仍由主控执行；本报告不声称已完成这些线上动作。
- 候选可复用规则：`allPages` 必须经过 view owner 的全页校验才能形成含完整权限的结果上下文；调用方不能把单页结果拼接后声称具有等价权限基线。提交知识库前待阶段7确认。

## 主控验收与知识候选

2026-10-08 01:52：双场景工具入口的复制闭环通过。部署和五资产回读见 pilot-deploy-copy-api.json；普通查询选行、实际剪贴板6模型19常量行、两次8D设计场景GetData零业务写、刷新重进见 pilot-copy-api-online.json/png。普通选行工具栏失效修正后的主控3文件70项见 pilot-render-view-refresh-root-tests.log。正式菜单未切换，M0整页未完成。

知识候选暂留：allPages/maxRows 经正式DataView query owner保留权限；必需设计字段的可读性应先于值消费。用户未确认写knowledge。完成子计划 notes/plan-data-space-copy-api.md 按AGENTS删除；精确修改和验证记录在本报告、copy-text-result/review、copy-api-review和写前快照持续保留。
