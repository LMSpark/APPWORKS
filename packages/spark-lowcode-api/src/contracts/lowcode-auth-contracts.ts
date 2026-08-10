export type LowcodeLoginWireInput = Readonly<{
  strUser: string
  strPwd: string
  entName: string
  isBound?: boolean
  type?: string
  token?: string
}>

export type LowcodeLoginWireResult = Readonly<{
  token: string
  refreshToken: string
  expire: number
  refreshExpire: number
  userinfo: Readonly<Record<string, unknown>>
  entinfo: Readonly<Record<string, unknown>>
}>

export type LowcodeRefreshWireResult = Readonly<{
  token: string
  refreshToken: string
  expire: number
  refreshExpire: number
}>
