import {describe, expect, it, vi} from 'vitest'
import {DataSet, RequestState} from '@spark-appworks/spark-data'
import {DataSpaceReferenceLayoutResource} from '@spark-appworks/spark-project-model'
import config from '../../../../../config/pages/data-platform/data-space-design/pagedata.json'

function fixture(read: (target: string) => Promise<string | null>) {
  let current = true
  const ds = DataSet.fromJson({scenarioId: 'META', dataSetName: 'reference', tables: {DataSpaceReferenceLayout: config.tables.DataSpaceReferenceLayout}})
  const view = ds.getView('DataSpaceReferenceLayout')!
  view.queryContext = {dataSpaceId: 'TARGET'}
  const resource = new DataSpaceReferenceLayoutResource({metadataScenarioId: 'META', read, assertCurrent: () => {
    if (!current) throw new Error('scope expired')
  }})
  view.bindQueryExecutor(resource, {resource: {resourceType: 'file', resourceId: DataSpaceReferenceLayoutResource.resourceId}})
  return {ds, view, expire: () => {current = false}}
}

describe('reference layout native resource', () => {
  it.each([null, '', '{invalid', '{"nodes":[]}'])('preserves raw content %j distinctly from a failed or missing query', async content => {
    const read = vi.fn(async () => content), {ds, view} = fixture(read)
    try {
      expect(read).not.toHaveBeenCalled(); await view.refresh()
      expect(view.requestState).toBe(RequestState.Loaded)
      expect(view.rows[0]).toMatchObject({dataSetId: 'TARGET', content})
      expect(view.fieldAccess(view.rows[0]!, 'content').write).toBe('denied')
      expect(view.addActionState()).toBe('disabled'); expect(view.editActionState(view.rows[0]!)).toBe('disabled')
      expect(view.deleteActionState(view.rows[0]!)).toBe('disabled')
      await expect(view.previewSource()).rejects.toThrow('UNSUPPORTED')
      expect(read).toHaveBeenCalledTimes(1)
    } finally {ds.destroy()}
  })

  it.each(['', '../other', 'T/other', 'T%2fother', ' TARGET', '\u0000'])('rejects invalid target %j before I/O', async target => {
    const read = vi.fn(async () => null), {ds, view} = fixture(read)
    try {
      view.queryContext = {dataSpaceId: target}; await view.refresh()
      expect(view.loadingError?.message).toContain('DATA_SPACE_REFERENCE_TARGET')
      expect(read).not.toHaveBeenCalled(); expect(view.rows).toEqual([])
    } finally {ds.destroy()}
  })

  it.each(['scope', 'target', 'dispose'] as const)('rejects %s changes while reading without publishing the old source', async change => {
    let release!: (value: string) => void
    const {ds, view, expire} = fixture(() => new Promise(resolve => {release = resolve}))
    try {
      const query = view.refresh(); await vi.waitFor(() => expect(release).toBeTypeOf('function'))
      if (change === 'scope') expire()
      else if (change === 'target') view.queryContext = {dataSpaceId: 'OTHER'}
      else ds.destroy()
      release('old'); await query
      expect(view.rows).toEqual([])
      if (change !== 'dispose') expect(view.loadingError).not.toBeNull()
    } finally {ds.destroy()}
  })

  it('keeps the previous result when a later read fails and exposes the failure', async () => {
    const read = vi.fn<(_: string) => Promise<string | null>>().mockResolvedValueOnce('before').mockRejectedValueOnce(new Error('read denied'))
    const {ds, view} = fixture(read)
    try {
      await view.refresh(); await view.refresh()
      expect(view.loadingError?.message).toBe('read denied')
      expect(view.rows[0]?.['content']).toBe('before')
    } finally {ds.destroy()}
  })
})
