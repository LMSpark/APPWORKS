import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe, expect, it} from 'vitest'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'

const pagedata = JSON.parse(readFileSync(resolve(process.cwd(), 'config/pages/data-platform/data-dictionary/pagedata.json'), 'utf8')) as {
  scenarioId: string
  tables: Record<string, {views: Record<string, {valueField?: string; labelField?: string; filterExpression?: unknown; queryConfig?: {fields?: string[]}}> }>
}

describe('blueprint navigation dictionary options', () => {
  it('declares isolated, read-only option views with exact dictionary type filters', () => {
    expect(() => new ScenarioViewConfig(pagedata.scenarioId, JSON.stringify(pagedata))).not.toThrow()
    const table = pagedata.tables['_Base_DictData']!
    const showType=table.views['NavigationShowType_Content']!
    const alignment=table.views['Navigationposition']!
    expect(pagedata.scenarioId).toBe('69B79AB779DF4C12A5595DACDF3283F1')
    expect(showType).toMatchObject({valueField: 'val', labelField: 'txt', queryConfig: {fields: ['rowid', 'typeid', 'val', 'txt']}})
    expect(alignment).toMatchObject({valueField: 'val', labelField: 'txt', queryConfig: {fields: ['rowid', 'typeid', 'val', 'txt']}})
    expect(JSON.stringify(showType.filterExpression)).toContain('6AC2214E0E68E3D0C642A23F7224B666')
    expect(JSON.stringify(alignment.filterExpression)).toContain('5BFAFA09FE5D58B02F9994D6712B7098')
    expect(showType.filterExpression).not.toEqual(alignment.filterExpression)
  })
})
