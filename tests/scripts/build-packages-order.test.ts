import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePackagesInBuildOrder } from '../../scripts/lib/sort-packages-by-dependency.mjs'

const PACKAGES_DIR = resolve(process.cwd(), 'packages')

describe('build-packages ordering', () => {
  it('places spark-utils before dependents and spark-app near the end', () => {
    const order = resolvePackagesInBuildOrder(PACKAGES_DIR)
    const utilsIndex = order.indexOf('spark-utils')
    const dataIndex = order.indexOf('spark-data')
    const componentIndex = order.indexOf('spark-component')
    const appIndex = order.indexOf('spark-app')

    expect(utilsIndex).toBe(0)
    expect(dataIndex).toBeGreaterThan(utilsIndex)
    expect(componentIndex).toBeGreaterThan(dataIndex)
    expect(appIndex).toBeGreaterThan(componentIndex)
  })

  it('filters --only selection while preserving dependency order', () => {
    const order = resolvePackagesInBuildOrder(PACKAGES_DIR, ['spark-data', 'spark-utils'])
    expect(order).toEqual(['spark-utils', 'spark-data'])
  })

  it('expands --only with transitive workspace dependencies', () => {
    const order = resolvePackagesInBuildOrder(PACKAGES_DIR, ['spark-ai'])
    expect(order).toEqual([
      'spark-utils',
      'spark-json-document',
      'spark-ai',
    ])
  })
})
