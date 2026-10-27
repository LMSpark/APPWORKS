import {describe, expect, it, vi} from 'vitest'
import {resolveNavHostProjectBinding, resolveProjectCandidate} from '@/views/app/dev-system/nav-host-project-picker/nav-host-project-picker-contract'

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

  it('fails closed for unread or hierarchical selectPid configuration', () => {
    const row = {rowid: 'rel-1', prowid: 'host-a', dataSetId: 'projects', DataName: 'Project', ValParamName: 'projectId', TextParamName: 'projectName', selectValParam: 'projectCode', selectTextParam: 'displayName', selectPid: 'parentId'}
    expect(() => resolveNavHostProjectBinding(view([row]) as never, 'host-a')).toThrow(/selectPid 层级配置暂不支持/)
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
})
