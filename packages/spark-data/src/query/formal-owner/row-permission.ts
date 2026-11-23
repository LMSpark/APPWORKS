import type { DataPermissionSets } from '../../types'

export type DataSpaceMissingAuthPolicy = 'allow' | 'deny' | 'deny-when-system-key' | 'visible-readonly'

export type DataSpaceFieldAccess = Readonly<{
  read: 'invisible' | 'masked' | 'visible'
  write: 'denied' | 'allowed'
  component: 'hidden' | 'readonly' | 'editable'
  required: boolean
  writeMode: 'required' | 'editable' | 'readonly'
}>

type FormalRowPermissionOptions = Readonly<{
  row?: Readonly<Record<string, unknown>> | null
  missingAuthPolicy?: DataSpaceMissingAuthPolicy
}>

type FormalAuthSet = Required<DataPermissionSets>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function stringArray(value: unknown): readonly string[] {
  return Object.freeze(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
}

/** 后端权限快照；读 h/m、写 E、删除 d 与新增子项 c 分别消费。 */
export class DataSpaceRowPermission {
  readonly #auth: FormalAuthSet | null
  readonly #policy: DataSpaceMissingAuthPolicy
  readonly #systemKey: boolean

  public constructor(options: FormalRowPermissionOptions) {
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

  public allowEdit(): boolean { return this.#auth ? this.#auth.e.length > 0 : this.allowWithoutAuth() }

  private allowWithoutAuth(): boolean {
    if (this.#policy === 'deny' || this.#policy === 'visible-readonly') return false
    return this.#policy !== 'deny-when-system-key' || !this.#systemKey
  }
}
