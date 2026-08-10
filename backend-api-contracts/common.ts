/**
 * lowcode-jdk17 后端原始 JSON 契约 —— 公共类型定义。
 *
 * 本文件汇总后端各控制器共用的请求体、响应外壳、枚举与流程相关 DTO，
 * 供 `endpoints.ts` 中的接口注册表按需引用。
 *
 * 对应控制器范围：LoginController、MessageController、DataInterfaceController、
 * BasicFunController、FlowController、DbInfoController、ViewController、
 * ViewDataController、JsonDataController、FileController、SheetDataController、
 * Sm2Controller 等。
 *
 * 规则：
 * 1. 属性名严格保留 Jackson 实际序列化名称，不做前端 camelCase 归一。
 * 2. unknown 表示控制器/DTO 未限定结构，不代表可忽略。
 * 3. multipart、二进制流和 servlet 参数在 endpoints.ts 中单独定义。
 */

// ============================================================================
// 一、通用响应与分页
// ============================================================================

/** 未定型后端 JSON 对象袋（台账用）。不是 `@spark-appworks/spark-json-document` 的递归 `JsonObject`。 */
export type WireJsonObject = Record<string, unknown>;
/** 未定型后端 JSON 对象数组。 */
export type WireJsonArray = WireJsonObject[];

/**
 * 后端通用响应外壳 AjaxResult。
 *
 * 注意：字段为首字母大写，由后端 Jackson 序列化决定，不可改小写。
 * 与 `@spark-appworks/spark-lowcode-api` 的 `AjaxResult` 同形（`tools/verify-ajax-result-parity.mjs`）。
 * `Code` 必填：运行客户端按数字 Code 解包，台账不得再声明可选 Code。
 */
export type AjaxResult<T = unknown> = Readonly<{
  /** 业务状态码。 */
  Code: number
  /** 提示或错误信息。 */
  Message?: string | null
  /** 业务结果数据，泛型由调用方决定。 */
  Result?: T
  /** 消息类型：success / warn / error 或其它字符串。 */
  Type?: string | null
  /** 附加数据。 */
  Extras?: unknown
  /** 服务端时间戳字符串。 */
  Time?: string | null
}>

/** 分页参数：页码与每页条数。 */
export interface PageParam {
  /** 页码（从 1 开始）。 */
  index: number;
  /** 每页条数。 */
  size: number;
}

// ============================================================================
// 二、认证与登录
// ============================================================================

/** 验证码发送渠道：手机或邮箱。与 `@spark-appworks/spark-lowcode-api` 的 `SendCodeType` 同形（`tools/verify-send-code-parity.mjs`）。 */
export type SendCodeType = "MOBILE" | "EMAIL";

/**
 * 验证码业务场景。
 *
 * - REGISTER：用户注册
 * - LOGIN：验证码登录
 * - REGISTER_ENT：企业注册
 * - ENT_USER_LOGIN：企业用户登录
 * - RESET_PASSWORD：重置密码
 * - BIND：绑定账号
 * - REBIND：重新绑定账号
 * - EDIT_ENT：编辑企业信息
 * - ENT_USER_BIND：企业用户绑定
 * - ENT_USER_REBIND：企业用户重新绑定
 * - CHANGE_PASSWORD：修改密码（通过验证码）
 * - CHANGE_PASSWORD_BY_OLD_PASS：通过旧密码修改密码
 * - BIND_THIRD_ACCOUNT：绑定第三方账号
 * - UNBIND_THIRD_ACCOUNT：解绑第三方账号
 * - FACE：人脸识别
 * - IDENTITY_VERIFY_BIND：实名认证绑定
 * - ALIYUN_IDENTITY_VERIFY_BIND：阿里云实名认证绑定
 * - ADMIN_RESET_PASSWORD：管理员重置密码
 *
 * 与 `@spark-appworks/spark-lowcode-api` 的 `SendCodeScene` 同形（`tools/verify-send-code-parity.mjs`）。
 * 门面注册子集为 Extract<SendCodeScene, 'REGISTER' | 'REGISTER_ENT'>。
 */
export type SendCodeScene =
  | "REGISTER" | "LOGIN" | "REGISTER_ENT" | "ENT_USER_LOGIN"
  | "RESET_PASSWORD" | "BIND" | "REBIND" | "EDIT_ENT"
  | "ENT_USER_BIND" | "ENT_USER_REBIND" | "CHANGE_PASSWORD"
  | "CHANGE_PASSWORD_BY_OLD_PASS" | "BIND_THIRD_ACCOUNT"
  | "UNBIND_THIRD_ACCOUNT" | "FACE" | "IDENTITY_VERIFY_BIND"
  | "ALIYUN_IDENTITY_VERIFY_BIND" | "ADMIN_RESET_PASSWORD";

/**
 * OAuth 第三方登录提供者。
 *
 * - WECHAT_MINIAPP：微信小程序
 * - WECHAT_WEB：微信网页扫码
 * - WECHAT_MP：微信公众号
 * - WECHAT_CORP_WEB：企业微信网页
 * - DINGTALK_WEB：钉钉网页
 */
export type OAuthProvider =
  | "WECHAT_MINIAPP" | "WECHAT_WEB" | "WECHAT_MP"
  | "WECHAT_CORP_WEB" | "DINGTALK_WEB";

/**
 * 登录方式。
 *
 * - WECHAT_MINIAPP：微信小程序登录
 * - WECHAT_WEB：微信网页登录
 * - WECHAT_CORP_WEB：企业微信网页登录
 * - DINGTALK_WEB：钉钉网页登录
 * - MOBILE：手机号登录
 * - EMAIL：邮箱登录
 * - PASSWORD：账号密码登录
 * - FACE：人脸识别登录
 * - SSO：单点登录
 * - CODE：验证码登录
 * - TICKET：票据登录
 */
export type LoginType =
  | "WECHAT_MINIAPP" | "WECHAT_WEB" | "WECHAT_CORP_WEB"
  | "DINGTALK_WEB" | "MOBILE" | "EMAIL" | "PASSWORD"
  | "FACE" | "SSO" | "CODE" | "TICKET";

/** 企业用户注册请求体。 */
export interface Register {
  /** 企业标识。 */
  ent: string;
  /** 登录账号。 */
  loginName: string;
  /** 用户显示名。 */
  username: string;
  /** 密码（明文或加密后由后端处理）。 */
  password: string;
  /** 性别。 */
  sex?: string;
  /** 手机号。 */
  phone?: string;
  /** 邮箱。 */
  email?: string;
  /** 验证码。 */
  code?: string;
  /** 用户类型列表。 */
  user_types?: string[];
  /** 部门 ID。 */
  depId?: string;
  /** 岗位 ID。 */
  jobId?: string;
  /** 验证码类型。 */
  type?: SendCodeType;
  /** 关联令牌。 */
  token?: string;
}

/**
 * base-service 登录请求体。
 *
 * 注意：Login 的 @JsonProperty 后实际接收小写字段（strUser、strPwd、entName），
 * 与其它 DTO 的大写命名风格不同，保留后端原始定义。
 */
export interface Login {
  /** 登录账号。 */
  strUser: string;
  /** 登录密码。 */
  strPwd: string;
  /** 企业名称。 */
  entName: string;
  /** 是否已绑定。 */
  isBound?: boolean;
  /** 登录方式。 */
  type?: LoginType;
  /** 关联令牌。 */
  token?: string;
}

/** 验证码发送/校验命令。 */
export interface SendCodeCommand {
  /** 企业标识。 */
  ent?: string;
  /** 验证码类型。 */
  type: SendCodeType;
  /** 接收账号（手机号或邮箱）。 */
  account: string;
  /** 业务场景。 */
  scene: SendCodeScene;
  /** 验证码。 */
  code?: string;
  /** 扩展验证码（如图形验证）。 */
  exCode?: string;
  /** 目标地址，覆盖 account 推断。 */
  target?: string;
  /** 关联令牌。 */
  token?: string;
}

// ============================================================================
// 三、消息与 SSE
// ============================================================================

/**
 * 消息接收者类型。
 *
 * - CLIENT_ID：按客户端连接 ID 投递
 * - CONNECTION_UID：按连接 UID 投递
 * - USER：按用户 ID 投递
 * - ENT：按企业广播
 * - ALL：全量广播
 */
export type ReceiverTypeEnum =
  | "CLIENT_ID" | "CONNECTION_UID" | "USER" | "ENT" | "ALL";

/**
 * SSE / 站内消息类型。
 *
 * - TIP：轻提示消息
 * - USER_MESSAGE：用户间消息
 * - ACKNOWLEDGMENT：消息回执
 * - SYSTEM_NOTIFICATION：系统通知
 * - SYSTEM_DOWNLOAD：系统下载任务
 * - SYSTEM_ERROR：系统错误
 * - SYSTEM_KICKOUT：强制下线
 */
export type MessageTypeEnum =
  | "TIP" | "USER_MESSAGE" | "ACKNOWLEDGMENT"
  | "SYSTEM_NOTIFICATION" | "SYSTEM_DOWNLOAD"
  | "SYSTEM_ERROR" | "SYSTEM_KICKOUT";

/** SSE / 站内消息体。 */
export interface JsonSseMessage {
  /** 消息行 ID。 */
  rowId?: string;
  /** 企业 ID。 */
  entId?: string;
  /** 企业短名称。 */
  entShortName?: string;
  /** 发送者 ID。 */
  senderId?: string;
  /** 接收者类型。 */
  receiverType: ReceiverTypeEnum;
  /** 接收者 ID（按 receiverType 解释）。 */
  receiverId?: string;
  /** 消息标题。 */
  title?: string;
  /** 消息内容。 */
  content?: string;
  /** 消息类型。 */
  messageType: MessageTypeEnum;
  /** 发送方式列表（如站内、短信、邮件）。 */
  sendMethods?: string[];
  /** 创建时间。 */
  createTime?: string;
}

/** 离线消息 VO。 */
export interface OfflineMessageVo {
  /** 企业短名称。 */
  entShortName: string;
  /** 用户 ID。 */
  userId: string;
  /** 离线消息列表。 */
  messageList?: WireJsonObject[];
}

// ============================================================================
// 四、数据查询协议（TableInput / DataManager）
// ============================================================================

/** 排序方向。与 `@spark-appworks/spark-lowcode-api` 的 `OrderType` 同形（`tools/verify-wire-query-parity.mjs`）。 */
export type OrderType = "ascending" | "descending";

/** 字段查询参数。 */
export interface FieldParam {
  /** 字段名。 */
  Name: string;
  /** 字段别名。 */
  AsName?: string;
  /** 排序方向。 */
  OrderType?: OrderType;
  /** 排序优先级。 */
  Order?: number;
  /** 字段值函数。 */
  ValueFun?: ValueFun;
  /** 字段值。 */
  Value?: unknown;
  /** 表达式。 */
  Expression?: string;
  /** 是否输出到结果。 */
  IsOutput?: boolean;
  /** 是否参与分组。 */
  Group?: boolean;
  /** 字段类型。 */
  FieldType?: string;
}

/** 字段值函数定义。 */
export interface ValueFun {
  /** 函数类型。 */
  Type: string;
  /** 其余动态属性。 */
  [key: string]: unknown;
}

/**
 * wire 过滤操作符（Jackson Filter.Operator）。
 *
 * 比较类：equal / notequal / greaterthan / greaterthanorequal / lessthan / lessthanorequal
 * 空值类：isnull / isnotnull / isempty / isnotempty
 * 模糊类：contains / nolike / startswith / nostartswith / endswith / notendswith
 * 集合类：in / notin
 *
 * 正式名 `WireFilterOperator`，禁止与 spark-data `FilterOperator` 同名混用。
 * 与 `@spark-appworks/spark-lowcode-api` 同形（`tools/verify-wire-query-parity.mjs`）。
 */
export type WireFilterOperator =
  | "equal" | "notequal" | "greaterthan" | "greaterthanorequal"
  | "lessthan" | "lessthanorequal" | "isnull" | "isnotnull"
  | "contains" | "nolike" | "startswith" | "nostartswith"
  | "endswith" | "notendswith" | "in" | "notin"
  | "isempty" | "isnotempty";

/** 基础过滤条件树节点。 */
export interface BaseCondition {
  /** 条件类型（and / or / leaf）。 */
  Type: string;
  /** 子条件（组合类型时使用）。 */
  Filters?: BaseCondition[];
  /** 字段名。 */
  Field?: string;
  /** 操作符。 */
  Operator?: WireFilterOperator;
  /** 字段值函数。 */
  ValueFun?: ValueFun;
  /** 比较值。 */
  Value?: unknown;
}

/** 表查询参数。 */
export interface TableParam {
  /** 表名。 */
  Name: string;
  /** 元数据表名。 */
  MetaName?: string;
  /** 表短名（用于 SQL 别名）。 */
  ShortName?: string;
  /** 主键字段列表。 */
  PrimaryKeyFields?: string[];
  /** 外键字段列表。 */
  ForeignKeyFields?: string[];
  /** 过滤条件树。 */
  Filter?: BaseCondition;
  /** 表类型。 */
  Type?: string;
  /** 数据库 ID。 */
  DbId?: string;
  /** 数据库名称。 */
  DbName?: string;
  /** 字段定义列表。 */
  Fields?: FieldParam[];
  /** 是否业务主表。 */
  IsBusinessMain?: boolean;
  /** 子表定义。 */
  ChildTables?: TableParam[];
  /** 输出类型。 */
  OutputType?: string;
  /** 连接类型。 */
  JoinType?: string;
  /** 连接过滤条件。 */
  JoinFilter?: BaseCondition;
  /** 输入参数。 */
  inputParams?: WireJsonObject;
  /** 是否去重。 */
  DISTINCT?: boolean;
}

/**
 * TableInput 数据查询协议请求体。
 *
 * 后端核心查询协议，覆盖表/字段/过滤/连接/分页/树形查询等维度，
 * 被 DataInterfaceController、BasicFunController、ViewDataController、JsonDataController 共用。
 */
export interface TableInput {
  /** 表定义数组。 */
  Table: TableParam[];
  /** 分页参数。 */
  PageParam?: PageParam;
  /** 树形查询键字段。 */
  keyField?: string;
  /** 树形查询父字段。 */
  parentField?: string;
  /** 是否有子节点字段。 */
  hasChildField?: string;
  /** 查询类型。 */
  type?: string;
  /** 节点 ID（树形查询）。 */
  nodeid?: string;
  /** 是否去重。 */
  isDistinct?: boolean;
}

/** EJ 过滤条件（DataManager 用）。 */
export interface EJFilter {
  /** 字段名。 */
  Field?: string;
  /** 操作符。 */
  Operator?: string;
  /** 条件连接符。 */
  Condition?: string;
  /** 比较值。 */
  value?: unknown;
  /** 子条件。 */
  predicates?: EJFilter[];
}

/** QD 字段定义（DataManager 用）。 */
export interface QDField {
  /** 字段名。 */
  Name: string;
  /** 字段别名。 */
  asName?: string;
  /** 字段类型。 */
  fieldType?: string;
  /** 字段值函数。 */
  valueFun?: ValueFun;
  /** 内部值。 */
  _value?: unknown;
  /** 字段值。 */
  value?: unknown;
}

/** QD 过滤条件（DataManager 用）。 */
export interface QDFilter {
  /** 条件类型。 */
  Type: string;
  /** 子条件。 */
  Filters?: QDFilter[];
  /** 字段名。 */
  Field?: string;
  /** 操作符。 */
  Operator?: WireFilterOperator;
  /** 字段值函数。 */
  ValueFun?: ValueFun;
  /** 比较值。 */
  Value?: unknown;
}

/** QD 表定义（DataManager 用）。 */
export interface QDTable {
  /** 表名。 */
  name: string;
  /** 表短名。 */
  shortName?: string;
  /** 主键字段列表。 */
  primaryKeyFields?: string[];
  /** 外键字段列表。 */
  foreignKeyFields?: string[];
  /** 过滤条件列表。 */
  filters?: QDFilter[];
  /** 字段定义列表。 */
  fields?: QDField[];
  /** 子表定义。 */
  childTables?: QDTable[];
}

/** DataManager 数据查询请求。 */
export interface DataManagerRequest {
  /** 树形查询键字段。 */
  KeyField?: string;
  /** 树形查询父字段。 */
  ParentField?: string;
  /** 取值上限。 */
  TopValue?: unknown;
  /** 是否有子节点字段。 */
  HasChildField?: string;
  /** ID 映射。 */
  IdMapping?: WireJsonObject;
  /** 返回类型。 */
  ReturnType?: string;
  /** 数据源表定义。 */
  DataSource?: QDTable;
  /** 跳过条数。 */
  skip?: number;
  /** 取条数。 */
  take?: number;
  /** 取前 N 条。 */
  top?: number;
  /** 选择字段列表。 */
  select?: string[];
  /** 排序定义。 */
  sorted?: WireJsonObject[];
  /** 过滤条件。 */
  where?: EJFilter;
}

/**
 * 分组聚合函数类型。
 *
 * - sum：求和
 * - avg：平均
 * - min：最小值
 * - max：最大值
 * - count：计数
 *
 * 与 `@spark-appworks/spark-lowcode-api` 的 `GroupFunType` 同形（`tools/verify-wire-query-parity.mjs`）。
 * 前端视图聚合用 spark-data `AggregateType`（额外含 join），禁止混名。
 */
export type GroupFunType = "sum" | "avg" | "min" | "max" | "count";

/** 分组聚合查询参数。 */
export interface GroupDataParam {
  /** 分组字段。 */
  groupField: string;
  /** 值字段。 */
  valField: string;
  /** 聚合函数类型。 */
  funType: GroupFunType;
  /** 结果别名。 */
  valAsName?: string;
}

/** CRUD 变更模型。 */
export interface CrudModel {
  /** 新增行数组。 */
  added?: WireJsonObject[];
  /** 修改行数组。 */
  changed?: WireJsonObject[];
  /** 删除行数组。 */
  deleted?: WireJsonObject[];
}

/** 单表 CRUD 请求。 */
export interface CrudModelRequest {
  /** 目标表名。 */
  tableName: string;
  /** CRUD 变更模型。 */
  crudModel: CrudModel;
}

// ============================================================================
// 五、流程（Flow）
// ============================================================================

/** 流程提交下一节点定义。 */
export interface SubmitNode {
  /** 节点 ID。 */
  NodeId: string;
  /** 执行人列表。 */
  ExecUserList?: string[];
}

/** 流程启动/提交请求体。 */
export interface FlowExecObjInput {
  /** 操作类型。 */
  type?: string;
  /** 下一节点与执行人。 */
  nextNode?: SubmitNode[];
  /** 处理意见。 */
  Idea?: string;
  /** 通知方式。 */
  notifyType?: string;
  /** 流程实例 ID。 */
  flowId: string;
  /** 表单键。 */
  formKey?: string;
  /** 表单参数。 */
  formParams?: WireJsonObject;
  /** 业务数据行 ID。 */
  busRowid?: string;
  /** 流程对象 ID（JSON 字段 flowObjId）。 */
  flowObjId?: string;
  /** 当前步骤 ID。 */
  curStepId?: string;
}

/** 流程退回请求体。 */
export interface FlowBackInput {
  /** 流程对象 ID。 */
  flowObjId: string;
  /** 当前步骤 ID。 */
  curStepId: string;
  /** 目标退回节点 ID。 */
  nodeId?: string;
  /** 处理意见。 */
  Idea?: string;
}

/** 判断是否可自动提交请求体。 */
export interface CanAutoSubmitAfterInput {
  /** 当前步骤 ID。 */
  curStepId: string;
}

/** 流程表单定义。 */
export interface WFMWORKFORM {
  /** 行 ID。 */
  ROWID?: string;
  /** 表单 ID。 */
  FORMID?: string;
  /** 表单 URL。 */
  URL?: string;
  /** 移动端 URL。 */
  MobileUrl?: string;
  /** 表单名称。 */
  FormName?: string;
  /** 流程 ID。 */
  FlowID?: string;
  /** 分类路径。 */
  CnPath?: string;
  /** 业务字段。 */
  BusField?: string;
  /** 业务表。 */
  BusTable?: string;
  /** 标题字段。 */
  TitleField?: string;
  /** 宽度。 */
  Width?: number;
  /** 高度。 */
  Height?: number;
}

/** 流程节点定义。 */
export interface WFMFLOWNODE {
  /** 行 ID。 */
  ROWID?: string;
  /** 节点标题。 */
  TITLE?: string;
  /** 流程 ID。 */
  FLOWID?: string;
  /** 节点类型 ID。 */
  TYPEID?: string;
  /** 执行对象。 */
  EXEOBJ?: string;
  /** 执行用户来源。 */
  EXEUSERFROM?: string;
  /** 备注。 */
  MEMO?: string;
  /** 创建日期。 */
  CrtDate?: string;
  /** 节点顺序。 */
  NodeOrder?: number;
  /** 是否允许加签。 */
  AllowToApotheosis?: boolean;
  /** 是否允许退回。 */
  AllowToReject?: boolean;
  /** 是否允许转办。 */
  AllowToDelegate?: boolean;
  /** 是否允许协办。 */
  AllowToCooperate?: boolean;
  /** 是否允许共享。 */
  AllowToShare?: boolean;
  /** 是否自动超时。 */
  IsAutoOverTime?: boolean;
  /** 自动执行类型。 */
  AutoExecType?: string;
  /** 自动超时小时数。 */
  AutoHour?: number;
  /** 是否允许结束。 */
  AllowToEnd?: boolean;
  /** 是否通知所有执行人。 */
  NotifyAllExecUser?: boolean;
  /** 通知内容。 */
  NotifyContent?: string;
  /** 通知接口。 */
  NotifyInterface?: string;
  /** 节点角色 ID。 */
  NodeRoleID?: string;
  /** 节点表单 ID。 */
  NodeFormID?: string;
  /** 节点编码。 */
  NodeCode?: string;
  /** 最小执行人数。 */
  minExecNum?: number;
  /** 最大执行人数。 */
  maxExecNum?: number;
  /** 是否允许一次发送。 */
  AllowOneSend?: boolean;
  /** 是否允许追加。 */
  AllowToAppend?: boolean;
  /** 是否允许回到发起人。 */
  AllowToCreator?: boolean;
  /** 是否汇聚节点。 */
  isSinkNode?: boolean;
  /** 提交策略。 */
  submitStrategy?: string;
  /** 是否流程发起人节点。 */
  isFlowInitiatorNode?: boolean;
}

/** 流程节点关系定义。 */
export interface WFMNODEREALATION {
  /** 行 ID。 */
  ROWID?: string;
  /** 关系标题。 */
  TITLE?: string;
  /** 流程 ID。 */
  FLOWID?: string;
  /** 关系类型 ID。 */
  TypeID?: string;
  /** 上游节点 ID。 */
  UpNodeID?: string;
  /** 下游节点 ID。 */
  NextNodeID?: string;
  /** 是否多用户。 */
  IsMoreUser?: boolean;
  /** 最大用户数。 */
  MaxUserNum?: number;
  /** 最小用户数。 */
  MinUserNum?: number;
  /** 条件表达式。 */
  ConditionExpress?: string;
  /** 关系顺序。 */
  RelationOrder?: number;
  /** 是否允许追加。 */
  AllowToAppend?: boolean;
  /** 是否允许撤回。 */
  AllowToRevoke?: boolean;
  /** 是否允许退回。 */
  AllowToBack?: boolean;
  /** 是否允许强制撤回。 */
  AllowToForceRevoke?: boolean;
  /** 是否允许强制退回。 */
  AllowToForceBack?: boolean;
  /** 是否允许一次发送。 */
  AllowOneSend?: boolean;
  /** 签名数。 */
  signatureNum?: number;
  /** 提交类型。 */
  submitType?: string;
  /** 撤回条件配置。 */
  RevokeConditionConfig?: WireJsonObject;
  /** 流程自动提交配置。 */
  FlowAutoSubmitConfig?: WireJsonObject;
  /** 方向。 */
  direction?: string;
}

/** 功能节点与流程节点关联。 */
export interface FunctionFlowNode {
  /** 行 ID。 */
  rowid?: string;
  /** 流程 ID。 */
  FlowID?: string;
  /** 节点 ID。 */
  NodeID?: string;
  /** 功能 ID。 */
  FunID?: string;
  /** 文件 ID。 */
  Fileid?: string;
}

/** 流程设计保存请求体。 */
export interface FlowDesignSaveInput {
  /** 流程模型 ID。 */
  FlowModId: string;
  /** 设计画布 JSON。 */
  DesignJson?: string;
  /** 设计图片（Base64）。 */
  DesignImg?: string;
  /** 流程节点列表。 */
  FlowNodes?: WFMFLOWNODE[];
  /** 流程节点关系列表。 */
  FlowNodeRelations?: WFMNODEREALATION[];
  /** 功能与流程节点关系列表。 */
  FunAndFlowNode?: FunctionFlowNode[];
}

/** 代码节点设计记录。 */
export interface CodeNodeDesign {
  /** 行 ID。 */
  rowid?: string;
  /** 代码设计 ID。 */
  CodeDesignID?: string;
  /** 节点编号。 */
  NodeNo?: string;
  /** 节点描述。 */
  description?: string;
  /** 节点类型。 */
  NodeType?: string;
  /** 节点设计 JSON。 */
  CodeNodeDesignJson?: string;
  /** 创建人。 */
  createuser?: string;
  /** 创建时间。 */
  createtime?: string;
  /** 更新人。 */
  updateuser?: string;
  /** 更新时间。 */
  updatetime?: string;
  /** 工作流 ID。 */
  wfid?: string;
  /** 流程状态。 */
  flowstate?: string;
  /** 报表 ID。 */
  ReportID?: string;
}

/** 代码节点列表请求体。 */
export interface CodeNodesList {
  /** 代码节点设计数组。 */
  codeNodesList: CodeNodeDesign[];
}

// ============================================================================
// 六、数据库、表与视图
// ============================================================================

/**
 * 数据库类型。
 *
 * - MYSQL：MySQL
 * - SQLSERVER：SQL Server
 * - DM：达梦
 * - POSTGRESQL：PostgreSQL
 */
export type DBTypeEnum = "MYSQL" | "SQLSERVER" | "DM" | "POSTGRESQL";

/** 数据库服务器信息。 */
export interface ServerInfo {
  /** 行 ID。 */
  rowId?: string;
  /** 数据库类型。 */
  type: DBTypeEnum;
  /** 服务器名称。 */
  serverName: string;
  /** IP 地址。 */
  ipAddress: string;
  /** 用户名。 */
  username: string;
  /** 密码。 */
  password: string;
  /** 端口。 */
  port: number;
  /** 企业 ID。 */
  entId?: string;
  /** 描述。 */
  description?: string;
}

/**
 * 数据同步请求体。
 *
 * 注意：字段使用下划线命名（source_db、source_table 等），保留后端原始定义。
 */
export interface SyncDataRequest {
  /** 源数据库。 */
  source_db: string;
  /** 源表。 */
  source_table: string;
  /** 目标数据库。 */
  target_db: string;
  /** 目标表。 */
  target_table: string;
}

/**
 * 字段值迁移规则。
 *
 * - SnowflakeID：将字段值替换为雪花 ID
 */
export type MigrateRuleEnum = "SnowflakeID";

/** 字段迁移请求体。 */
export interface MigrateTableFieldRequest {
  /** 数据库。 */
  db: string;
  /** 表名。 */
  table: string;
  /** 字段名。 */
  field: string;
  /** 迁移规则。 */
  rule: MigrateRuleEnum;
  /** 批大小。 */
  batchSize?: number;
}

/** 视图数据 VO。 */
export interface ViewDataVo {
  /** 视图 ID。 */
  viewId: string;
  /** 视图数据内容。 */
  data: unknown;
}

// ============================================================================
// 七、JSON 数据
// ============================================================================

/** JSON 数据批量变更请求。 */
export interface BatchJsonData {
  /** 数据集名称。 */
  name: string;
  /** 新增 JSON 数据。 */
  addJsonData?: WireJsonObject[];
  /** 修改 JSON 数据。 */
  editJsonData?: WireJsonObject[];
  /** 删除 JSON 数据。 */
  delJsonData?: WireJsonObject[];
}

/** 工作流测试运行请求。 */
export interface WorkflowTestRequest {
  /** 工作流 ID。 */
  workflowId: string;
  /** 节点 ID（单节点测试）。 */
  nodeId?: string;
  /** 节点输入参数。 */
  inputParams?: Record<string, WireJsonObject[]>;
  /** 启动参数。 */
  startParams?: WireJsonObject[];
}

// ============================================================================
// 八、文件与 Excel
// ============================================================================

/** 文件操作请求参数。 */
export interface FileInfo {
  /** 自定义存储目录。 */
  customPath?: string;
  /** 文件名。 */
  fileName?: string;
  /** 应用/存储类型。 */
  appType?: string;
  /** 是否跨企业。 */
  isCrossEnt?: boolean;
  /** 同名是否覆盖。 */
  isReplace?: boolean;
  /** 文件文本内容（字符串上传场景）。 */
  content?: string;
  /** 转换类型。 */
  convertType?: number;
}

/** Excel 导入/导出字段配置。 */
export interface BaseImportDataField {
  /** 行 ID。 */
  rowId?: string;
  /** 配置 ID。 */
  configId?: string;
  /** 字段名。 */
  name: string;
  /** 字段标题。 */
  title?: string;
  /** 列索引。 */
  index?: number;
  /** 引用表。 */
  refTable?: string;
  /** 值字段。 */
  valueField?: string;
  /** 文本字段。 */
  textField?: string;
  /** 过滤字段。 */
  filterField?: string;
  /** 过滤值。 */
  filterValue?: string;
  /** 是否字典字段。 */
  isDict?: boolean;
  /** 字段类型。 */
  type?: string;
  /** 格式 pattern。 */
  pattern?: string;
  /** 前缀。 */
  prefixes?: string;
  /** 是否隐藏。 */
  isHide?: boolean;
  /** 是否受保护。 */
  isProtected?: boolean;
  /** 整数索引。 */
  intIndex?: number;
}

/** Excel 导入/导出工作表配置。 */
export interface BaseImportConfig {
  /** 行 ID。 */
  rowId?: string;
  /** 父配置 ID。 */
  pId?: string;
  /** 方案 ID。 */
  schemeId?: string;
  /** 工作表序号。 */
  sheet?: number;
  /** 工作表名称。 */
  sheetName?: string;
  /** 标题行索引。 */
  titleIndex?: number;
  /** 数据行索引。 */
  dataIndex?: number;
  /** 目标表。 */
  table?: string;
  /** 字段配置列表。 */
  fields?: BaseImportDataField[];
  /** 子表配置。 */
  childTables?: BaseImportConfig[];
  /** 父字段。 */
  parentField?: string;
  /** 外键字段。 */
  foreignKeyField?: string;
  /** 过滤条件。 */
  filters?: BaseCondition;
  /** 排序定义。 */
  sorted?: WireJsonObject[];
  /** 导出类型。 */
  exportType?: string;
  /** 数据库名称。 */
  dbName?: string;
  /** 表名。 */
  tableName?: string;
  /** 主键字段。 */
  primaryKeyField?: string;
  /** 字段类型映射。 */
  fieldTypeMap?: Record<string, string>;
  /** 数据行映射。 */
  dataRowMap?: WireJsonObject;
  /** 导出数据。 */
  exportData?: WireJsonObject[];
}

// ============================================================================
// 九、SM2 国密
// ============================================================================

/** SM2 临时公钥协商结果。 */
export interface Sm2PublicKeyResult {
  /** 加密密钥的 Base64。 */
  encryptKeyBase64: string;
  /** 算法标识。 */
  algorithm: string;
  /** 过期时间戳（毫秒）。 */
  expiresAt: number;
  /** 签发时间戳（毫秒）。 */
  issuedAt: number;
}
