# 模型关系表达式闭环结果

状态：本轮底座闭环已通过主控独立复验。此结果不代表完整数据空间页面验收。

主控最终证据与边界见 `model-relation-expression-review.md` 顶部：根类型、包类型、18 个 TS 路径 lint、AI/目录门禁通过；数据包 647 项与最终宿主 48 项通过。下列实施者阶段输出由该最终记录补充；历史失败日志保留。

## 已实现

- `DataResourceRelation.filterExpression` 是运行和序列化唯一关系条件；正式关系适配器递归保留完整过滤树、字段操作符和未知值函数，不再生成 `fieldMappings`。第三模型注册 Name（readModel 的 `name` / `metaName` 同合同）只有唯一命中时才映射到稳定 DataTable 名称/canonicalName；物理 `sourceName` 和稳定表名不作为注册别名。注册匹配歧义或未绑定名称与稳定表名冲突时产生诊断并拒绝该条运行装配，原正式表达式不变；其他外部引用保留原值。
- `DataResourceRelationInput` 是唯一历史输入形式。DataSet 入口把 `parentField`、`childField`、`fieldMappings` 转为过滤树；旧 `condition` 占位与表达式/旧映射冲突时拒绝。历史映射转换保留旧空键不关联语义；显式表达式仍执行标准 Filter 的 null 语义。序列化输出去除历史字段。
- 关系增删改在成功验证后才替换集合；失败不把未定义的关系集合改成空数组。相同端点可以由 `relationId` 精确定位；未唯一选择时拒绝。结构关系变更不会产生 `viewCascades`。
- 聚合消费者执行完整关系过滤树并复用 `DataViewFilterLocal`；表达式能力在空子行集前验证，schema 字段、父行依赖字段和每个子行依赖字段分别检查。多条同子表关系拒绝隐式选第一条，未知本地不支持函数经现有计算错误通道显式失败。
- 列/表改名和删除保护统一使用 `ResourceRelationDefinition` 的结构引用逻辑。自关系同一叶子同时维护父子两侧限定名；目录确认过的 GetRefData/GetGroupData 字段按各自 table key 更新；第三表引用会被维护或阻止删除。GetExpData 与未知扩展值函数内容原样保留，但因其可能隐藏任意表字段依赖，存在时相关关系阻止结构改名/删除；常量函数内部同名键不被改写。
- 旧字段映射在归一时恢复父/子字段存在性校验；完整表达式继续允许正式非输出字段。空白/不存在端点被拒绝，失败不改动关系集合。CRUD 创建直接消费 `DataResourceRelationInput`；canonical 更新消费 `Partial<DataResourceRelation>`，没有复制出第二份参数类型。
- API 文档与关系类型说明已改为完整过滤树合同，并说明本地计算失败走既有 `undefined` 与开发日志通道。

## 影响文件

- 生产：`packages/spark-data/src/types.ts`、`index.ts`、`dataset.ts`、`dataset-crud-tool.ts`、`resource-relation/resource-relation-definition.ts`（新增）、`strategies/computed-column-delegate.ts`、`src/lowcode/data-space/lowcode-model-relation-adapter.ts`、`packages/spark-data/API.md`。
- 测试：`packages/spark-data/src/tests/computed-columns.test.ts`、`dataset/dataset-crud-tool.test.ts`、`dataset/dataset-structure-crud.test.ts`、`dataset/dataset-request-orchestration.test.ts`、`cascade-computed-tree.test.ts`、`cascade-event-filter.test.ts`、`crud/commit-mode.test.ts`、`data-view/data-view-events.test.ts`、`data-view/data-table-responsibilities.test.ts`、`tests/runtime/auth-nav/data-space/lowcode-model-relation-adapter.test.ts`、`tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts`。

## 验证输出

- 最小红灯：首次完整树测试先失败，旧实现报告“关系 R 无法解析为正式模型字段映射”；本次 review 后新增第三绑定模型、非输出字段、歧义、常量值、无效历史字段、未知扩展函数与常量引用保护行为。
- `pnpm --filter @spark-appworks/spark-data run typecheck`：通过。
- `pnpm --filter @spark-appworks/spark-data run test:run`：30 个测试文件、647 项测试通过。
- `pnpm exec vitest run tests/runtime/auth-nav/data-space/lowcode-model-relation-adapter.test.ts tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts`：2 个测试文件、47 项测试通过。
- 对本轮全部 TS 生产与测试文件执行精确 `pnpm exec eslint ...`：通过；API.md 为 Markdown，不在 ESLint 范围。
- 覆盖行为包含真实 DataSet/DataView 计算列的嵌套 AND/OR、常量过滤、关系更新后重算；旧映射 null 语义与错误字段原子拒绝；未知函数在空子集时仍失败、扩展定义序列化往返和第三表删除/改名拒绝；0/false/null；非输出正式字段；限定字段执行/列改名/表改名/删除保护/序列化；第三模型注册名唯一映射、来源名保留和歧义诊断；常量内同名键不被改写；失败操作保持原状态；同端点 relationId 更新和删除。

## 未覆盖边界

- 命名视图上的关系选取和多关系的显式聚合选择仍未实现；同一子表多关系会清楚拒绝，不会静默采用首条。聚合仍保持既有 default 视图语义。
- `GetRefData`、`GetGroupData`、`GetExpData` 等服务端函数只保存和回读；本地 matcher 不执行这些函数。无法解析的外部引用也保留原值，因稳定关系目标不明不能宣称其本地引用维护完成。
- 主控最终根类型检查与 `verify:ai-codegen` 已通过，见顶部证据。原首次冻结失败日志 `model-relation-root-typecheck.log` 与 `model-relation-ai-codegen.log` 保留未覆盖。此处结果不证明真实服务端关系函数执行、全仓零回归或完整页面验收。
