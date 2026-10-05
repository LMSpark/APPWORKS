# 项目蓝图导航文件协议研读

状态：confirmed

## 已确认目标

- 项目蓝图继续使用同一条 `Base_NavigationInfo` 记录作为节点持久事实。
- 六个页签是最小专业工作入口，不是把导航表全部字段暴露成人工表单。
- 每个页签独立保存，只提交该页签拥有的最小字段。
- 功能策划只提供一个富文本正文，写入 `memo`；`FunName` 沿用 WBS 标题，`name` 与 `description` 不要求人工重复维护。
- 节点任务管理属于项目经理侧，通过蓝图节点 ID 关联，不进入功能策划正文，也不复制蓝图 SSOT。

## 配置页面文件合同

- `pagedata.json` 已归入数据空间，不再属于配置页面文件集合。
- 配置页面只保留三个文件：`rule.json`、`script.js`、`style.css`。
- `NavigationUrl` 承载资源协议与后端文件夹路径：
  - `cfg:{customPath}` 表示配置页面及其三文件目录。
  - `vue:{resourcePath}` 表示 Vue 资源，不进入配置三文件读取器。
- 文件路径不得继续由蓝图节点 ID 或 AppWorks 自造 pageId 推断；`cfg:` 后的路径是文件定位事实。

## Git 历史证据

历史 `spark-ai-server` 在提交 `58ea25e2c` 中使用：

```text
spark-ai-server/data/pages-config/
└── {tenantId}/{projectId}/{pageId}/
    ├── rule.json
    ├── pagedata.json
    ├── script.js
    └── style.css
```

历史文件版本是文件级独立版本，命名为 `{version}__{filename}`：

```text
{pageId}/rule.json
{pageId}/1__rule.json
{pageId}/2__rule.json
```

`PageConfigService` 的版本主键为 `(tenantId, projectId, pageId, filename, version)`，证明三个文件可以拥有不同版本号。

## 当前 lowcode 后端事实

- `BaseNavigationInfo.versionId` 是字符串，可承载三文件版本指针。
- 文件管理提供 `POST /api/File/uploadFileByBytes`，接收字节正文和查询参数：
  - `customPath`
  - `appType`
  - `isReplace`
  - `newName`
- `appType=designfile` 时后端自动进入企业设计文件命名空间。
- `customPath` 指向目标文件夹，`newName` 可以使用 Git 历史的 `{version}__{filename}` 格式。
- AppWorks 当前 `LowcodeDesignApi` 只有读取能力；上传能力尚未接入。

## 已确认的新版本合同

新 `versionId` 使用具名分段格式：

```text
rule=2;script=1;style=3
```

对应读取：

```text
{customPath}/2__rule.json
{customPath}/1__script.js
{customPath}/3__style.css
```

兼容规则：

- 空 `versionId`：读取历史裸文件名。
- 历史单值（如 `1`）：三个文件均读取 `1__{filename}`。
- 新写入统一使用具名分段格式，顺序固定为 `rule;script;style`，解析不能依赖顺序。
- 缺失某一具名分段时，仅该文件读取裸文件；不得借用其他文件的版本。
- 未知分段、重复分段、非负整数以外的版本值必须 fail-fast。

## 单文件保存闭环

以保存 `script.js` 为例：

1. 从选中节点解析 `cfg:{customPath}` 与当前 `versionId`。
2. 仅递增 `script` 分段。
3. 上传为 `{nextVersion}__script.js`，`isReplace=false`，禁止覆盖已有版本。
4. 使用正式读取接口读回新文件并核对内容。
5. 读回一致后，才通过受治理的导航 mutation 更新 `versionId` 中的 `script` 指针。
6. 上传或读回失败时不切换导航指针。
7. 文件成功但导航更新失败时，新文件保持为未引用版本；重试只需重新提交同一指针，不影响当前运行版本。

## 当前 AppWorks 断链

- `PAGE_NODE_FILE_NAMES` 仍固定为四文件并包含 `pagedata.json`。
- `PageContentLoader` 与 `ProjectWorkspace` 以 `pageId` 为文件目录身份。
- `readLowcodePageFile` 使用 `${projectId}/${pageId}` 组装 `customPath`，没有消费 `NavigationUrl`。
- `lowcode-navigation.ts` 只识别小写 `vue:`；`cfg:` 会被误判为 external。
- `LowcodeProjectBlueprintRecord` 尚未暴露 `versionId`，wire 也未读取它。
- 页面文件保存网关尚未连接 lowcode 上传接口与导航版本指针更新。

## 安全边界

- `E:\lowcode-jdk17` 永久只读。
- 不执行 LIVE 上传或导航 mutation，除非进入已批准实施后的专门验证步骤并再次确认写入范围。
- 未上传成功并读回前不得更新 `versionId`。
- 不覆盖历史版本文件，不删除孤立版本，不把清理混入本任务。
