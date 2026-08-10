状态：superseded

替代原因：用户选择方案 2，要求全部在 AppWorks 前端适配，不新增数据库表、不增加字段、不改变任何后端结构。本计划的两张 SPARK 配置表前提已失效，由 `notes/plan-adapt-legacy-model-relations-in-frontend.md` 替代。

## 任务目标

在 AppWorks 中彻底分离数据资源关系与 UI 输入级联关系，以两类独立平台数据库配置为持久 SSOT；lowcode-jdk17 保持只读且运行时继续只走既有模型查询 API，AppWorks 前端适配器负责把配置装配为 spark-data 运行对象。

## 明确排除

- 不修改 `E:\lowcode-jdk17` 的 Java、POM、配置或部署。
- 当前计划不执行建表、资源注册、模型创建、种子写入或任何 live mutation。
- 不把 `Base_DataModel_Relation` 迁移、改写或重新解释成 SPARK 两类关系。
- 不新增 AppWorks 服务端或薄壳转发。
- 不把 UI 级联当成数据库外键，也不从资源关系自动生成 UI 级联。
- 不在前端推导岗位、机构、角色或用户授权；查询响应仍是权限唯一决策出口。

## 持久合同

### SPARK_DataResourceRelation

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| rowid | string | 持久主键 |
| sysid | string | 项目作用域 |
| dataSpaceId | string | 所属数据空间 |
| relationKey | string | 数据空间内稳定业务键 |
| name | string | 显示名称 |
| parentResourceId | string | 父数据资源稳定 ID |
| childResourceId | string | 子数据资源稳定 ID |
| fieldBindingsJson | JSON text | 父/子资源字段映射数组 |
| cascadeUpdate | boolean | 是否级联更新，默认 false |
| cascadeDelete | boolean | 是否级联删除，默认 false |
| enabled | boolean | 是否启用 |
| sortNo | integer | 稳定排序 |
| version | integer | 乐观锁版本 |
| description | string | 说明 |

`fieldBindingsJson` 每项包含 `parentResourceFieldId/parentResourceField/childResourceFieldId/childResourceField/operator`。资源字段 ID 是稳定证据，字段名用于实际模型查询；二者 readback 必须一致。

### SPARK_UiInputCascade

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| rowid | string | 持久主键 |
| sysid | string | 项目作用域 |
| dataSpaceId | string | 所属数据空间 |
| cascadeKey | string | 数据空间内稳定业务键 |
| name | string | 显示名称 |
| sourceModelId | string | 源 DataView.viewId |
| targetModelId | string | 目标 DataView.viewId |
| triggerType | string | currentRow/selectedRows/allRows/pagedRows |
| inputBindingsJson | JSON text | 源值到目标输入的映射数组 |
| emptyBehavior | string | clearTarget/skipRequest/requestWithoutInput |
| autoLoad | boolean | 输入变化后是否查询目标视图 |
| enabled | boolean | 是否启用 |
| sortNo | integer | 稳定排序 |
| version | integer | 乐观锁版本 |
| description | string | 说明 |

`inputBindingsJson` 每项包含 `sourceField/targetKind/targetName/operator`；`targetKind` 仅允许 `filterField` 或 `inputParameter`。它不引用资源关系，也不携带前端权限结论。

## 影响范围

### spark-data 独立领域合同

- `packages/spark-data/src/types.ts`
  - 以 `DataResourceRelation` 正名资源结构关系；以 `DataViewCascade` 和 `DataViewCascadeBinding` 表达 UI 输入级联；删除把两者合并后的公共/内部 `DataRelation` 假设。
- `packages/spark-data/src/dataset.ts`
  - 分别维护资源关系索引与 DataView 级联索引；删除 `deriveViewDependencies/expandRelations/_resolvedRelations`；资源关系只服务聚合、资源查询和保存顺序，DataView 级联只服务输入编排。
- `packages/spark-data/src/data-view.ts`
  - 读取 DataView 级联绑定，等待空闲父视图完成后生成 filter/inputParams；不再从资源关系借 parentField/childField。
- `packages/spark-data/src/strategies/cascade-delegate.ts`
  - 订阅独立 DataView 级联，按 triggerType、emptyBehavior、autoLoad 执行。
- `packages/spark-data/src/dataset-crud-tool.ts`
  - 分开提供资源关系 CRUD 和 DataView 级联 CRUD；选择器使用各自稳定 key/ID。
- `packages/spark-data/src/index.ts`
  - 显式导出新的有限合同，移除旧混合关系导出。
- `packages/spark-data/src/tests/dataset-request-orchestration.test.ts`
- `packages/spark-data/src/tests/dataset-relation-rebuild.test.ts`
- `packages/spark-data/src/tests/dataset-structure-crud.test.ts`
- `packages/spark-data/src/tests/dataset-crud-tool.test.ts`
- `packages/spark-data/src/tests/dataset-json-prompt-validation.test.ts`
  - 分别覆盖资源关系、filterField 级联、inputParameter 级联、异步父加载、空值策略、多模型和无资源外键级联。

### lowcode 公共前端 API

- `packages/spark-lowcode-api/src/platform/data-space/data-space.ts`
  - 将后端旧模型关系标识为 backend model composition evidence，不再暴露为 SPARK 资源/UI 关系。
- `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts`
  - 数据空间读取保留模型/字段及后端旧关系证据；增加读取两个 SPARK 配置模型的只读入口，按 sysid+dataSpaceId 过滤并严格解析 JSON 文本。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts`
  - 运行查询继续只接受目标前端模型；把适配器提供的规范 filter/inputParameters 转为 lowcode wire，不读取 UI 级联表。
- `packages/spark-lowcode-api/src/platform/data-space/data-space-api.ts`
- `packages/spark-lowcode-api/src/index.ts`
  - 收束并导出独立的关系配置读取合同。
- 对应 `*.test.ts`
  - 用 characterization fixture 验证旧关系不进入新合同、两张配置模型正确读取、异常 JSON 和跨 sysid/dataSpaceId 数据 fail-fast。

### AppWorks 前端适配层

- 新增 `src/lowcode/data-space/lowcode-data-resource-relation-adapter.ts`
  - 将资源关系配置映射到 DataResourceRelation，并以目录 readback 验证资源/字段身份。
- 新增 `src/lowcode/data-space/lowcode-ui-input-cascade-adapter.ts`
  - 将 UI 输入级联映射到 DataViewCascade，验证 source/target modelId 和绑定字段/输入参数。
- 新增 `src/lowcode/data-space/lowcode-data-space-assembler.ts`
  - 按 DataSpace→DataSet、Resource→DataTable、Model→DataView 装配，并分别注入两类关系。
- 删除 `src/lowcode/lowcode-data-space-runtime.ts`
  - 删除只加载一个模型且由调用方预建 DataTable 的旧桥接。
- `tests/auth-nav/lowcode-data-space-runtime.test.ts`
  - 覆盖独立关系装配、旧关系隔离、标准模型查询和权限快照。

### 数据库与种子设计制品（只生成，不执行）

- 新增 `backend-api-contracts/platform-metadata/spark-data-resource-relation.schema.json`
- 新增 `backend-api-contracts/platform-metadata/spark-ui-input-cascade.schema.json`
- 新增 `backend-api-contracts/platform-metadata/spark-relation-seed-plan.json`
  - 使用可移植类型描述两张表、系统模型、字段、稳定 semantic key、预期 readback 和两阶段治理依赖；不包含凭据或可直接执行的 SQL。

## 技术方案

1. 用现有 backend characterization 固定 `Base_DataModel_Relation` 的旧语义和消费者，禁止适配器把它当新 SSOT。
2. 在 spark-data 中先分离关系类型、索引和消费者，删除 `DataRelation` 合并层。
3. 为 DataViewCascade 建立独立输入绑定求值器，输出规范 filter 和 inputParameters；等待父视图真实异步完成。
4. 在 lowcode API 中增加两个配置模型的只读合同，所有数据库访问仍通过现有模型查询 API。
5. AppWorks 装配器分别读取数据空间模型、资源关系和 UI 输入级联，完成身份 readback 后构造 DataSet。
6. 生成两张数据库表及其系统模型的 dry-run 种子设计；实际创建和写入必须另走受治理 mutation 计划。
7. 完成包级测试后，再重写完整页面运行/开发系统接入计划，不在本计划中提前删除 pagedata 真源。

## 兼容性

- 不保留 `DataRelation`、`tableRelations + viewDependencies 自动合并` 或 `Base_DataModel_Relation` 双重解释。
- 当前使用旧关系元数据的 AppWorks fixture 和调用方必须迁移到两个明确合同；不提供薄壳别名。
- lowcode-jdk17 和其旧关系表完全不变，现有后端导出、权限、工作流和模型查询行为不受影响。
- 两张新配置表未实际 provision 前，真实集成状态只能是 blocked-on-seed，不能回退读取旧关系冒充完成。

## 验证计划

1. `pnpm --filter @spark-appworks/spark-data run typecheck`
2. `pnpm --filter @spark-appworks/spark-data run test:run`
3. `pnpm --filter @spark-appworks/spark-lowcode-api run typecheck`
4. `pnpm --filter @spark-appworks/spark-lowcode-api run test:run`
5. `pnpm exec vitest run tests/auth-nav/lowcode-data-space-runtime.test.ts`
6. `pnpm run verify:lowcode-contracts`
7. 全链开始前再执行根 `pnpm run typecheck`、`pnpm run lint`、`pnpm run verify:arch` 和 `pnpm run test:all`。

## 风险项

- 后端旧关系仍影响后端自身模型树；新合同只是不再消费它，不能删除旧表或旧数据。
- UI 输入级联允许不对应资源外键，绑定字段和输入参数必须逐项验证，禁止字符串猜测。
- 新配置模型的稳定 modelId 必须由种子 readback 取得；不得在前端代码生成或硬编码临时 ID。
- 浏览器不直接连接数据库；“前端适配”仍通过现有 lowcode 模型 API 和后端权限边界。
- 当前工作树有大量用户改动；实施只能逐文件重读并按最小闭环推进。

## 回滚策略

- 当前仅修改研究与计划文件，不修改生产代码和数据库。
- 实施阶段每个闭环分别处理 spark-data 合同、lowcode 读取和 AppWorks 适配，验证失败时只回退该闭环的明确归属改动。
- 若真实 readback 证明两个系统模型无法通过现有模型 API读取，停止前端适配，不改 lowcode-jdk17 弥补。
