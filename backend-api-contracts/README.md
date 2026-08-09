# lowcode-jdk17 后端 API 契约

本目录根据 `E:\lowcode-jdk17` 的 Controller、请求 DTO、枚举和 Jackson
字段定义整理，目标是让 `apps/metadata` 能直接消费可靠的 TypeScript
出入参契约。

## 文件

| 文件 | 说明 |
| --- | --- |
| `common.ts` | 后端公共请求体、响应包、枚举、流程、数据查询、文件和 Excel DTO。 |
| `endpoints.ts` | 完整接口注册表；每个参数都标明名称、位置、类型、必填性和含义。 |
| `api-metadata.json` | 机器可读的控制器索引、序列化规则和契约入口。 |
| `index.ts` | 统一导出。 |

## 参数位置

| location | 含义 |
| --- | --- |
| `path` | URL 路径占位符，例如 `{dbId}` |
| `query` | URL 查询参数 |
| `header` | HTTP Header |
| `body` | JSON 或原始字节请求体 |
| `form` | 表单字段，包括 multipart 附加字段 |
| `file` | multipart 文件字段 |

## 必须保留的后端原始字段

- 通用响应不是常见小写字段，而是 `Code`、`Message`、`Result`、`Type`、`Extras`、`Time`。
- `FlowBackInput` 请求字段为 `flowObjId`。
- `SyncDataRequest` 使用 `source_db`、`source_table`、`target_db`、`target_table`。
- `CodeNodesList` 请求字段为 `codeNodesList`。
- `TableInput`、`TableParam`、`FieldParam` 中同时存在大写开头字段和小写字段，调用时不可自行统一大小写。

## 返回值说明

后端 Controller 没有为大量业务结果声明更细的泛型，因此这些接口标为
`AjaxResult<unknown>`。这表示响应外壳已确定，但 `Result` 的运行时结构由
具体数据、流程或 QYAPI 配置决定。文件下载、Excel 导出使用二进制响应；
SSE 连接使用 `text/event-stream`；文件鉴权仅返回 HTTP 200 或 403。

接口注册表可以直接用于文档生成、请求构造器或 Mock：

```ts
import { backendApiEndpoints } from "./backend-api-contracts";

const endpoint = backendApiEndpoints.find(
  (item) => item.id === "table.syncData",
);
```

## 控制器索引

| 控制器 | basePath | 用途 |
| --- | --- | --- |
| CodeController | `/api/Codeing/` | 代码设计与代码生成 |
| LoginController | `/api/LoginAuthority/` | 注册、登录、令牌、组织与会话 |
| MessageController | `/api/message/` | 消息、离线消息与验证码 |
| DataInterfaceController | `/api/dataInterface/` | QYAPI 调用、通用数据接口与语音识别 |
| BasicFunController | `/api/DataOperation` | 通用表查询、聚合、取值与批量 CRUD |
| FlowController | `/api/Flow` | 流程运行、提交、撤回、退回与执行人 |
| FormDesignController | `/api/FormDesign/` | 导航菜单与权限菜单 |
| WorkflowController | `/api/Workflow/` | 工作流执行与测试 |
| DbInfoController | `/api/Db/` | 数据库服务器和数据库注册 |
| TableFieldController | `/api/Table/` | 表元数据、数据同步与字段迁移 |
| ViewController | `/api/View` | 数据库视图注册 |
| ViewDataController | `/api/ViewData/` | 视图定义和视图数据 |
| JsonDataController | `/api/JsonData/` | JSON 数据增删改查和结构转换 |
| UserController | `/api/User/` | 验证码场景与用户名检查 |
| FileController | `/api/File` | 文件、流程设计和系统数据初始化 |
| SheetDataController | `/api/File/` | Excel 导入导出 |
| SseController | `/api/sse` | SSE 连接、统计与踢出 |
| Sm2Controller | `/api/sm2` | SM2 临时公钥协商 |
