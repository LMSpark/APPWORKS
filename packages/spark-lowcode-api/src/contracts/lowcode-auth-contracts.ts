/**
 * 登录/刷新相关 wire 载荷，字段名与 lowcode-jdk17 源端保持一致。
 * 仅用于会话适配层；expire/refreshExpire 为服务端绝对时间戳（毫秒），须由会话存储换算为本地过期时刻。
 */
export type LowcodeLoginWireInput = Readonly<{
  strUser: string
  strPwd: string
  entName: string
  isBound?: boolean
  type?: string
  token?: string
}>

/** 登录成功 wire 结果；userinfo/entinfo 为后端原始对象，上层需映射为 `LowcodeIdentity` 等领域类型。 */
export type LowcodeLoginWireResult = Readonly<{
  token: string
  refreshToken: string
  expire: number
  refreshExpire: number
  userinfo: Readonly<Record<string, unknown>>
  entinfo: Readonly<Record<string, unknown>>
}>

/** 刷新令牌 wire 结果；不含用户信息，调用方应合并进现有 session 而非整包替换身份快照。 */
export type LowcodeRefreshWireResult = Readonly<{
  token: string
  refreshToken: string
  expire: number
  refreshExpire: number
}>
