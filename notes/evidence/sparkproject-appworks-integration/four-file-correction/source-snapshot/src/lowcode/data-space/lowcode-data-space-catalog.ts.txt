import { DataViewFilter } from '@spark-appworks/spark-data'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'

const catalogFields = ['rowid', 'Name', 'Type', 'description', 'sysid', 'createuser', 'createtime'] as const
type CatalogField = typeof catalogFields[number]
type CreatorContext = Awaited<ReturnType<typeof lowcodeApi.dataSpace.runtime.query>>
type CatalogRawRow = Readonly<{ row: Readonly<Record<string, unknown>>; key: string }>
type CreatorProjection = Readonly<{ labels: ReadonlyMap<string, string>; unresolvedCount: number }>
type CreatorCandidate = Readonly<{ label: string; unresolved: boolean }>
type LowcodeDataSpaceApplicationOption = Readonly<{ value: string; label: string }>
export type LowcodeDataSpaceCatalogRow = Readonly<Record<CatalogField, string>>
export type LowcodeDataSpaceCatalogResult = Readonly<{
  rows: readonly LowcodeDataSpaceCatalogRow[]
  total: number
  unresolvedCreatorCount: number
}>
type LowcodeDataSpaceCatalogQuery = Readonly<{ name?: string; sysid?: string; page?: number; pageSize?: number }>

function requireScenarioId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('数据空间目录缺少正式蓝图场景')
  return value.trim()
}

function requirePage(value: number | undefined, fallback: number, label: string): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 1) throw new Error(`数据空间目录${label}无效`)
  return result
}

function present(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  throw new Error('数据空间目录查询字段不是可呈现的标量值')
}

function optionalLabel(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  return present(value)
}

function verifiedRows(context: CreatorContext, keyField: 'rowid' | 'ID'): CatalogRawRow[] {
  const keys = new Set<string>()
  return context.rows.map(row => {
    const rawId = row[keyField]
    const rowKey = context.rowKey(row)
    if (typeof rawId !== 'string' || !rawId.trim() || typeof rowKey !== 'string' || rowKey.trim() !== rawId.trim()
      || keys.has(rowKey.trim())) throw new Error(`${keyField === 'rowid' ? '数据空间' : '用户'}查询结果缺少唯一且匹配 ${keyField} 的正式主键`)
    keys.add(rowKey.trim())
    return { row, key: rowKey.trim() }
  })
}

function creatorId(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  throw new Error('数据空间目录创建人 ID 不是可查询的标量值')
}

function creatorAssociation(context: CreatorContext, row: CatalogRawRow): Readonly<{ id: string; readable: boolean }> {
  const formalReadable = context.fieldAccess(row.key, 'ROWID').read === 'visible'
  const outputReadable = context.fieldAccess(row.key, 'rowid').read === 'visible'
  if (!formalReadable || !outputReadable) return { id: '', readable: false }
  const hasFormal = Object.hasOwn(row.row, 'ROWID')
  const hasOutput = Object.hasOwn(row.row, 'rowid')
  if (!hasFormal && !hasOutput) return { id: '', readable: true }
  const formalId = hasFormal ? creatorId(row.row['ROWID']) : ''
  const outputId = hasOutput ? creatorId(row.row['rowid']) : ''
  if (hasFormal && hasOutput && formalId !== outputId) {
    throw new Error('用户查询结果 ROWID 与 rowid 关联值冲突')
  }
  return { id: hasFormal ? formalId : outputId, readable: true }
}

function addCreatorCandidate(candidates: Map<string, CreatorCandidate | null>, id: string, candidate: CreatorCandidate): void {
  candidates.set(id, candidates.has(id) ? null : candidate)
}

function projectRows(context: CreatorContext, rows: readonly CatalogRawRow[], creatorLabels: ReadonlyMap<string, string>): LowcodeDataSpaceCatalogRow[] {
  return rows.map(({ row, key }) => {
    const read = (field: CatalogField): string => {
      const access = context.fieldAccess(key, field)
      if (access.read === 'masked') return '••••'
      if (access.read !== 'visible') return ''
      if (field !== 'createuser') return present(row[field])
      const id = creatorId(row[field])
      return id ? creatorLabels.get(id) ?? '未解析用户' : '-'
    }
    return Object.freeze({ rowid: read('rowid'), Name: read('Name'), Type: read('Type'),
      description: read('description'), sysid: read('sysid'), createuser: read('createuser'), createtime: read('createtime') })
  })
}

/** Read-only owner for the formal Base_DataSet catalog and its original query permissions. */
export class LowcodeDataSpaceCatalog {
  readonly #scenarioId: string
  readonly #scopeToken: string

  public constructor(scenarioId: unknown) {
    this.#scenarioId = requireScenarioId(scenarioId)
    this.#scopeToken = lowcodeApi.readRequestScope().token
  }

  public async query(input: LowcodeDataSpaceCatalogQuery = {}): Promise<LowcodeDataSpaceCatalogResult> {
    this.assertCurrent()
    const page = requirePage(input.page, 1, '页码')
    const pageSize = requirePage(input.pageSize, 10, '页大小')
    if (pageSize > 1000) throw new Error('数据空间目录页大小无效')
    const name = input.name?.trim() ?? ''
    const sysid = input.sysid?.trim() ?? ''
    const nameFilter = name ? DataViewFilter.group({ logic: 'or', filters: [
      { field: 'Name', operator: 'contains', value: name },
      { field: 'rowid', operator: 'eq', value: name },
    ] }) : undefined
    const applicationFilter = sysid ? DataViewFilter.condition({ field: 'sysid', operator: 'eq', value: sysid }) : undefined
    const filter = nameFilter && applicationFilter
      ? DataViewFilter.group({ logic: 'and', filters: [nameFilter.toJSON(), applicationFilter.toJSON()] })
      : nameFilter ?? applicationFilter
    const context = await lowcodeApi.dataSpace.runtime.query(
      { scenarioId: this.#scenarioId, metaName: 'Base_DataSet' },
      { ...(filter === undefined ? {} : { filter }), fields: catalogFields,
        sort: [{ field: 'createtime', direction: 'desc' }], page: { index: page, size: pageSize } },
    )
    this.assertCurrent()
    if (!context.countReported) throw new Error('数据空间目录查询未返回服务端总数')
    const rawRows = verifiedRows(context, 'rowid')
    const creatorIds = [...new Set(rawRows.flatMap(({ row, key }) => context.fieldAccess(key, 'createuser').read === 'visible'
      ? [creatorId(row['createuser'])].filter(Boolean) : []))]
    const creatorProjection = creatorIds.length ? await this.creatorLabels(creatorIds) : { labels: new Map<string, string>(), unresolvedCount: 0 }
    this.assertCurrent()
    const rows = projectRows(context, rawRows, creatorProjection.labels)
    this.assertCurrent()
    return { rows, total: context.total,
      unresolvedCreatorCount: creatorProjection.unresolvedCount }
  }

  private async creatorLabels(ids: readonly string[]): Promise<CreatorProjection> {
    this.assertCurrent()
    const requested = new Set(ids)
    const context = await lowcodeApi.dataSpace.runtime.query(
      { scenarioId: this.#scenarioId, metaName: 'Base_UserInfo' },
      { filter: DataViewFilter.condition({ field: 'ROWID', operator: 'in', value: ids }),
        fields: ['ID', 'ROWID', 'UserName'], allPages: true },
    )
    this.assertCurrent()
    if (!context.countReported) throw new Error('创建人名称查询未返回服务端总数')
    const rows = verifiedRows(context, 'ID')
    const candidates = new Map<string, CreatorCandidate | null>()
    for (const row of rows) {
      const association = creatorAssociation(context, row)
      if (!association.readable || !association.id || !requested.has(association.id)) continue
      const key = row.key
      const access = context.fieldAccess(key, 'UserName')
      if (access.read === 'masked') {
        addCreatorCandidate(candidates, association.id, { label: '••••', unresolved: false })
      } else if (access.read !== 'visible') {
        addCreatorCandidate(candidates, association.id, { label: '', unresolved: false })
      } else {
        const name = creatorId(row.row['UserName'])
        addCreatorCandidate(candidates, association.id, { label: name || '未解析用户', unresolved: !name })
      }
    }
    const labels = new Map<string, string>()
    const unresolved = new Set<string>()
    for (const id of ids) {
      const candidate = candidates.get(id)
      if (candidate === null || candidate === undefined) {
        labels.set(id, '未解析用户')
        unresolved.add(id)
      } else {
        labels.set(id, candidate.label)
        if (candidate.unresolved) unresolved.add(id)
      }
    }
    this.assertCurrent()
    return { labels, unresolvedCount: unresolved.size }
  }

  public async applications(): Promise<readonly LowcodeDataSpaceApplicationOption[]> {
    this.assertCurrent()
    const context = await lowcodeApi.dataSpace.runtime.query(
      { scenarioId: this.#scenarioId, metaName: 'Base_AppSystemList' },
      { fields: ['rowid', 'AppDesc', 'AppName'], allPages: true },
    )
    this.assertCurrent()
    if (!context.countReported) throw new Error('应用选项查询未返回服务端总数')
    const keys = new Set<string>()
    const options: LowcodeDataSpaceApplicationOption[] = []
    for (const row of context.rows) {
      const rawId = row['rowid']
      const rowKey = context.rowKey(row)
      if (typeof rawId !== 'string' || !rawId.trim() || typeof rowKey !== 'string' || rowKey.trim() !== rawId.trim()
        || keys.has(rowKey.trim())) throw new Error('应用选项查询结果缺少唯一且匹配 rowid 的正式主键')
      keys.add(rowKey.trim())
      if (context.fieldAccess(rowKey, 'rowid').read !== 'visible') continue
      let label = ''
      for (const field of ['AppDesc', 'AppName'] as const) {
        const access = context.fieldAccess(rowKey, field)
        if (access.read === 'masked') {
          label = '••••'
          break
        }
        if (access.read === 'visible') {
          label = optionalLabel(row[field])
          if (label) break
        }
      }
      if (!label) label = present(rawId)
      options.push(Object.freeze({ value: rowKey.trim(), label }))
    }
    this.assertCurrent()
    return Object.freeze(options)
  }

  private assertCurrent(): void {
    if (!this.isCurrent()) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: 数据空间目录 owner 执行域已变化')
    }
  }

  public isCurrent(): boolean {
    try {
      return lowcodeApi.readRequestScope().token === this.#scopeToken
    } catch {
      return false
    }
  }
}
