/**
 * lowcode 后端 wire 合同类型再导出。
 * 仅供差分、鉴权适配与协议对齐；业务层应使用各门面返回的领域快照，勿直接依赖 wire 形状。
 */
export type { AjaxResult } from './lowcode-ajax-result.js'
export type { SendCodeType } from './lowcode-send-code.js'
export type { SendCodeScene } from './lowcode-send-code.js'
export type { OrderType, WireFilterOperator, GroupFunType } from './lowcode-wire-query.js'
export type {
  LowcodeLoginWireInput,
  LowcodeLoginWireResult,
  LowcodeRefreshWireResult,
} from './lowcode-auth-contracts.js'
