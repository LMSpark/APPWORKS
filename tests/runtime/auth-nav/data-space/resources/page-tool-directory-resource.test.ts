import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import scenario from '../../../../../config/pages/data-platform/data-space-design/pagedata.json'
import {createPageFileDirectoryView} from '@/services/project/page-tool-file-dataview'

const io = vi.hoisted(() => ({list: vi.fn(async (_appId: string, _pageId: string) => Array.from({length: 31}, (_, index) => `${index}.json`))}))
vi.mock('@/lowcode/lowcode-runtime', () => ({createPageToolFilesIo: () => io}))

function fixture() {
  io.list.mockClear()
  const dataSet = DataSet.fromJson({scenarioId: scenario.scenarioId, tables: {ProjectToolFile: structuredClone(scenario.tables.ProjectToolFile)}})
  let current = true
  const input = {dataSet, appId: 'APP', pageId: 'PAGE', assertCurrent: () => {if (!current) throw new Error('scope stale')}}
  return {dataSet, input, stale: () => {current = false}}
}

describe('formal tool directory resource binding', () => {
  it('uses the formal pagedata declaration and one read-only DataView for the complete source', async () => {
    const f = fixture()
    try {
      const view = createPageFileDirectoryView(f.input)
      await view.loadFromServer()
      expect(view.rows).toHaveLength(31); expect(view.total).toBe(31)
      expect(io.list).toHaveBeenCalledExactlyOnceWith('APP', 'PAGE')
      expect(view.fieldAccess(view.rows[0]!, 'fileName')).toMatchObject({read: 'visible', write: 'denied'})
      expect(view.fieldAccess(view.rows[0]!, 'text').read).toBe('invisible')
      expect(view.addActionState()).toBe('hidden')
      expect(createPageFileDirectoryView(f.input)).toBe(view)
      expect(io.list).toHaveBeenCalledOnce()
    } finally {f.dataSet.destroy()}
  })

  it('rejects option customPath overrides and stale execution before the formal IO', async () => {
    const f = fixture()
    try {
      const view = createPageFileDirectoryView(f.input)
      await expect(view.queryOptionRows({fields: ['fileName'], context: {customPath: 'APP/OTHER'}})).rejects.toThrow()
      expect(io.list).not.toHaveBeenCalled()
      f.stale()
      await expect(view.loadFromServer()).rejects.toThrow('scope stale')
      expect(io.list).not.toHaveBeenCalled()
    } finally {f.dataSet.destroy()}
  })
})
