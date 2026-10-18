import {computed, shallowReactive} from 'vue'
import {describe, expect, it} from 'vitest'
import type {DataRow} from '@spark-appworks/spark-data'
import {resolveReactiveRow, syncReactiveRow} from '../../../packages/spark-component/src/components/containers/support/scope/row-mirror-sync'

describe('standard container row identity', () => {
  it('invalidates inherited row resolution even when the replacement has identical values', () => {
    const first = {id: 'same', name: 'same'}, second = {...first}
    const mirror = shallowReactive<DataRow>({})
    syncReactiveRow(mirror, first, true)
    const resolved = computed(() => resolveReactiveRow(mirror))
    expect(resolved.value).toBe(first)
    syncReactiveRow(mirror, second, true)
    expect(resolved.value).toBe(second)
    expect(JSON.stringify(mirror)).toBe(JSON.stringify(second))
    syncReactiveRow(mirror, null, true)
    expect(resolved.value).toBeNull()
  })

  it('propagates source identity through a second standard container mirror', () => {
    const first = {id: 'A'}, second = {id: 'B'}
    const outer = shallowReactive<DataRow>({}), inner = shallowReactive<DataRow>({})
    syncReactiveRow(outer, first, true)
    syncReactiveRow(inner, outer)
    const resolved = computed(() => resolveReactiveRow(inner))
    expect(resolved.value).toBe(first)
    syncReactiveRow(outer, second, true)
    syncReactiveRow(inner, outer)
    expect(resolved.value).toBe(second)
    syncReactiveRow(inner, {id: 'plain'})
    expect(resolved.value).toBe(inner)
    syncReactiveRow(inner, first, true)
    expect(resolved.value).toBe(first)
  })
})
