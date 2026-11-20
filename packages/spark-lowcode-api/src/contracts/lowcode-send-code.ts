/**
 * lowcode-jdk17 验证码 wire 字面量（渠道 / 场景）。
 * 与 `backend-api-contracts/common.ts` 同形（`tools/verify-send-code-parity.mjs`）。
 */

/** 验证码投递渠道。 */
export type SendCodeType = 'MOBILE' | 'EMAIL'

/**
 * 验证码业务场景全集（wire SendCodeScene）。
 * 门面注册子集见 `LowcodeVerificationScene = Extract<SendCodeScene, 'REGISTER' | 'REGISTER_ENT'>`。
 */
export type SendCodeScene =
  | 'REGISTER'
  | 'LOGIN'
  | 'REGISTER_ENT'
  | 'ENT_USER_LOGIN'
  | 'RESET_PASSWORD'
  | 'BIND'
  | 'REBIND'
  | 'EDIT_ENT'
  | 'ENT_USER_BIND'
  | 'ENT_USER_REBIND'
  | 'CHANGE_PASSWORD'
  | 'CHANGE_PASSWORD_BY_OLD_PASS'
  | 'BIND_THIRD_ACCOUNT'
  | 'UNBIND_THIRD_ACCOUNT'
  | 'FACE'
  | 'IDENTITY_VERIFY_BIND'
  | 'ALIYUN_IDENTITY_VERIFY_BIND'
  | 'ADMIN_RESET_PASSWORD'
