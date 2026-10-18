import {describe, expect, it} from 'vitest'
import {ref} from 'vue'
import type {SparkNode} from '@spark-appworks/spark-data'
import {useContainerGrid} from '../../components/containers/runtime/container-layout'

describe('container adaptive grid', () => {
  it('lets the available width place ordinary field children on separate tracks', () => {
    const children = Array.from({length: 7}, (_, index) => ({type: 'r-text', props: {field: `f${index}`}}))
    const grid = useContainerGrid({children, columns: 24, autoFitMinWidth: '220px'})
    expect(grid.gridStyle.value.gridTemplateColumns).toBe('repeat(auto-fit, minmax(220px, 1fr))')
    for (const child of children) expect(grid.getChildGridStyle(child).gridColumn).toBeUndefined()
  })
  it('keeps explicit spans and the fixed-grid default intact', () => {
    const children: SparkNode[] = [{type: 'r-text', props: {colSpan: 12}}, {type: 'r-text'}, {type: 'r-text'}, {type: 'r-text'}]
    const width = ref('220px')
    const grid = useContainerGrid({children, columns: 24, autoFitMinWidth: width})
    expect(grid.getChildGridStyle(children[0]!).gridColumn).toBe('span 2 / span 2')
    width.value = ''
    expect(grid.getChildGridStyle(children[0]!).gridColumn).toBe('span 12 / span 12')
    expect(grid.getChildGridStyle(children[1]!).gridColumn).toBe('span 24 / span 24')
  })
})
