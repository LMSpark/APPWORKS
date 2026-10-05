状态：implementing

恢复记录：2026-08-29 远程 `/api/File/content/text` 已恢复标准 AjaxResult，原“服务未找到”阻塞解除；继续三个文件的独立上传、读回和指针切换。

LIVE 结果：节点 `126A5E370318B6F5F1448D57CDCA25C9` 已从本地产品完成三文件独立上传与逐文件读回。导航最终为 `NavigationUrl=cfg:4AF9984ABBB442368A5C575BDE62618E/126A5E370318B6F5F1448D57CDCA25C9`、`VersionId=rule=2;script=1;style=1`。空脚本/空样式按远程文件服务约束规范化为单个换行符；未执行 commit/push。

## 任务目标

把 `/dev` 收敛为一棵 WBS 蓝图与六个最小专业工作页签；六页签结果仍保存到同一条 `Base_NavigationInfo` 节点记录，其中配置页面只保留 `rule.json/script.js/style.css`，按 `cfg:` 文件夹和 `versionId` 三段指针独立上传、读回并切换版本。

## 影响范围

- `packages/spark-lowcode-api/src/platform/lowcode-navigation.ts`
  - 增加 `cfg:` 正式目标类型与严格解析；保持 `vue:` 小写协议。
  - `cfg:` 只表达设计文件夹资源，不得被识别为 external URL。
- `packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint.ts`
  - 在后端只读记录中补齐导航持久字段语义，至少包含 `NavigationUrl` 原值、`versionId`、`memo/htmlDesc/conid/conType` 及六页签保存需要的字段。
- `packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint-wire.ts`
  - 忠实读取 `versionId` 和六页签字段；不再合并 `memo/htmlDesc/description`，不从弃用标题字段回退。
- `packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint-api.ts`
  - 增加单节点读回与受治理的最小字段 mutation 门面；写入仍使用后端字段权限和完整性证据。
- 新增 `packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint-file-version.ts`
  - 定义 `versionId` 解析/编码、三文件版本指针和下一版本计算。
  - 兼容空值、历史单值和新具名分段；非法值 fail-fast。
- 新增 `packages/spark-lowcode-api/src/design/lowcode-design-file-upload.ts`
  - 封装 `/api/File/uploadFileByBytes` 的追加式文本上传。
  - 固定 `appType=designfile`、`isReplace=false`，由调用方提供 `customPath` 与 `{version}__{filename}`。
  - 上传结果结构异常必须失败；不在只读 `LowcodeDesignApi` 中混入薄写方法。
- `packages/spark-lowcode-api/src/index.ts`
  - 显式导出新增的文件版本合同与受治理上传门面。
- `packages/spark-lowcode-api/src/design/lowcode-design-api.test.ts`
  - 将读取样例改为版本化三文件；删除以 `pagedata.json` 代表页面文件合同的断言。
- 新增对应的 `project-blueprint-file-version.test.ts` 与 `lowcode-design-file-upload.test.ts`
  - 覆盖兼容解析、非法分段、三文件独立递增、上传参数、禁止覆盖与响应校验。

- `packages/spark-project-model/src/page/page-file.ts`
  - `PAGE_NODE_FILE_NAMES` 收敛为 `rule.json/script.js/style.css`。
  - 增加配置资源定位类型，文件目录来自蓝图 `cfg:`，不再把节点 ID 当文件夹事实。
- `packages/spark-project-model/src/page/config-page.ts`
  - 删除 `pagedata.json` 子文件模型；页面数据只经数据空间能力进入运行态。
  - 保留规则树、脚本和样式三个内存模型及独立 dirty/undo/redo。
- `packages/spark-project-model/src/io/page-content-loader.ts`
  - 读取命令携带 `customPath` 与当前文件版本；缓存键纳入版本化资源身份。
- `packages/spark-project-model/src/io/page-file-api.ts`
  - 文件保存合同改为追加一个独立版本并返回已验证的新版本指针，不再表达原地覆盖。
- `packages/spark-project-model/src/project/project-model.ts`
  - 删除 pagedata 文件投影与解析状态；配置页面数据绑定只消费数据空间。
- `packages/spark-project-model/src/project/project-workspace.ts`
  - 页面加载从选中蓝图节点解析 `cfg:` 和三段版本。
  - 单文件保存执行“上传新版本 → 正式读取接口读回 → 更新导航 `versionId`”闭环。
  - 上传成功而指针更新失败时保留未引用文件并允许幂等重试，不回退或删除后端文件。
- `packages/spark-project-model/src/project/project-types.ts` 与公共导出
  - 同步三文件投影、事件和错误类型；删除 pagedata 文件名公共面。
- `packages/spark-project-model/tests/**`
  - 更新三文件集合、版本化加载、独立保存、失败不切换指针和数据空间边界测试。

- `src/lowcode/lowcode-runtime.ts`
  - `readLowcodePageFile` 使用 `cfg:` 后的 `customPath` 与分段版本文件名。
  - 组装文件上传 gateway 和导航最小 mutation；权限不足时 fail-closed。
  - `vue:` 继续解析 Vue 资源，`cfg:` 解析配置页面，二者不互相兜底。
- `src/lowcode/data-space/**`
  - 保持 DataSpace 为页面数据唯一来源；删除任何将 `pagedata.json` 当设计或运行数据真源的消费。

- 新增 `src/views/app/dev-system/blueprint-workspace/BlueprintWorkspace.vue`
  - 提供六个工作阶段页签：功能策划、原型设计、数据规划、节点估算、开发交付、发布运行。
- 新增同目录六个最小专业工作组件
  - 功能策划：单一富文本正文，只保存 `memo`。
  - 原型设计：HtmlEdit 专业入口，结果映射 `htmlDesc`。
  - 数据规划：数据空间选择/创建入口，只保存 `conid/conType`。
  - 节点估算：只维护导航已有估算字段；任务管理仅按节点 ID 外部关联。
  - 开发交付：只展示 `rule.json/script.js/style.css`、预览和相关资产入口；不展示裸路径或版本表单。
  - 发布运行：最小导航输出入口；最终权限仍以后端运行响应为准。
- `src/views/app/dev-system/DevSystem.vue`
  - 用六阶段工作区替换当前“节点属性 + 四文件”平铺页签。
  - 移除 `pagedata.json` 图标、解析错误和保存入口。
- `src/views/app/dev-system/DevFileEditor.vue`
  - 适配三文件和独立版本保存状态；版本切换结果来自导航 `versionId`。
- `src/views/app/dev-system/useDevState.ts`、`useDevSystem.ts` 与 `composables/useDevFileEditor.ts`
  - 维护六页签独立 dirty/save 状态。
  - 每个页签显式保存；页面顶部不跨页签合并写入。
  - 文件保存只保存当前文件并切换对应版本分段。
- `tests/dev/**`、`tests/auth-nav/**`、`tests/services/**`
  - 更新三文件集合、六页签最小 UI、`cfg:` 路由、版本读取和单文件保存语义。
- `generated/dts-class-model/**`
  - 仅在类型与源码验证通过后由既有生成命令机械更新，不手工编辑。

## 技术方案

1. 先建立 `cfg:` 与三文件版本指针的纯合同：
   - 新格式为 `rule=N;script=N;style=N`。
   - 空值读取裸文件；历史单值对三文件共用；缺段仅对应文件读取裸文件。
   - 版本为非负整数；未知、重复或畸形分段拒绝读取和保存。
2. 将页面文件集合从四文件收敛为三文件，彻底删除 `pagedata.json` 的页面文件身份；DataSpace 继续作为页面数据 SSOT。
3. 让 `ProjectWorkspace` 使用选中蓝图节点的 `NavigationUrl/versionId` 创建配置资源身份，禁止从节点 ID、路由 path 或技术名推导文件夹。
4. 单文件保存只推进一个最小闭环：
   1. 读取节点最新 preimage 与后端字段权限。
   2. 计算该文件下一版本号和 `{version}__{filename}`。
   3. 以 `isReplace=false` 上传。
   4. 使用正式文本读取接口读回并做完整内容比较。
   5. 仅修改 `versionId` 对应分段，提交导航最小 Changed 行。
   6. 再次读取节点和文件，确认指针与内容一致后清除该文件 dirty。
5. 上传失败、内容读回失败或导航 mutation 失败时保持原指针与 dirty；不删除已上传的未引用文件，也不扩大为后端清理任务。
6. 六页签只提供专业入口，不展示完整导航字段表单。API 字段合同保持完整，UI 按工作阶段消费最少字段。
7. 功能策划只写 `memo`；WBS 标题继续来自 `FunName`，技术名与摘要由系统/AI管理。节点任务管理不进入蓝图字段。
8. 所有运行导航权限继续消费后端最终授权结果；AppWorks 不本地重算字段权限或菜单权限。

## 兼容性

- 破坏性变更：`PageNodeFileName` 删除 `pagedata.json`，所有枚举、编辑、测试和 AI selective-save 调用必须同步迁移。
- 历史裸文件和历史单值 `versionId` 保持可读；首次保存某文件后写成具名三段格式。
- `vue:` 现有资源保持可用；新增 `cfg:` 后不能再被 external 分支吞掉。
- 不改 `E:\lowcode-jdk17`，不新增后端依赖，不要求后端支持原地文件修改。
- 当前工作树存在大量用户未提交改动，涉及的 `project-blueprint-*`、`useDevState.ts` 和测试已有重叠；实施时必须逐文件重读并保留现有改动，不能整文件覆盖或整树回退。

## 验证计划

- 开工基线：`git status --short --branch`
- 类型检查：`pnpm run typecheck`（必须先记录基线）
- Lint：`pnpm run lint`
- lowcode API：`pnpm --filter @spark-appworks/spark-lowcode-api test`
- project model：`pnpm --filter @spark-appworks/spark-project-model test`
- DevSystem：`pnpm exec vitest run tests/dev`
- 导航：`pnpm exec vitest run tests/auth-nav`
- 页面设计与 selective save：`pnpm exec vitest run tests/services/page-design-ai-runner.test.ts tests/services/page-design-agent-run-provider.test.ts tests/services/page-data-design-agent-run-provider.test.ts`
- SSOT：`pnpm run verify:project-blueprint-ssot`
- 生成物：`pnpm run generate:class-model-surface`，然后重新运行 `pnpm run typecheck`
- 构建：`pnpm run build:fe`
- LIVE 只读：验证 `cfg:` 节点加载三个版本文件、`vue:` 节点仍走 Vue 资源、六页签只显示最小专业入口。
- LIVE 写入：默认禁止；只有用户在实施完成后再次明确授权具体项目、节点和单个文件时，才执行一次“上传新版本 + 更新版本指针”的受控验证。

## 风险项

- 当前分支落后远端 1 个提交且工作树有大量未提交改动；不得 pull、rebase、checkout、stash 或覆盖用户改动。
- 后端上传与导航 mutation 不具备跨服务事务；通过“先上传后切指针”保证旧版本始终可用，代价是可能留下未引用文件。
- `versionId` 字段长度尚需在实施前从当前元数据读回确认；若具名格式超过字段长度，必须暂停并修订编码，不得截断。
- 现有知识文件仍描述四文件模型，实施成功后需要在阶段 7 由用户确认是否更新，不能在本轮计划外提前改写。
- `pagedata.json` 同时被页面设计 Agent、预览与测试消费；删除它会跨包传播，必须按最小闭环逐层迁移，不能一次散射修改。
- 若后端 `/api/File/uploadFileByBytes` 对 `.js/.css` 的实际上传响应与源码合同不同，必须停止 LIVE 写入并回到方案修订。
