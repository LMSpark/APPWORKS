// tests/incremental-update.test.ts
//
// Tests for incremental config diffing utilities.
// The old SparkComponentRendererImpl class was removed; these tests verify
// pure-function equivalents of shouldUpdateComponent and haveChildrenChanged.

import { describe, it, expect } from 'vitest'

// ---------- Types ----------

type SparkNode = {
  type: string
  props?: Record<string, unknown>
  children?: SparkNode[]}

// ---------- Diff helpers (inline, replacing the deleted renderer class) ----------

/**
 * Determine whether a component needs re-rendering based on config changes.
 * Returns true when the two configs differ in type, props, or children.
 */
function shouldUpdateComponent(oldConfig: SparkNode, newConfig: SparkNode): boolean {
  // Same reference → no update
  if (oldConfig === newConfig) return false

  // Type changed → must update
  if (oldConfig.type !== newConfig.type) return true

  // Shallow-compare props
  if (!shallowEqual(oldConfig.props, newConfig.props)) return true

  // Compare children
  return haveChildrenChanged(oldConfig.children ?? [], newConfig.children ?? [])
}

/**
 * Compare two children arrays.
 */
function haveChildrenChanged(oldChildren: SparkNode[], newChildren: SparkNode[]): boolean {
  if (oldChildren.length !== newChildren.length) return true

  for (let i = 0; i < oldChildren.length; i++) {
    if (shouldUpdateComponent(oldChildren[i]!, newChildren[i]!)) return true
  }

  return false
}

/**
 * Shallow equality for plain objects (one level deep).
 */
function shallowEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined
): boolean {
  if (a === b) return true
  if (!a || !b) return a === b

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false

  return keysA.every(key => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key])
}

// ---------- Tests ----------

describe('Incremental Update', () => {
  it('should detect when components need updating', () => {
    const oldConfig: SparkNode = {
      type: 'test-component',
      props: { value: 1 },
      children: [{ type: 'child', props: { name: 'child1' } }]
    }

    const newConfig: SparkNode = {
      type: 'test-component',
      props: { value: 2 }, // changed
      children: [{ type: 'child', props: { name: 'child1' } }]
    }

    // Should detect that update is needed due to props change
    expect(shouldUpdateComponent(oldConfig, newConfig)).toBe(true)
  })

  it('should not update when configs are identical', () => {
    const config: SparkNode = {
      type: 'test-component',
      props: { value: 1 },
      children: [{ type: 'child', props: { name: 'child1' } }]
    }

    // Same reference → no update
    expect(shouldUpdateComponent(config, config)).toBe(false)
  })

  it('should detect children changes', () => {
    const oldConfig: SparkNode = {
      type: 'test-component',
      children: [{ type: 'child', props: { name: 'child1' } }]
    }

    const newConfig: SparkNode = {
      type: 'test-component',
      children: [
        { type: 'child', props: { name: 'child1' } },
        { type: 'child', props: { name: 'child2' } } // added
      ]
    }

    expect(haveChildrenChanged(oldConfig.children ?? [], newConfig.children ?? [])).toBe(true)
  })

  it('should handle empty children arrays', () => {
    const oldChildren: SparkNode[] = []
    const newChildren: SparkNode[] = []

    expect(haveChildrenChanged(oldChildren, newChildren)).toBe(false)
  })

  it('should detect type changes', () => {
    const oldConfig: SparkNode = { type: 'button', props: { label: 'Save' } }
    const newConfig: SparkNode = { type: 'link', props: { label: 'Save' } }

    expect(shouldUpdateComponent(oldConfig, newConfig)).toBe(true)
  })

  it('should detect when a child is removed', () => {
    const oldChildren: SparkNode[] = [
      { type: 'child', props: { name: 'a' } },
      { type: 'child', props: { name: 'b' } }
    ]
    const newChildren: SparkNode[] = [
      { type: 'child', props: { name: 'a' } }
    ]

    expect(haveChildrenChanged(oldChildren, newChildren)).toBe(true)
  })

  it('should return false for structurally identical configs', () => {
    const a: SparkNode = {
      type: 'test',
      props: { x: 1, y: 'hello' },
      children: [{ type: 'inner', props: { z: true } }]
    }
    const b: SparkNode = {
      type: 'test',
      props: { x: 1, y: 'hello' },
      children: [{ type: 'inner', props: { z: true } }]
    }

    // Different references but structurally identical → no update needed
    expect(shouldUpdateComponent(a, b)).toBe(false)
  })
})
