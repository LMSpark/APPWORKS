# 无正式主键模型的 DataView 只读消费

状态：本轮限定底座实现和定向验证通过；D07 页面预览及完整四文件页未验收。

## 字节前像与范围

`manifest.json` 对 8 个候选文件保存修改前 SHA256；同目录按仓库相对路径保存了每个文件的真实原字节副本。`final-manifest.json` 逐文件记录前后 SHA256/字节数。实际修改 3 个生产文件和 4 个测试文件；`src/lowcode/data-space/lowcode-data-space-assembler.ts` 前后哈希一致。主控另独立维护 `packages/spark-lowcode-api/README.md`，不计入执行者修改。

## 精确行为差异

- `data-space-design-api.ts`：仅非数据库表、无 `PrimaryKeyFields` 且所有字段均未标记主键时，正式模型投影 `primaryKey: ''`；已声明但无效的主键和数据库表原有校验继续拒绝。正式模型类型注释记录空字符串只读合同。
- `data-space-query-context.ts`：正式无键绑定不采信查询响应的主键字段；原查询 owner 保留逐原行 `readFieldAccess`。无键的新增与行动作隐藏，`prepareSaveChanges` 和直接 `buildSaveRequest` 都拒绝非空增改删。原有有键绑定及权限路径不变。
- `data-view.ts`：无键视图将本次查询的本地克隆行与同次 owner 原行作私有关联，字段只展示 owner 的可见/脱敏/隐藏结果且始终只读。复制行、跨视图行、已替换旧行无法借关联读取；外部结果替换和清空释放关联，失败替换恢复先前关联。关联在结果更新/`rowsChanged` 前建立。有键视图继续使用原 `rowKey` 权限路径，重复键不会被原行读取能力抬权。

## 验证

基线 `pnpm run typecheck`：`typecheck-baseline.log`，exit 0。首个无键正式模型红例复现原 `正式主键无法映射`，修复后通过。

最终原始日志均在本目录，以下命令 exit 0：

| 命令 | 日志 | 结果 |
| --- | --- | --- |
| 根 `pnpm run typecheck` | `typecheck-root-final.log` | 通过 |
| API 包 `pnpm run typecheck` | `typecheck-api-final.log` | 通过 |
| data 包 `pnpm run typecheck` | `typecheck-data-final.log` | 通过 |
| 七个实际修改文件精确 `pnpm exec eslint ... --max-warnings=0` | `eslint-final.log` | 通过 |
| API 包 `vitest run src/platform/data-space/design/data-space-design-api.test.ts` | `test-design.log` | 63/63 |
| API 包 `vitest run src/platform/data-space/runtime/data-space-runtime-api.test.ts` | `test-runtime-api.log` | 98/98 |
| 根 `vitest run tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts` | `test-assembler.log` | 36/36 |
| 根 `vitest run tests/runtime/data-view/dataview-crud-bridge.test.ts` | `test-dataview.log` | 23/23 |

定向断言包括普通 `id` 不变成无键模型主键、两命名视图隔离、可见/脱敏/隐藏、复制/旧行拒绝、失败重查及替换回滚、`rowsChanged` 观察不到先隐藏后可见、重复键不抬权、无键保存双入口拒绝。主控另完成 shif 正式读取→装配→两个 DataView 的在线只读验收，证据由主控保存；本执行者未发在线写请求。

## 边界

主控复核：最终生产 SHA 与 final-manifest.json 一致；针对关联时序修正再次运行 online-dataview-read.mjs，online-after.json 最终结果 stage=complete。真实字典正式主键仍为空，两个视图各 2 行/总数 2、4 字段只读，增改删子动作隐藏；复制行、跨视图及刷新旧行拒绝读取，刷新一个视图不影响另一个。未执行线上保存。model-list-regression.txt/png 记录现有四文件页 7 模型仍可读；它不是目标字典数据的页面预览证据。

用户新要求已写入 AGENTS.md 与主计划：DataView 的定义/配置/管理纳入数据空间，配置设计按依赖级联。本次线上脚本仅装配非持久视图配置，所以不满足空间视图管理闭环；后续须复用现有场景共享文件 owner 补配置管理、持久重开和页面引用，不再把临时预览作为集成完成。

RendererHostScope 的 `rowMirror` 会再复制 DataView 行，普通表格字段 UI 尚不能凭此闭环宣称恢复；下一步须沿其直接消费者单独验证身份传播，不能放行任意复制行。JSON 来源服务端查询权限拒绝亦未在本轮改变。
