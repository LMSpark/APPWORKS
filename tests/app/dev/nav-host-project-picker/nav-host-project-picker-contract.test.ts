import {describe, expect, it, vi} from 'vitest'
import {configureProjectHierarchy, resolveNavHostProjectBinding, resolveProjectCandidate, validateProjectHierarchy} from '@/views/app/dev-system/nav-host-project-picker/nav-host-project-picker-contract'

function view(rows: Record<string, unknown>[], unread: string[] = []) {
  return {
    rows,
    primaryKey: 'rowid',
    fieldAccess: vi.fn((_row: unknown, field: string) => ({read: unread.includes(field) ? 'hidden' : 'visible'})),
    getPkKey: (row: Record<string, unknown>) => row['rowid'] as string | undefined,
  }
}

describe('NavHost project binding', () => {
  it('maps output projectId to configured select value and text columns', () => {
    const host = view([{rowid: 'rel-1', prowid: 'host-a', dataSetId: 'projects', DataName: 'Project', ValParamName: 'projectId', TextParamName: 'projectName', selectValParam: 'projectCode', selectTextParam: 'displayName'}])
    expect(resolveNavHostProjectBinding(host as never, 'host-a')).toMatchObject({scenarioId: 'projects', modelName: 'Project', valueField: 'projectCode', labelField: 'displayName'})
  })

  it('fails closed for unread select fields', () => {
    const host = view([{rowid: 'rel-1', prowid: 'host-a', dataSetId: 'projects', DataName: 'Project', ValParamName: 'projectId', TextParamName: 'projectName', selectValParam: 'projectCode', selectTextParam: 'displayName'}], ['selectValParam'])
    expect(() => resolveNavHostProjectBinding(host as never, 'host-a')).toThrow(/不可读/)
  })

  it('maps readable selectPid configuration and fails closed when it is unreadable', () => {
    const row = {rowid: 'rel-1', prowid: 'host-a', dataSetId: 'projects', DataName: 'Project', ValParamName: 'projectId', TextParamName: 'projectName', selectValParam: 'projectCode', selectTextParam: 'displayName', selectPid: 'parentId'}
    expect(resolveNavHostProjectBinding(view([row]) as never, 'host-a')).toMatchObject({parentField: 'parentId'})
    expect(() => resolveNavHostProjectBinding(view([{...row, selectPid: ''}], ['selectPid']) as never, 'host-a')).toThrow(/不可读/)
  })

  it('rejects absent or ambiguous hosts', () => {
    expect(() => resolveNavHostProjectBinding(view([], []) as never, 'host-a')).toThrow(/缺失或歧义/)
    const row = {rowid: 'rel-1', prowid: 'host-a', dataSetId: 'projects', DataName: 'Project', ValParamName: 'projectId', TextParamName: 'name', selectValParam: 'projectCode', selectTextParam: 'displayName'}
    expect(() => resolveNavHostProjectBinding(view([row, {...row, rowid: 'rel-2'}]) as never, 'host-a')).toThrow(/缺失或歧义/)
  })

  it('rejects a host whose formal row identity is not readable', () => {
    const row = {rowid: 'rel-1', prowid: 'host-a', dataSetId: 'projects', DataName: 'Project', ValParamName: 'projectId', TextParamName: 'name', selectValParam: 'projectCode', selectTextParam: 'displayName'}
    expect(() => resolveNavHostProjectBinding(view([row], ['rowid']) as never, 'host-a')).toThrow(/行身份不可读/)
  })

  it('re-resolves the clicked row by canonical primary key and checks select-value access', () => {
    const rows = [{rowid: 'row-1', projectCode: 'APP-A', displayName: 'App A'}]
    const candidate = view(rows, [])
    const fields = {valueField: 'projectCode', labelField: 'displayName'}
    expect(resolveProjectCandidate(candidate as never, {rowid: 'row-1', projectCode: 'FORGED'} as never, fields)).toBe('APP-A')
    expect(() => resolveProjectCandidate(view(rows, ['projectCode']) as never, rows[0]!, fields)).toThrow(/不可读/)
    expect(() => resolveProjectCandidate(view(rows, ['displayName']) as never, rows[0]!, fields)).toThrow(/不可读/)
    expect(() => resolveProjectCandidate(view(rows, ['rowid']) as never, rows[0]!, fields)).toThrow(/身份字段不可读/)
    expect(() => resolveProjectCandidate(candidate as never, {rowid: 'missing'} as never, fields)).toThrow(/已失效/)
    expect(() => resolveProjectCandidate(view([...rows, {rowid: 'row-2', projectCode: 'APP-A'}]) as never, rows[0]!, fields)).toThrow(/重复/)
  })

  it('maps selectPid to a nested DataView tree while preserving primary-key selection', () => {
    const rows = [
      {rowid: 'p-1', code: 'P1', name: 'Parent', parent: ''},
      {rowid: 'c-1', code: 'C1', name: 'Child', parent: 'P1'},
      {rowid: 'g-1', code: 'G1', name: 'Grandchild', parent: 'C1'},
    ]
    const candidate = view(rows) as ReturnType<typeof view> & {setTreeConfig: ReturnType<typeof vi.fn>; treeConfig?: unknown}
    candidate.setTreeConfig = vi.fn(config => {candidate.treeConfig = config})
    configureProjectHierarchy(candidate as never, {valueField: 'code', labelField: 'name', parentField: 'parent'})
    expect(candidate.setTreeConfig).toHaveBeenCalledWith({idField: 'code', parentIdField: 'parent', textField: 'name', treeMode: 'flat'})
  })

  it('rejects unreadable parent fields and parent values that do not identify a candidate', () => {
    const rows = [{rowid: 'p-1', code: 'P1', name: 'Parent', parent: ''}, {rowid: 'c-1', code: 'C1', name: 'Child', parent: 'missing'}]
    const unreadable = view(rows, ['parent']) as ReturnType<typeof view> & {setTreeConfig: ReturnType<typeof vi.fn>}
    unreadable.setTreeConfig = vi.fn()
    expect(() => validateProjectHierarchy(unreadable as never, {valueField: 'code', labelField: 'name', parentField: 'parent'})).toThrow(/父级字段不可读/)
    const candidate = view(rows) as ReturnType<typeof view> & {setTreeConfig: ReturnType<typeof vi.fn>}
    candidate.setTreeConfig = vi.fn()
    expect(() => validateProjectHierarchy(candidate as never, {valueField: 'code', labelField: 'name', parentField: 'parent'})).toThrow(/父项不存在/)
  })

  it('rejects self-parenting, cyclic hierarchy and repeated candidate values', () => {
    for (const rows of [
      [{rowid: 'p-1', code: 'P1', name: 'Self', parent: 'P1'}],
      [{rowid: 'p-1', code: 'P1', name: 'One', parent: 'P2'}, {rowid: 'p-2', code: 'P2', name: 'Two', parent: 'P1'}],
      [{rowid: 'p-1', code: 'P1', name: 'One', parent: ''}, {rowid: 'p-2', code: 'P1', name: 'Two', parent: ''}],
    ]) {
      const candidate = view(rows) as ReturnType<typeof view> & {setTreeConfig: ReturnType<typeof vi.fn>}
      candidate.setTreeConfig = vi.fn()
      expect(() => validateProjectHierarchy(candidate as never, {valueField: 'code', labelField: 'name', parentField: 'parent'})).toThrow()
    }
  })

  it('rejects parent and value whitespace that the bound tree projection would not normalize', () => {
    for (const rows of [
      [{rowid: 'p-1', code: ' P1 ', name: 'Parent', parent: ''}, {rowid: 'c-1', code: 'C1', name: 'Child', parent: 'P1'}],
      [{rowid: 'p-1', code: 'P1', name: 'Parent', parent: ''}, {rowid: 'c-1', code: 'C1', name: 'Child', parent: ' P1 '}],
    ]) {
      expect(() => validateProjectHierarchy(view(rows) as never, {valueField: 'code', labelField: 'name', parentField: 'parent'})).toThrow()
    }
  })
})
