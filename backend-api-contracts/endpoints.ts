import type {
  AjaxResult, BaseCondition, BaseImportConfig, BatchJsonData,
  CanAutoSubmitAfterInput, CodeNodesList, CrudModelRequest,
  DataManagerRequest, FileInfo, FlowBackInput, FlowDesignSaveInput,
  FlowExecObjInput, GroupDataParam, JsonObject, JsonSseMessage,
  Login, MigrateTableFieldRequest, OfflineMessageVo, PageParam,
  Register, SendCodeCommand, ServerInfo, Sm2PublicKeyResult,
  SyncDataRequest, TableInput, ViewDataVo, WFMWORKFORM,
  WorkflowTestRequest,
} from "./common";

// ============================================================================
// 接口注册表基础类型
// ============================================================================

/** HTTP 方法：仅支持 GET 与 POST。 */
export type HttpMethod = "GET" | "POST";

/** 参数位置。 */
export type ParameterLocation =
  | "path"   // URL 路径占位符，例如 {dbId}
  | "query"  // URL 查询参数
  | "header" // HTTP Header
  | "body"   // JSON 或原始字节请求体
  | "form"   // 表单字段，包括 multipart 附加字段
  | "file";  // multipart 文件字段

/** 单个接口参数定义。 */
export interface ApiParameter {
  /** 参数名。 */
  name: string;
  /** 参数位置。 */
  location: ParameterLocation;
  /** 参数类型描述。 */
  type: string;
  /** 是否必填。 */
  required: boolean;
  /** 参数含义说明。 */
  description: string;
  /** 默认值。 */
  defaultValue?: unknown;
}

/**
 * 单个后端接口的完整描述。
 *
 * 泛型 `Request`、`Response` 仅用于静态类型推导，不参与运行时。
 */
export interface ApiEndpoint<Request = unknown, Response = unknown> {
  /** 接口唯一 ID（controller.action 形式）。 */
  id: string;
  /** 所属控制器。 */
  controller: string;
  /** HTTP 方法。 */
  method: HttpMethod;
  /** 接口路径，含路径占位符。 */
  path: string;
  /** 接口摘要说明。 */
  summary: string;
  /** 参数列表。 */
  parameters: readonly ApiParameter[];
  /** 请求体类型名（仅 body 参数时出现）。 */
  requestType?: string;
  /** 响应类型描述。 */
  responseType: string;
  /** 仅用于静态类型推导，不参与运行时。 */
  __request?: Request;
  /** 仅用于静态类型推导，不参与运行时。 */
  __response?: Response;
}

/** 参数构造辅助函数，缩写以保持接口定义紧凑。 */
const p = (
  name: string,
  location: ParameterLocation,
  type: string,
  required: boolean,
  description: string,
  defaultValue?: unknown,
): ApiParameter => ({ name, location, type, required, description, defaultValue });

/**
 * 后端接口完整注册表。
 *
 * 每个条目标明所属控制器、HTTP 方法、路径、参数（名称/位置/类型/必填/含义）
 * 和响应类型。响应外壳统一为 AjaxResult，但 Result 内部结构由具体业务决定，
 * 故多数标为 AjaxResult<unknown>。
 *
 * 响应类型分类：
 * - `AjaxResult<T>`：标准 JSON 响应外壳，T 为 Result 内部结构。
 * - `binary/void`：文件下载或 Excel 导出，返回二进制流。
 * - `text/event-stream`：SSE 长连接。
 * - `HTTP 200|403`：仅通过状态码表达结果，无响应体。
 * - `ResponseEntity<Resource>`：Spring 资源响应。
 *
 * 使用方式：
 * ```ts
 * const endpoint = backendApiEndpoints.find((item) => item.id === "table.syncData");
 * ```
 */
export const backendApiEndpoints = [
  // ==========================================================================
  // CodeController：代码设计与代码生成（/api/Codeing/）
  // ==========================================================================
  {
    id: "code.getCodeString",
    controller: "CodeController",
    method: "GET",
    path: "/api/Codeing/GetCodeString/{subTableNameKey}/{codeDesignId}",
    summary: "按子表键和代码设计 ID 生成代码字符串。",
    parameters: [
      p("subTableNameKey", "path", "string", true, "子表名称键。"),
      p("codeDesignId", "path", "string", true, "代码设计记录 ID。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "code.testGetCodeString",
    controller: "CodeController",
    method: "POST",
    path: "/api/Codeing/TestGetCodeString/{busTableId}",
    summary: "使用传入的代码节点设计测试生成业务表代码。",
    parameters: [
      p("busTableId", "path", "string", true, "业务表 ID。"),
      p("body", "body", "CodeNodesList", true, "代码节点列表；逐节点定义类型、编号和设计 JSON。"),
    ],
    requestType: "CodeNodesList",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<CodeNodesList, AjaxResult>,
  {
    id: "code.initDataList",
    controller: "CodeController",
    method: "GET",
    path: "/api/Codeing/CodeInitDataList",
    summary: "读取代码节点初始化数据。",
    parameters: [
      p("codeid", "query", "string", true, "代码设计 ID。"),
      p("nodeid", "query", "string", true, "节点 ID。"),
      p("date", "query", "string", true, "初始化数据日期/版本值。"),
    ],
    responseType: "AjaxResult<unknown>",
  },

  // ==========================================================================
  // LoginController：注册、登录、令牌、组织与会话（/api/LoginAuthority/）
  // ==========================================================================
  {
    id: "login.register",
    controller: "LoginController",
    method: "POST",
    path: "/api/LoginAuthority/register",
    summary: "注册企业用户。",
    parameters: [
      p("body", "body", "Register", true, "企业、账号、密码、联系方式、验证码及组织岗位信息。"),
    ],
    requestType: "Register",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<Register, AjaxResult>,
  {
    id: "login.userLoginByEnt",
    controller: "LoginController",
    method: "POST",
    path: "/api/LoginAuthority/UserLoginByEnt",
    summary: "按企业和账号密码登录。",
    parameters: [
      p("body", "body", "Login", true, "strUser、strPwd、entName 为核心登录字段。"),
    ],
    requestType: "Login",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<Login, AjaxResult>,
  {
    id: "login.userLoginWithCode",
    controller: "LoginController",
    method: "POST",
    path: "/api/LoginAuthority/UserLoginWithCode",
    summary: "使用短信或邮件验证码登录。",
    parameters: [
      p("body", "body", "SendCodeCommand", true, "账号、验证码类型、场景和验证码。"),
    ],
    requestType: "SendCodeCommand",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<SendCodeCommand, AjaxResult>,
  {
    id: "login.getUserInfo",
    controller: "LoginController",
    method: "GET",
    path: "/api/LoginAuthority/GetUserInfo",
    summary: "读取当前已登录用户信息。",
    parameters: [],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "login.logout",
    controller: "LoginController",
    method: "GET",
    path: "/api/LoginAuthority/UserLogoutByEnt",
    summary: "退出当前企业登录会话。",
    parameters: [],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "login.forceLogout",
    controller: "LoginController",
    method: "GET",
    path: "/api/LoginAuthority/ForceLogout",
    summary: "强制注销指定企业中的指定登录 ID。",
    parameters: [
      p("ent", "query", "string", true, "企业短名称/标识。"),
      p("loginId", "query", "string", true, "需要强制下线的登录 ID。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "login.orgList",
    controller: "LoginController",
    method: "GET",
    path: "/api/LoginAuthority/org/list",
    summary: "查询企业组织或指定部门下的组织数据。",
    parameters: [
      p("ent", "query", "string", true, "企业标识。"),
      p("dep", "query", "string", false, "部门 ID；省略时查询企业级组织。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "login.refresh",
    controller: "LoginController",
    method: "POST",
    path: "/api/LoginAuthority/refresh",
    summary: "使用访问令牌和刷新令牌换取新令牌。",
    parameters: [
      p("accessToken", "header", "string", true, "当前访问令牌；实际 Header 名由认证配置决定。"),
      p("refreshToken", "header", "string", true, "当前刷新令牌；实际 Header 名由认证配置决定。"),
    ],
    responseType: "AjaxResult<{token:string;refreshToken:string;expire:number;refreshExpire:number}>",
  },

  // ==========================================================================
  // MessageController：消息、离线消息与验证码（/api/message/）
  // ==========================================================================
  {
    id: "message.send",
    controller: "MessageController",
    method: "POST",
    path: "/api/message/SendMessage",
    summary: "按接收者类型发送 SSE/站内消息。",
    parameters: [
      p("body", "body", "JsonSseMessage", true, "发送者、接收范围、消息类型、标题、内容和发送方式。"),
    ],
    requestType: "JsonSseMessage",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<JsonSseMessage, AjaxResult>,
  {
    id: "message.offline",
    controller: "MessageController",
    method: "POST",
    path: "/api/message/offlineMessages",
    summary: "批量写入或处理用户离线消息。",
    parameters: [
      p("body", "body", "OfflineMessageVo[]", true, "按企业和用户分组的离线消息列表。"),
    ],
    requestType: "OfflineMessageVo[]",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<OfflineMessageVo[], AjaxResult>,
  {
    id: "message.confirm",
    controller: "MessageController",
    method: "POST",
    path: "/api/message/confirmMessages",
    summary: "批量确认指定企业的消息。",
    parameters: [
      p("entShortName", "query", "string", true, "企业短名称。"),
      p("body", "body", "string[]", true, "待确认的消息 ID 数组。"),
    ],
    requestType: "string[]",
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "message.privateCode",
    controller: "MessageController",
    method: "POST",
    path: "/api/message/code/send/private",
    summary: "登录态下发送私有验证码。",
    parameters: [
      p("body", "body", "SendCodeCommand", true, "验证码接收账号、类型和业务场景。"),
    ],
    requestType: "SendCodeCommand",
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "message.publicCode",
    controller: "MessageController",
    method: "POST",
    path: "/api/message/code/send/public",
    summary: "未登录场景发送公开验证码。",
    parameters: [
      p("body", "body", "SendCodeCommand", true, "验证码接收账号、类型和业务场景。"),
    ],
    requestType: "SendCodeCommand",
    responseType: "AjaxResult<unknown>",
  },

  // ==========================================================================
  // DataInterfaceController：QYAPI 调用、通用数据接口与语音识别（/api/dataInterface/）
  // ==========================================================================
  {
    id: "dataInterface.getApiData",
    controller: "DataInterfaceController",
    method: "POST",
    path: "/api/dataInterface/GetApiData",
    summary: "按 TableInput 数据查询协议执行接口数据查询。",
    parameters: [
      p("body", "body", "TableInput", true, "表、字段、过滤、连接、分页和树形查询参数。"),
    ],
    requestType: "TableInput",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<TableInput, AjaxResult>,
  {
    id: "dataInterface.callFormData",
    controller: "DataInterfaceController",
    method: "POST",
    path: "/api/dataInterface/callApi/FormData",
    summary: "以表单参数调用已注册的 QYAPI 提供者接口。",
    parameters: [
      p("qy_provider", "form", "string", true, "QYAPI 提供者标识。"),
      p("qy_api", "form", "string", true, "QYAPI 接口标识。"),
      p("qy_is_filter", "form", "boolean|string", true, "是否应用过滤。"),
      p("*", "form", "unknown", false, "透传给目标接口的任意附加表单参数。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "dataInterface.callBody",
    controller: "DataInterfaceController",
    method: "POST",
    path: "/api/dataInterface/callApi/Body",
    summary: "以 JSON Body 调用已注册的 QYAPI 接口。",
    parameters: [
      p("qy_provider", "query", "string", true, "QYAPI 提供者标识。"),
      p("qy_api", "query", "string", true, "QYAPI 接口标识。"),
      p("body", "body", "Record<string,unknown>", true, "完整透传给目标接口的 JSON 对象。"),
    ],
    requestType: "JsonObject",
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "dataInterface.qyCallApi",
    controller: "DataInterfaceController",
    method: "POST",
    path: "/api/dataInterface/qyCallApi",
    summary: "带过滤开关调用 QYAPI 接口。",
    parameters: [
      p("qy_provider", "query", "string", true, "QYAPI 提供者标识。"),
      p("qy_api", "query", "string", true, "QYAPI 接口标识。"),
      p("qy_is_filter", "query", "boolean|string", true, "是否应用过滤。"),
      p("body", "body", "Record<string,unknown>", true, "目标接口业务参数。"),
    ],
    requestType: "JsonObject",
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "dataInterface.speechToText",
    controller: "DataInterfaceController",
    method: "POST",
    path: "/api/dataInterface/SpeechToText",
    summary: "上传音频并转换为文本。",
    parameters: [
      p("file", "file", "MultipartFile", true, "待识别音频文件。"),
    ],
    responseType: "AjaxResult<unknown>",
  },

  // ==========================================================================
  // BasicFunController：通用表查询、聚合、取值与批量 CRUD（/api/DataOperation）
  // ==========================================================================
  {
    id: "data.getTableData",
    controller: "BasicFunController",
    method: "POST",
    path: "/api/DataOperation/{Name}/GetTableData",
    summary: "按数据源描述查询表格/树形数据。",
    parameters: [
      p("Name", "path", "string", true, "数据操作或业务表名称。"),
      p("condition", "query", "string", false, "附加条件文本。"),
      p("body", "body", "DataManagerRequest", true, "数据源、字段、分页、排序、过滤和树字段定义。"),
    ],
    requestType: "DataManagerRequest",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<DataManagerRequest, AjaxResult>,
  {
    id: "data.getGroupData",
    controller: "BasicFunController",
    method: "POST",
    path: "/api/DataOperation/{Name}/GetGroupData",
    summary: "按字段分组并执行聚合统计。",
    parameters: [
      p("Name", "path", "string", true, "数据操作或业务表名称。"),
      p("body", "body", "GroupDataParam", true, "分组字段、值字段、聚合函数和结果别名。"),
    ],
    requestType: "GroupDataParam",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<GroupDataParam, AjaxResult>,
  {
    id: "data.getValue",
    controller: "BasicFunController",
    method: "POST",
    path: "/api/DataOperation/GetValue",
    summary: "根据表、字段、目标值和条件读取单值。",
    parameters: [
      p("table", "query", "string", true, "目标表。"),
      p("field", "query", "string", true, "目标字段。"),
      p("value", "query", "string", true, "用于取值的输入值。"),
      p("body", "body", "BaseCondition", true, "附加过滤条件树。"),
    ],
    requestType: "BaseCondition",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<BaseCondition, AjaxResult>,
  {
    id: "data.batchCrud",
    controller: "BasicFunController",
    method: "POST",
    path: "/api/DataOperation/BatchTableOperateRequestByCRUD",
    summary: "按表批量执行新增、修改、删除。",
    parameters: [
      p("body", "body", "CrudModelRequest[]", true, "每项包含表名及 added/changed/deleted 行数组。"),
    ],
    requestType: "CrudModelRequest[]",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<CrudModelRequest[], AjaxResult>,
  // 以下四个接口共用 TableInput 请求体，按 action 区分语义：
  //   GetBaseData（基础数据查询）/ GetData（通用数据查询）
  //   GetSelfRefData（自引用层级查询）/ CallProcedure（存储过程调用）
  ...(["GetBaseData", "GetData", "GetSelfRefData", "CallProcedure"] as const).map((action) => ({
    id: `data.${action}`,
    controller: "BasicFunController",
    method: "POST" as const,
    path: `/api/DataOperation/${action}`,
    summary:
      action === "GetBaseData"
        ? "执行基础数据查询。"
        : action === "GetData"
          ? "执行通用数据查询。"
          : action === "GetSelfRefData"
            ? "查询自引用层级数据。"
            : "按 TableInput 调用存储过程。",
    parameters: [
      p("body", "body", "TableInput", true, "表/过程、输入参数、字段、过滤和分页定义。"),
    ],
    requestType: "TableInput",
    responseType: "AjaxResult<unknown>",
  })),

  // ==========================================================================
  // FlowController：流程运行、提交、撤回、退回与执行人（/api/Flow）
  // ==========================================================================
  {
    id: "flow.saveRelation",
    controller: "FlowController",
    method: "POST",
    path: "/api/Flow/SaveFlowAndFormRelation/{flowId}",
    summary: "保存流程与表单之间的关联。",
    parameters: [
      p("flowId", "path", "string", true, "流程 ID。"),
      p("body", "body", "WFMWORKFORM[]", true, "流程表单、业务表、标题字段、URL 和尺寸定义。"),
    ],
    requestType: "WFMWORKFORM[]",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<WFMWORKFORM[], AjaxResult>,
  {
    id: "flow.submitOrStart",
    controller: "FlowController",
    method: "POST",
    path: "/api/Flow/FlowSubmitOrStart",
    summary: "启动新流程或提交当前流程步骤。",
    parameters: [
      p("body", "body", "FlowExecObjInput", true, "流程、表单、业务行、当前步骤、下一节点及处理意见。"),
    ],
    requestType: "FlowExecObjInput",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<FlowExecObjInput, AjaxResult>,
  // 撤回与强制撤回共用相同 query 参数。
  ...(["FlowRevoke", "FlowForceRevoke"] as const).map((action) => ({
    id: `flow.${action}`,
    controller: "FlowController",
    method: "POST" as const,
    path: `/api/Flow/${action}`,
    summary: action === "FlowRevoke" ? "撤回当前流程步骤。" : "强制撤回当前流程步骤。",
    parameters: [
      p("wfid", "query", "string", true, "流程实例 ID。"),
      p("curStepID", "query", "string", true, "当前步骤 ID。"),
    ],
    responseType: "AjaxResult<unknown>",
  })),
  // 退回、强制退回、退回发起人共用 FlowBackInput 请求体。
  ...(["FlowBack", "FlowForceBack", "FlowToCreator"] as const).map((action) => ({
    id: `flow.${action}`,
    controller: "FlowController",
    method: "POST" as const,
    path: `/api/Flow/${action}`,
    summary:
      action === "FlowBack"
        ? "将流程退回指定节点。"
        : action === "FlowForceBack"
          ? "强制将流程退回指定节点。"
          : "将流程退回发起人。",
    parameters: [
      p("body", "body", "FlowBackInput", true, "flowObjId、当前步骤、目标节点和处理意见。"),
    ],
    requestType: "FlowBackInput",
    responseType: "AjaxResult<unknown>",
  })),
  {
    id: "flow.addReceiveUser",
    controller: "FlowController",
    method: "POST",
    path: "/api/Flow/FlowAddReceiveUser",
    summary: "给流程步骤追加接收/执行用户。",
    parameters: [
      p("wfId", "query", "string", true, "流程实例 ID。"),
      p("stepId", "query", "string", true, "步骤 ID。"),
      p("body", "body", "string[]", true, "新增用户 ID 数组。"),
    ],
    requestType: "string[]",
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "flow.refreshWaiting",
    controller: "FlowController",
    method: "GET",
    path: "/api/Flow/RefreshWaiting",
    summary: "刷新指定流程实例的待办状态。",
    parameters: [
      p("wfId", "query", "string", true, "流程实例 ID。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "flow.optionUsers",
    controller: "FlowController",
    method: "GET",
    path: "/api/Flow/GetOptionButtonHandleUserOptionData",
    summary: "获取流程操作按钮可选处理人数据。",
    parameters: [
      p("modelId", "query", "string", false, "流程模型 ID。"),
      p("stepId", "query", "string", false, "步骤 ID。"),
      p("busRowId", "query", "string", false, "业务数据行 ID。"),
      p("formid", "query", "string", false, "表单 ID。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "flow.exeUsers",
    controller: "FlowController",
    method: "GET",
    path: "/api/Flow/GetExeUsers",
    summary: "获取流程节点的可执行用户。",
    parameters: [
      p("wfId", "query", "string", true, "流程实例 ID。"),
      p("upNodeId", "query", "string", true, "上游节点 ID。"),
      p("nodeId", "query", "string", true, "目标节点 ID。"),
      p("isAdd", "query", "boolean", false, "是否为追加用户场景。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "flow.canAutoSubmitAfter",
    controller: "FlowController",
    method: "POST",
    path: "/api/Flow/CanAutoSubmitAfter",
    summary: "判断当前步骤之后是否允许自动提交。",
    parameters: [
      p("body", "body", "CanAutoSubmitAfterInput", true, "当前步骤 ID。"),
    ],
    requestType: "CanAutoSubmitAfterInput",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<CanAutoSubmitAfterInput, AjaxResult>,

  // ==========================================================================
  // FormDesignController：导航菜单与权限菜单（/api/FormDesign/）
  // ==========================================================================
  {
    id: "form.navigationMenus",
    controller: "FormDesignController",
    method: "GET",
    path: "/api/FormDesign/GetNavigationMenus/{sysId}/{beginNodeId}",
    summary: "从指定起始节点读取系统导航菜单树。",
    parameters: [
      p("sysId", "path", "string", true, "系统 ID。"),
      p("beginNodeId", "path", "string", true, "菜单树起始节点 ID。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "form.permissionMenus",
    controller: "FormDesignController",
    method: "POST",
    path: "/api/FormDesign/menus/withPermissions/{sysId}/{userId}",
    summary: "分页读取指定用户在系统内有权限的菜单。",
    parameters: [
      p("sysId", "path", "string", true, "系统 ID。"),
      p("userId", "path", "string", true, "用户 ID。"),
      p("body", "body", "PageParam", true, "分页页码与每页条数。"),
    ],
    requestType: "PageParam",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<PageParam, AjaxResult>,

  // ==========================================================================
  // WorkflowController：工作流执行与测试（/api/Workflow/）
  // ==========================================================================
  {
    id: "workflow.run",
    controller: "WorkflowController",
    method: "POST",
    path: "/api/Workflow/Run/{workflowId}",
    summary: "使用多组输入参数运行工作流。",
    parameters: [
      p("workflowId", "path", "string", true, "工作流定义 ID。"),
      p("body", "body", "Array<Record<string,unknown>>", true, "工作流输入记录数组。"),
    ],
    requestType: "JsonObject[]",
    responseType: "AjaxResult<unknown>",
  },
  // 单节点测试与完整工作流测试共用 WorkflowTestRequest 请求体。
  ...(["runSingleNodeTest", "runWorkflowTest"] as const).map((action) => ({
    id: `workflow.${action}`,
    controller: "WorkflowController",
    method: "POST" as const,
    path: `/api/Workflow/${action}`,
    summary:
      action === "runSingleNodeTest" ? "测试运行工作流中的单个节点。" : "测试运行完整工作流。",
    parameters: [
      p("body", "body", "WorkflowTestRequest", true, "工作流、节点、节点输入和启动参数。"),
    ],
    requestType: "WorkflowTestRequest",
    responseType: "AjaxResult<unknown>",
  })),

  // ==========================================================================
  // DbInfoController：数据库服务器和数据库注册（/api/Db/）
  // ==========================================================================
  {
    id: "db.testConnection",
    controller: "DbInfoController",
    method: "POST",
    path: "/api/Db/testConnection",
    summary: "测试数据库服务器连接参数。",
    parameters: [
      p("body", "body", "ServerInfo", true, "数据库类型、地址、端口和凭据。"),
    ],
    requestType: "ServerInfo",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<ServerInfo, AjaxResult>,
  {
    id: "db.registerServer",
    controller: "DbInfoController",
    method: "POST",
    path: "/api/Db/registerServer",
    summary: "注册数据库服务器。",
    parameters: [
      p("body", "body", "ServerInfo", true, "服务器连接和描述信息。"),
    ],
    requestType: "ServerInfo",
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "db.registerDb",
    controller: "DbInfoController",
    method: "POST",
    path: "/api/Db/registerDB/{serverId}",
    summary: "在服务器下批量注册数据库。",
    parameters: [
      p("serverId", "path", "string", true, "已注册服务器 ID。"),
      p("body", "body", "string[]", true, "数据库名称数组。"),
    ],
    requestType: "string[]",
    responseType: "AjaxResult<unknown>",
  },
  // 查询未注册的数据库 / 未注册的表，路径占位符不同。
  ...(["getUnregisteredDb", "getUnregisteredTable"] as const).map((action) => ({
    id: `db.${action}`,
    controller: "DbInfoController",
    method: "GET" as const,
    path:
      action === "getUnregisteredDb"
        ? "/api/Db/getUnregisteredDb/{serverId}"
        : "/api/Db/getUnregisteredTable/{dbId}",
    summary:
      action === "getUnregisteredDb" ? "获取服务器下尚未注册的数据库。" : "获取数据库下尚未注册的数据表。",
    parameters: [
      p(
        action === "getUnregisteredDb" ? "serverId" : "dbId",
        "path",
        "string",
        true,
        action === "getUnregisteredDb" ? "服务器 ID。" : "数据库 ID。",
      ),
    ],
    responseType: "AjaxResult<unknown>",
  })),

  // ==========================================================================
  // TableFieldController：表元数据、数据同步与字段迁移（/api/Table/）
  // ==========================================================================
  {
    id: "table.defaultField",
    controller: "TableFieldController",
    method: "POST",
    path: "/api/Table/defaultField/{db}",
    summary: "读取数据库或指定表的默认字段定义。",
    parameters: [
      p("db", "path", "string", true, "数据库标识。"),
      p("table", "query", "string", false, "表名；省略时按数据库处理。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "table.syncMetadata",
    controller: "TableFieldController",
    method: "GET",
    path: "/api/Table/SyncMetaData/{db}/{table}",
    summary: "同步指定数据库表的元数据。",
    parameters: [
      p("db", "path", "string", true, "数据库标识。"),
      p("table", "path", "string", true, "数据表名称。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "table.syncData",
    controller: "TableFieldController",
    method: "POST",
    path: "/api/Table/SyncData",
    summary: "将源数据库表数据同步到目标数据库表。",
    parameters: [
      p("body", "body", "SyncDataRequest", true, "source_db/source_table/target_db/target_table。"),
    ],
    requestType: "SyncDataRequest",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<SyncDataRequest, AjaxResult>,
  {
    id: "table.registerTable",
    controller: "TableFieldController",
    method: "POST",
    path: "/api/Table/registerTable/{dbId}",
    summary: "批量注册数据库中的表及其元数据。",
    parameters: [
      p("dbId", "path", "string", true, "数据库 ID。"),
      p("body", "body", "Record<string,unknown>[]", true, "后端未声明专用 DTO 的表描述对象数组。"),
    ],
    requestType: "JsonObject[]",
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "table.migrateField",
    controller: "TableFieldController",
    method: "POST",
    path: "/api/Table/migrateTableField",
    summary: "按迁移规则批量生成或迁移表字段值。",
    parameters: [
      p("body", "body", "MigrateTableFieldRequest", true, "数据库、表、字段、规则和批大小。"),
    ],
    requestType: "MigrateTableFieldRequest",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<MigrateTableFieldRequest, AjaxResult>,

  // ==========================================================================
  // ViewController：数据库视图注册（/api/View）
  // ==========================================================================
  {
    id: "view.unregistered",
    controller: "ViewController",
    method: "GET",
    path: "/api/View/getUnregisteredView/{dbId}",
    summary: "获取数据库中尚未注册的视图。",
    parameters: [
      p("dbId", "path", "string", true, "数据库 ID。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "view.register",
    controller: "ViewController",
    method: "POST",
    path: "/api/View/registerView/{dbId}",
    summary: "批量注册数据库视图。",
    parameters: [
      p("dbId", "path", "string", true, "数据库 ID。"),
      p("body", "body", "Record<string,unknown>[]", true, "后端未声明专用 DTO 的视图描述对象数组。"),
    ],
    requestType: "JsonObject[]",
    responseType: "AjaxResult<unknown>",
  },

  // ==========================================================================
  // ViewDataController：视图定义和视图数据（/api/ViewData/）
  // ==========================================================================
  {
    id: "viewData.getView",
    controller: "ViewDataController",
    method: "POST",
    path: "/api/ViewData/GetView",
    summary: "按视图 ID 读取视图定义。",
    parameters: [
      p("viewId", "query", "string", true, "视图 ID。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "viewData.saveView",
    controller: "ViewDataController",
    method: "POST",
    path: "/api/ViewData/SaveView",
    summary: "保存视图数据或设计内容。",
    parameters: [
      p("body", "body", "ViewDataVo", true, "视图 ID 和数据内容。"),
    ],
    requestType: "ViewDataVo",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<ViewDataVo, AjaxResult>,
  {
    id: "viewData.getData",
    controller: "ViewDataController",
    method: "POST",
    path: "/api/ViewData/GetViewData",
    summary: "按 TableInput 查询视图数据。",
    parameters: [
      p("body", "body", "TableInput", true, "视图对应的表、字段、过滤和分页。"),
    ],
    requestType: "TableInput",
    responseType: "AjaxResult<unknown>",
  },

  // ==========================================================================
  // JsonDataController：JSON 数据增删改查和结构转换（/api/JsonData/）
  // ==========================================================================
  {
    id: "jsonData.getData",
    controller: "JsonDataController",
    method: "POST",
    path: "/api/JsonData/GetJsonData",
    summary: "按 TableInput 查询 JSON 数据。",
    parameters: [
      p("body", "body", "TableInput", true, "JSON 数据源查询描述。"),
    ],
    requestType: "TableInput",
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "jsonData.getJson",
    controller: "JsonDataController",
    method: "POST",
    path: "/api/JsonData/GetJson",
    summary: "按 JSON 记录 ID 读取 JSON。",
    parameters: [
      p("jsonId", "query", "string", true, "JSON 记录 ID。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "jsonData.batch",
    controller: "JsonDataController",
    method: "POST",
    path: "/api/JsonData/BatchData",
    summary: "批量新增、修改、删除命名 JSON 数据。",
    parameters: [
      p("body", "body", "BatchJsonData", true, "数据集名称及三类变更数组。"),
    ],
    requestType: "BatchJsonData",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<BatchJsonData, AjaxResult>,
  // 新增/修改/删除/转数组四个接口共用动态 JSON 对象请求体。
  ...(["AddJsonData", "EditJsonData", "DelJsonData", "JsonToArray"] as const).map((action) => ({
    id: `jsonData.${action}`,
    controller: "JsonDataController",
    method: "POST" as const,
    path: `/api/JsonData/${action}`,
    summary:
      action === "AddJsonData"
        ? "新增 JSON 数据。"
        : action === "EditJsonData"
          ? "修改 JSON 数据。"
          : action === "DelJsonData"
            ? "删除 JSON 数据。"
            : "将 JSON 对象转换为数组结构。",
    parameters: [
      p("body", "body", "Record<string,unknown>", true, "后端使用动态 Map 接收的 JSON 对象。"),
    ],
    requestType: "JsonObject",
    responseType: "AjaxResult<unknown>",
  })),
  {
    id: "jsonData.arrayToJson",
    controller: "JsonDataController",
    method: "POST",
    path: "/api/JsonData/ArrayToJson",
    summary: "将对象数组转换为 JSON 结构。",
    parameters: [
      p("body", "body", "Record<string,unknown>[]", true, "动态 JSON 对象数组。"),
    ],
    requestType: "JsonObject[]",
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "jsonData.save",
    controller: "JsonDataController",
    method: "POST",
    path: "/api/JsonData/SaveJsonData",
    summary: "覆盖保存指定 ID 的 JSON 数据数组。",
    parameters: [
      p("jsonId", "query", "string", true, "JSON 记录 ID。"),
      p("body", "body", "Record<string,unknown>[]", true, "待保存的 JSON 对象数组。"),
    ],
    requestType: "JsonObject[]",
    responseType: "AjaxResult<unknown>",
  },

  // ==========================================================================
  // UserController：验证码场景与用户名检查（/api/User/）
  // ==========================================================================
  // 登录态与未登录态验证码业务场景，共用 SendCodeCommand 请求体。
  ...(["codeSceneAction", "codeSceneActionNotLogin"] as const).map((action) => ({
    id: `user.${action}`,
    controller: "UserController",
    method: "POST" as const,
    path: `/api/User/${action}`,
    summary:
      action === "codeSceneAction" ? "登录态下执行验证码业务场景。" : "未登录状态执行验证码业务场景。",
    parameters: [
      p("body", "body", "SendCodeCommand", true, "验证码类型、账号、场景、验证码及扩展验证码。"),
    ],
    requestType: "SendCodeCommand",
    responseType: "AjaxResult<unknown>",
  })),
  {
    id: "user.checkUsername",
    controller: "UserController",
    method: "GET",
    path: "/api/User/check_username",
    summary: "检查企业内用户名是否可用或存在。",
    parameters: [
      p("ent", "query", "string", true, "企业标识。"),
      p("username", "query", "string", true, "待检查用户名。"),
    ],
    responseType: "AjaxResult<unknown>",
  },

  // ==========================================================================
  // FileController：文件、流程设计和系统数据初始化（/api/File）
  // ==========================================================================
  {
    id: "file.saveJson",
    controller: "FileController",
    method: "POST",
    path: "/api/File/SaveJson/{Data}/{formkey}",
    summary: "将路径参数中的数据按表单键保存为 JSON。",
    parameters: [
      p("Data", "path", "string", true, "待保存的字符串化数据。"),
      p("formkey", "path", "string", true, "表单键。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "file.queryJson",
    controller: "FileController",
    method: "POST",
    path: "/api/File/QueryJson/{formkey}",
    summary: "按表单键查询已保存 JSON。",
    parameters: [
      p("formkey", "path", "string", true, "表单键。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  // 下载/转换/读取文本/字符串上传四个接口共用 FileInfo 请求体，响应类型不同。
  ...(
    [
      ["DownFile", "按 FileInfo 下载文件。", "binary/void"],
      ["ConvertFile", "转换文件格式并返回转换后的资源。", "ResponseEntity<Resource>"],
      ["content/text", "读取文件文本内容。", "AjaxResult<string>"],
      ["uploadFileByStr", "使用 FileInfo 中的字符串内容上传文件。", "AjaxResult<unknown>"],
    ] as const
  ).map(([action, summary, responseType]) => ({
    id: `file.${action.replace("/", ".")}`,
    controller: "FileController",
    method: "POST" as const,
    path: `/api/File/${action}`,
    summary,
    parameters: [
      p("body", "body", "FileInfo", true, "文件路径、名称、应用类型、覆盖选项及内容/转换类型。"),
    ],
    requestType: "FileInfo",
    responseType,
  })),
  {
    id: "file.upload",
    controller: "FileController",
    method: "POST",
    path: "/api/File/UploadFile",
    summary: "上传一个或多个 multipart 文件并接受自定义请求参数。",
    parameters: [
      p("files", "file", "MultipartFile[]", true, "一个或多个上传文件；实际字段名由调用端表单决定。"),
      p("*", "form", "string", false, "customPath、appType、isReplace、newName 等自定义参数。"),
    ],
    responseType: "AjaxResult<unknown>|Object",
  },
  {
    id: "file.uploadBytes",
    controller: "FileController",
    method: "POST",
    path: "/api/File/uploadFileByBytes",
    summary: "直接上传原始字节作为文件。",
    parameters: [
      p("body", "body", "byte[]", true, "文件原始字节。"),
      p("customPath", "query", "string", true, "目标自定义目录。"),
      p("appType", "query", "string", true, "应用/存储类型。"),
      p("isReplace", "query", "boolean", true, "同名文件是否覆盖。"),
      p("newName", "query", "string", true, "保存后的文件名。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "file.uploadUrl",
    controller: "FileController",
    method: "POST",
    path: "/api/File/uploadFileByUrl",
    summary: "从远程 URL 拉取文件并保存。",
    parameters: [
      p("fileUrl", "form", "string", true, "远程文件 URL。"),
      p("customPath", "form", "string", false, "目标自定义目录。"),
      p("appType", "form", "string", false, "应用/存储类型。"),
      p("isReplace", "form", "boolean", false, "同名文件是否覆盖。"),
      p("newName", "form", "string", false, "保存后的文件名。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "file.lastModified",
    controller: "FileController",
    method: "POST",
    path: "/api/File/lastModifiedTime",
    summary: "读取文件 URL 对应资源的最后修改时间。",
    parameters: [
      p("fileUrl", "query", "string", true, "目标文件 URL。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "file.saveFile",
    controller: "FileController",
    method: "POST",
    path: "/api/File/saveFile",
    summary: "将 multipart 文件保存到指定 URL/路径。",
    parameters: [
      p("file", "file", "MultipartFile", true, "上传文件。"),
      p("url", "form", "string", true, "目标保存 URL/路径。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "file.list",
    controller: "FileController",
    method: "POST",
    path: "/api/File/list",
    summary: "列出指定应用目录下的文件。",
    parameters: [
      p(
        "body",
        "body",
        "{folderPath:string;appType:string}",
        true,
        "folderPath 为目录，appType 为存储应用类型。",
      ),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "file.remove",
    controller: "FileController",
    method: "POST",
    path: "/api/File/RemoveFile",
    summary: "删除指定应用目录中的文件。",
    parameters: [
      p("customPath", "form", "string", true, "文件所在目录。"),
      p("fileName", "form", "string", true, "文件名。"),
      p("appType", "form", "string", true, "应用/存储类型。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "file.exportDesignDoc",
    controller: "FileController",
    method: "GET",
    path: "/api/File/exportDesignDoc",
    summary: "导出系统设计文档。",
    parameters: [
      p("sysId", "query", "string", true, "系统 ID。"),
      p("level", "query", "number", false, "导出层级。"),
      p("isText", "query", "boolean", false, "是否包含文本输出。", true),
      p("isHtml", "query", "boolean", false, "是否包含 HTML 输出。", true),
    ],
    responseType: "binary/void",
  },
  {
    id: "file.auth",
    controller: "FileController",
    method: "GET",
    path: "/api/File/auth",
    summary: "校验反向代理原始文件 URI 的访问权限。",
    parameters: [
      p("X-Original-URI", "header", "string", true, "反向代理传入的原始访问 URI。"),
    ],
    responseType: "HTTP 200|403 (empty body)",
  },
  {
    id: "file.getFlowDesign",
    controller: "FileController",
    method: "GET",
    path: "/api/File/GetFlowDesignInfo/{flowModId}",
    summary: "读取流程模型的设计信息。",
    parameters: [
      p("flowModId", "path", "string", true, "流程模型 ID。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "file.saveFlowDesign",
    controller: "FileController",
    method: "POST",
    path: "/api/File/SaveFlowDesignInfo",
    summary: "保存流程画布、图片、节点、连线和功能节点关系。",
    parameters: [
      p("body", "body", "FlowDesignSaveInput", true, "完整流程设计定义。"),
    ],
    requestType: "FlowDesignSaveInput",
    responseType: "AjaxResult<unknown>",
  } satisfies ApiEndpoint<FlowDesignSaveInput, AjaxResult>,
  {
    id: "file.initSystemData",
    controller: "FileController",
    method: "POST",
    path: "/api/File/initSystemData",
    summary: "使用动态参数初始化系统数据。",
    parameters: [
      p("body", "body", "Record<string,unknown>", true, "控制器以 Map 接收的初始化参数。"),
    ],
    requestType: "JsonObject",
    responseType: "AjaxResult<unknown>",
  },

  // ==========================================================================
  // SheetDataController：Excel 导入导出（/api/File/）
  // ==========================================================================
  {
    id: "sheet.importExcelData",
    controller: "SheetDataController",
    method: "POST",
    path: "/api/File/importExcelData",
    summary: "按工作表配置导入 Excel 数据。",
    parameters: [
      p("upCtrl_Input", "file", "MultipartFile", true, "Excel 文件。"),
      p("sheetConfigs", "form", "string", true, "序列化后的工作表导入配置。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "sheet.exportExcelData",
    controller: "SheetDataController",
    method: "POST",
    path: "/api/File/ExportExcelData",
    summary: "按导出配置生成 Excel 文件。",
    parameters: [
      p("fileName", "query", "string", true, "导出文件名。"),
      p("body", "body", "BaseImportConfig[]", true, "工作表、表字段、过滤、排序和导出数据配置。"),
    ],
    requestType: "BaseImportConfig[]",
    responseType: "binary/void",
  } satisfies ApiEndpoint<BaseImportConfig[], unknown>,
  {
    id: "sheet.importExcel",
    controller: "SheetDataController",
    method: "POST",
    path: "/api/File/importExcel",
    summary: "按编码、参数和值配置导入 Excel。",
    parameters: [
      p("upCtrl_Input", "file", "MultipartFile", true, "Excel 文件。"),
      p("encodingId", "form", "string", true, "导入编码/方案 ID。"),
      p("params", "form", "string", true, "序列化导入参数。"),
      p("values", "form", "string", true, "序列化导入值。"),
    ],
    responseType: "AjaxResult<unknown>",
  },
  {
    id: "sheet.exportExcel",
    controller: "SheetDataController",
    method: "POST",
    path: "/api/File/ExportExcel",
    summary: "按编码方案和参数导出 Excel。",
    parameters: [
      p("fileName", "query", "string", true, "导出文件名。"),
      p("encodingId", "query", "string", true, "导出编码/方案 ID。"),
      p("params", "query", "string", true, "序列化导出参数。"),
    ],
    responseType: "binary/void",
  },

  // ==========================================================================
  // SseController：SSE 连接、统计与踢出（/api/sse）
  // ==========================================================================
  // 登录与匿名 SSE 长连接。
  ...(["connect", "anonymousConnect"] as const).map((action) => ({
    id: `sse.${action}`,
    controller: "SseController",
    method: "GET" as const,
    path: `/api/sse/${action}`,
    summary: action === "connect" ? "建立登录用户 SSE 长连接。" : "建立匿名 SSE 长连接。",
    parameters: [
      p("scope", "query", "string", false, "连接作用域，用于隔离消息范围。"),
    ],
    responseType: "text/event-stream",
  })),
  // SSE 在线连接统计与列表。
  ...(
    ["onlineCount", "allConnections", "anonymousConnections", "anonymousCount"] as const
  ).map((action) => ({
    id: `sse.${action}`,
    controller: "SseController",
    method: "GET" as const,
    path: `/api/sse/${action}`,
    summary:
      action === "onlineCount"
        ? "获取登录连接在线数量。"
        : action === "allConnections"
          ? "获取所有登录连接。"
          : action === "anonymousConnections"
            ? "获取所有匿名连接。"
            : "获取匿名连接数量。",
    parameters: [],
    responseType: "AjaxResult<unknown>",
  })),
  {
    id: "sse.kick",
    controller: "SseController",
    method: "POST",
    path: "/api/sse/kick",
    summary: "踢下指定企业用户的 SSE 连接。",
    parameters: [
      p("entShortName", "query", "string", true, "企业短名称。"),
      p("rowId", "query", "string", true, "用户或连接关联行 ID。"),
    ],
    responseType: "AjaxResult<unknown>",
  },

  // ==========================================================================
  // Sm2Controller：SM2 临时公钥协商（/api/sm2）
  // ==========================================================================
  {
    id: "sm2.publicKey",
    controller: "Sm2Controller",
    method: "POST",
    path: "/api/sm2/public-key",
    summary: "生成临时 SM2 公钥协商结果。",
    parameters: [
      p("tempKey32", "query", "string(base64)", false, "可选 32 字节临时密钥的 Base64 文本。"),
    ],
    responseType: "AjaxResult<Sm2PublicKeyResult>",
  } satisfies ApiEndpoint<undefined, AjaxResult<Sm2PublicKeyResult>>,
] as const;

/** 后端接口注册表条目类型。 */
export type BackendApiEndpoint = (typeof backendApiEndpoints)[number];
/** 后端接口 ID 联合类型。 */
export type BackendApiId = BackendApiEndpoint["id"];
