import {computed, shallowReactive} from 'vue'
import {describe, expect, it} from 'vitest'
import type {DataRow} from '@spark-appworks/spark-data'
import {resolveReactiveRow, syncReactiveRow} from '../../../packages/spark-component/src/components/containers/support/scope/row-mirror-sync'

describe('standard container row identity', () => {
  it('invalidates inherited row resolution even when the replacement has identical values', () => {
    const first = {id: 'same', name: 'same'}, second = {...first}
    const mirror = shallowReactive<DataRow>({})
    syncReactiveRow(mirror, first, {sourceRow: first})
    const resolved = computed(() => resolveReactiveRow(mirror))
    expect(resolved.value).toBe(first)
    syncReactiveRow(mirror, second, {sourceRow: second})
    expect(resolved.value).toBe(second)
    expect(JSON.stringify(mirror)).toBe(JSON.stringify(second))
    syncReactiveRow(mirror, null, {sourceRow: null})
    expect(resolved.value).toBeNull()
  })

  it('propagates source identity through a second standard container mirror', () => {
    const first = {id: 'A'}, second = {id: 'B'}
    const outer = shallowReactive<DataRow>({}), inner = shallowReactive<DataRow>({})
    syncReactiveRow(outer, first, {sourceRow: first})
    syncReactiveRow(inner, outer)
    const resolved = computed(() => resolveReactiveRow(inner))
    expect(resolved.value).toBe(first)
    syncReactiveRow(outer, second, {sourceRow: second})
    syncReactiveRow(inner, outer)
    expect(resolved.value).toBe(second)
    syncReactiveRow(outer, null, {sourceRow: null})
    syncReactiveRow(inner, outer)
    expect(resolved.value).toBeNull()
    syncReactiveRow(inner, {id: 'plain'})
    expect(resolved.value).toBe(inner)
    syncReactiveRow(inner, first, {sourceRow: first})
    expect(resolved.value).toBe(first)
  })

  it('does not propagate a source identity when the caller rejects it', () => {
    const source = {id: 'view-row'}
    const outer = shallowReactive<DataRow>({}), inner = shallowReactive<DataRow>({})
    syncReactiveRow(outer, source, {sourceRow: source})
    syncReactiveRow(inner, outer, {})

    expect(resolveReactiveRow(inner)).toBe(inner)
  })
  it('keeps display edits separate from the original entity reference', () => {
    const original = {id: 'A', name: 'original'}, display = {...original, name: 'draft'}
    const mirror = shallowReactive<DataRow>({})
    syncReactiveRow(mirror, display, {sourceRow: original})
    expect(mirror['name']).toBe('draft')
    expect(resolveReactiveRow(mirror)).toBe(original)
    expect(original.name).toBe('original')
    expect(Object.getOwnPropertySymbols(original)).toEqual([])
  })
  it('does not copy an inherited identity marker into a plain target model', () => {
    const original = {id: 'A', name: 'original'}, mirror = shallowReactive<DataRow>({})
    syncReactiveRow(mirror, original, {sourceRow: original})
    syncReactiveRow(original, mirror, {})
    expect(Object.getOwnPropertySymbols(original)).toEqual([])
    expect(resolveReactiveRow(original)).toBe(original)
  })
})
