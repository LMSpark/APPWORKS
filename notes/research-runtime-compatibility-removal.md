# 运行时兼容入口清除研读

## 已确认目标

- 不保留向后兼容入口，不增加薄包转发或双字段协议。
- 每轮只处理一个可验证闭环：断开旧入口、删除旧语义、同步直接消费者，再执行定向与全量回归。
- `E:\lowcode-jdk17` 永久只读；本轮仅修改 AppWorks。

## 第一闭环：蓝图 FormKey 与 ClassModel URL

### 事实与调用链

- `packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint-wire.ts` 从后端 `Base_NavigationInfo.conid` 读取页面场景身份，但当前归一化为 `legacyContentId`。
- `packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint.ts` 将该错误命名暴露为公共记录字段，同时还暴露了没有消费者的 `legacyContentType`。
- `src/lowcode/lowcode-runtime.ts` 组装运行菜单时优先使用后端授权树返回的 `formKey`，缺失时再读取 `record.legacyContentId`。这里的数据语义始终是 FormKey，不是第二套“旧内容 ID”。
- `tests/auth-nav/lowcode-runtime-navigation.test.ts` 是该投影的直接测试消费者。
- `src/class-model-artifacts/artifact-urls.ts` 同时公开 `getDtsClassModelManifestUrl` 与零消费者的 deprecated `resolveDtsClassModelManifestUrl`；后者只是原样转发。

### 决策

- 将归一化记录中的 `legacyContentId` 一步替换为 `formKey`；wire 层仍只负责识别后端真实字段大小写差异 `conid/conId/ConId`。
- 删除没有领域消费者的 `legacyContentType`，原始 `conType` 仍存在于只读 `source`，不为未知未来用途扩张公共合同。
- 运行导航只消费 `record.formKey`；授权树的 `formKey` 仍是后端最终授权证据，优先级不变。
- 删除 `resolveDtsClassModelManifestUrl`，不保留 deprecated 别名。

### 影响面

- `spark-lowcode-api` 公共类型发生破坏性变更；仓内仅运行导航与测试直接消费旧字段。
- 不改变后端请求、FormKey 身份、导航授权优先级或运行路由。
- 不涉及数据库写入、QYAPI/lowcode live mutation 或 Java 后端修改。

## 第二闭环：pageDesign 门禁 fail-closed

### 事实与调用链

- `page-design-gates.ts` 当前有两套行为：缺失 `implGate` 时默认 `open`，只有调用方传 `strictImplGate=true` 才关闭；缺失 `upstreamContractsSatisfied` 时固定视为 `true`。
- `page-design-ai-runner.ts`、workflow 输入合同与生成器继续携带 `strictImplGate`，形成同一门禁在不同入口下语义分叉。
- `project-blueprint-node.ts` 和 `project-blueprint-edit.ts` 把两个门禁字段建模为可选；其中 `upstreamContractsSatisfied=true` 会在持久化前被删除，依赖“缺失即 true”的兼容解释。
- DevSystem UI 允许清空 `implGate`，并显示“默认开放（过渡期）”；上游契约开关写为 true 时也会删除字段。

### 决策

- 删除 `strictImplGate` 输入、配置与分支；任何入口统一将缺失 `implGate` 解释为 `closed`。
- 缺失 `upstreamContractsSatisfied` 统一解释为 `false`。
- 编辑草稿始终提供 `implGate` 与 `upstreamContractsSatisfied`，默认分别为 `closed` 和 `false`；用户显式放行后持久化真实 `open/true`。
- workflow 生成源删除 `strictImplGate`，重新生成 design/definition；ClassModel 产物通过现有生成脚本更新，不手写生成文件。

## 第三闭环：工作流业务节点模型唯一结构

- 发布服务与 workflow 校验器已经将 `data.model` 判定为非法，但 `WorkflowDesigns.vue` 的读取函数仍在 `models[0]` 缺失时回退到 `data.model`，编辑函数还会静默删除旧字段。
- 这使非法文档在编辑态看似可用，并把显式校验变成隐式迁移。
- 编辑器改为只读取和写入 `models[]`；不读取、不迁移、不代删 `data.model`。旧文档保持显式无效，由既有发布校验给出错误。

## 第四闭环：主题与配色作用域存储

- `createThemeService` 和 `useColorScheme` 在项目作用域 key 缺失时都会读取全局 key、复制到项目 key；这是明确的旧数据迁移分支。
- 作用域切换后应只读取对应项目 key，缺失时使用产品默认值；全局 key 仅在无作用域模式下有效。
- 删除两处全局 key 回退与复制，测试改为证明作用域不会继承全局状态。

## 第五闭环：HTTP baseURL 唯一所有权

- `HttpClientBase.mergeConfig` 当前检测请求 `url` 是否已经包含 `baseURL` 路径，并偷偷剥离重复前缀；该逻辑专门兼容历史 endpoint 写法。
- 这使配置层 `baseURL` 与 endpoint 的路径所有权不清晰，并会静默改写调用方输入。
- 删除前缀猜测与路径改写；`RequestConfig.url` 原样进入适配器，`baseURL` 仅由客户端配置拥有。错误的 `/api` + `/api/x` 组合不再被掩盖。

## 第六闭环：CrudService 响应唯一合同

- `HttpClientBase` 已负责解包正式 `ApiEnvelope`；`CrudService.executeEndpoint` 又额外猜测 `success` 与 `data/node/record/item/result/rows/deleted` 七种业务包装字段。
- 该二次解包会把任意实体中同名字段误判为 envelope，也使端点可返回多套互不一致的响应形状。
- 删除 `WrappedEndpointResult`、字段优先级和二次解包；CRUD endpoint 的 `T` 就是 HTTP 客户端返回的业务数据。需要响应转换的列表场景继续使用既有显式 `transformResponse`。

## 第七闭环：子页面运行投影唯一字面量

- `ProjectBlueprintNodeKind` 中的 `sub-page` 是蓝图业务种类；`RuntimeNavigationItemKind` 没有该字面量。
- 项目模型仍通过 string 放宽、类型断言和 normalize 分支接受旧 `nodeKind='sub-page'`，再迁移为 `page + hidden + 无 path`。
- 删除旧运行字面量支持。子页面只用 `blueprintKind='sub-page'` 表达策划语义，运行/配置页投影直接使用 `nodeKind='page'`、`hidden=true`、无 `path`。

## 第八闭环：蓝图删除字段显式拒绝

- `project-blueprint-kinds.ts` 仍以 `isLegacySubPageKind` 单独识别已删除的运行字面量；改为统一校验 `RuntimeNavigationItemKind`，非法值直接失败。
- `normalizeProjectBlueprintTreeNodeData` 原来会静默删除 `planningStatus`，使旧文档在加载时被隐式迁移。
- 删除静默迁移；输入包含已移除 `planningStatus` 时直接报错，调用方必须提供当前蓝图合同。

## 第九闭环：SSE 两类当前协议分流

- lowcode `/api/sse/connect` 当前承载普通业务消息与 AI v4 SparkEnvelope，两者是并存协议，不是新旧替代关系。
- 旧实现把普通业务消息标为 legacy 并告警，同时对非 v4 Envelope 只告警后继续解包，语义相反。
- 普通业务消息保持直达 typed normalizer；Envelope 必须 `protocolVersion=4`，否则直接拒绝，不再兼容解包。

## 第十闭环：HTTP Envelope 唯一识别合同

- `ApiResponse<T>` 只有公共导出、仓内无消费者，删除该 `{code,message,data}` 旧类型。
- `ApiEnvelope` 删除根级 `requestId`，`protocolVersion` 固定为字面量 `4`。
- `HttpClientBase` 只有在 `protocolVersion=4` 且 `context.requestId` 存在时自动解包；根级 `requestId` 载荷保持普通业务对象，不再被误识别。

## 第十一闭环：TreeManager 远端传输所有权

- TreeManager 可独立承载本地树缓存，但远端操作原来会在未注入客户端时偷偷 `createRequest()`，绕过 DataTable/CrudService 的认证、租户和拦截器 SSOT。
- 删除独立 HTTP 客户端创建；本地树无需客户端，任何远端树操作都必须使用所属 DataTable 注入的客户端，否则立即失败。

## 第十二闭环：工作流连线输入拒绝非法值

- 连线端点 `dock` 缺失表示当前合同中的自动端点，可物化为 `0`；超出 `0..12` 的整数原来同样会被静默改为 `0`。
- 保留正式的可选自动端点语义；非法 dock 改为直接报错，不再借默认值掩盖损坏文档。

## 最终验证

- 旧符号残留扫描：0。
- `pnpm run test:all`：根测试 170 文件 / 1258 项通过；各包 814 项通过。
- `pnpm run verify`：typecheck、lint、架构、依赖目录、页面配置、AI 代码规则、文档、ClassModel、工作流、lowcode 合同与协议 parity 全部通过。
- `pnpm run build`：8 个可构建包与前端生产构建全部通过。
- ClassModel：702 分片、1262 公共索引、历史 semantic gap 1468；本轮未新增治理失败。
- lowcode 合同账本：385 个后端端点、127 个 AppWorks 消费者，生成校验一致。
