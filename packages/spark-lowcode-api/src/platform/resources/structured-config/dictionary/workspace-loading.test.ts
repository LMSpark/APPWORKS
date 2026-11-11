import {afterEach, describe, expect, it} from 'vitest'
import {DictionaryWorkspace} from './workspace'
import {fixture} from './tests/workspace.fixture'

function readTables(http: ReturnType<typeof fixture>['http']): string[] {
  return http.reads.map(request => (request.data as {Table: Array<{Name: string}>}).Table[0]!.Name)
}

describe('DictionaryWorkspace on-demand entry reads', () => {
  it('loads only the definition for design and reads entries only to validate an encoding change', async () => {
    const {dataSet, http} = fixture()
    const workspace = new DictionaryWorkspace({dataSet, dictionaryId: 'D1', purpose: 'design'})
    try {
      await workspace.load()
      expect(readTables(http)).toEqual(['_Base_DictType'])

      http.records['_Base_DictData']![0]!['val'] = 'legacy-code'
      workspace.definition.updateEditingValue('D1', 'dictionaryType', '1')
      await expect(workspace.saveDesign()).rejects.toThrow('十进制')

      expect(readTables(http)).toEqual(['_Base_DictType', '_Base_DictData'])
      expect(http.saves).toHaveLength(0)
      expect(workspace.definition.getEditingRow('D1')?.['dictionaryType']).toBe('1')
    } finally {dataSet.destroy()}
  })

  it('keeps data maintenance on the complete definition and entry read path', async () => {
    const {workspace, dataSet, http} = fixture()
    try {
      await workspace.load()
      expect(readTables(http)).toEqual(['_Base_DictType', '_Base_DictData'])
    } finally {dataSet.destroy()}
  })

  it('does not save a type change when the on-demand entry query fails', async () => {
    const {dataSet, http} = fixture()
    const workspace = new DictionaryWorkspace({dataSet, dictionaryId: 'D1', purpose: 'design'})
    try {
      await workspace.load()
      workspace.definition.updateEditingValue('D1', 'dictionaryType', '1')
      http.failReads = true

      await expect(workspace.saveDesign()).rejects.toThrow('读取失败')

      expect(readTables(http)).toEqual(['_Base_DictType', '_Base_DictData'])
      expect(http.saves).toHaveLength(0)
      expect(workspace.definition.getEditingRow('D1')?.['dictionaryType']).toBe('1')
    } finally {dataSet.destroy()}
  })
})
