/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/protocol/data-space-permission
 * 职责：从原查询行的后端权限快照派生消费权限。
 * 边界：读 h/m 与写 E/R 独立，新增子项只接受明确 c=true。
 * AI用途：正确消费字段、行操作和缺失权限策略。
 */
/** 原行缺少权限快照时的显式策略；不推断新增子项授权。 */
export type DataSpaceMissingAuthPolicy = 'allow' | 'deny' | 'deny-when-system-key' | 'visible-readonly'
/** 字段读、写双通道投影；required 只在 E 可写且 R 必填时成立。 */
export type DataSpaceFieldAccess = Readonly<{
  read: 'invisible' | 'masked' | 'visible'
  write: 'denied' | 'allowed'
  component: 'hidden' | 'readonly' | 'editable'
  required: boolean
  writeMode: 'required' | 'editable' | 'readonly'
}>
/** 原查询行及缺失权限策略；只读取行内系统权限快照。 */
type DataSpaceRowPermissionOptions = Readonly<{
  row?: Readonly<Record<string, unknown>> | null
  missingAuthPolicy?: DataSpaceMissingAuthPolicy
}>
type DataSpaceAuthSet = Readonly<{ r: readonly string[]; e: readonly string[];
  h: readonly string[]; m: readonly string[]; d: boolean; c: boolean }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function stringArray(value: unknown): readonly string[] {
  return Object.freeze(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
}

/** 后端权限快照；R 是 E 中的必填字段，写授权消费 E，h/m 不撤销写授权。 */
export class DataSpaceRowPermission {
  readonly #auth: DataSpaceAuthSet | null
  readonly #policy: DataSpaceMissingAuthPolicy
  readonly #systemKey: boolean

  /** 复制并冻结后端权限集合；h/m 不清除 E，c 必须是 true。 */
  public constructor(options: DataSpaceRowPermissionOptions) {
    const raw = options.row?.['lingma_sys_params']
    this.#auth = isRecord(raw) ? Object.freeze({ r: stringArray(raw['r']), e: stringArray(raw['e']),
      h: stringArray(raw['h']), m: stringArray(raw['m']), d: Boolean(raw['d']), c: raw['c'] === true }) : null
    this.#policy = options.missingAuthPolicy ?? 'allow'
    this.#systemKey = Boolean(options.row?.['lingma_sys_key'])
  }

  public fieldAccess(fieldName: string): DataSpaceFieldAccess {
    const auth = this.#auth
    const writable = auth ? auth.e.includes(fieldName) : this.allowWithoutAuth()
    const required = writable && (auth?.r.includes(fieldName) ?? false)
    const read = auth
      ? auth.h.includes(fieldName) ? 'invisible' : auth.m.includes(fieldName) ? 'masked' : 'visible'
      : this.#policy === 'visible-readonly' || writable ? 'visible' : 'invisible'
    return Object.freeze({ read, write: writable ? 'allowed' : 'denied',
      component: writable ? 'editable' : read === 'invisible' ? 'hidden' : 'readonly', required,
      writeMode: writable ? required ? 'required' : 'editable' : 'readonly' })
  }

  public allowDelete(): boolean { return this.#auth ? this.#auth.d : this.allowWithoutAuth() }

  public allowAddChild(): boolean { return this.#auth?.c === true }

  public allowEdit(): boolean {
    return this.#auth ? this.#auth.e.length > 0 : this.allowWithoutAuth()
  }

  private allowWithoutAuth(): boolean {
    if (this.#policy === 'deny' || this.#policy === 'visible-readonly') return false
    return this.#policy !== 'deny-when-system-key' || !this.#systemKey
  }
}
