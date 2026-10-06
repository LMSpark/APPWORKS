import { describe, expect, it } from 'vitest'
import {
  assertPageDesignRunGateAllowed,
  bindPageDesignRunContext,
  bindPageDesignRunContextFromAgentArgs,
  clearPageDesignRunContext,
  evaluatePageDesignMutationToolGate,
  evaluatePageDesignScriptOperationGate,
  isPageDesignMutationTool,
  readPageDesignGateState,
  readPageDesignRunContext,
  validatePageDesignRunGate,
} from '@/services/page-design/page-design-gates'
const SCENARIO_ONLY_OPERATIONS = { nodeTree: false, dataSet: true, script: false, style: false, blueprint: false } as const
import type { ProjectPageNodeSummary } from '@spark-appworks/spark-project-model'

describe('pageDesign save scope input', () => {
  it.each([[], ['unknown.json'], ['script.js', 'unknown.json'], [17], ['script.js', null],
    null, 'script.js', { file: 'script.js' }].map(value => ({ value })))('rejects invalid scope $value without replacing the existing context', ({ value }) => {
    bindPageDesignRunContext('orders', { pageId: 'orders', deliverySaveFileNames: ['script.js'] })
    try {
      expect(() => bindPageDesignRunContextFromAgentArgs('orders', { deliverySaveFileNames: value }))
        .toThrow('PAGE_DESIGN_SAVE_SCOPE_INVALID')
      expect(readPageDesignRunContext('orders')?.deliverySaveFileNames).toEqual(['script.js'])
    } finally { clearPageDesignRunContext('orders') }
  })

  it('rejects an explicitly empty typed context', () => {
    expect(() => bindPageDesignRunContext('orders', { pageId: 'orders', deliverySaveFileNames: [] }))
      .toThrow('PAGE_DESIGN_SAVE_SCOPE_INVALID')
    expect(readPageDesignRunContext('orders')).toBeUndefined()
  })

  it('captures a valid selection and preserves it when subsequent args omit the scope', () => {
    const names = ['script.js']
    bindPageDesignRunContextFromAgentArgs('orders', { pageId: 'orders', deliverySaveFileNames: names })
    try {
      names.push('rule.json')
      bindPageDesignRunContextFromAgentArgs('orders', { description: 'update' })
      expect(readPageDesignRunContext('orders')?.deliverySaveFileNames).toEqual(['script.js'])
    } finally { clearPageDesignRunContext('orders') }
  })
})

function createSummary(
  overrides: Partial<ProjectPageNodeSummary> = {},
): ProjectPageNodeSummary {
  return {
    pageId: 'orders',
    path: '/orders',
    title: '订单',
    nodeId: 'orders-node',
    nodeKind: 'page',
    designSurface: 'config-files',
    description: '订单列表',
    descriptionContext: [],
    effectiveDescription: '订单列表页',
    ...overrides,
  }
}

describe('readPageDesignGateState', () => {
  it('marks planningReady when effectiveDescription is non-empty', () => {
    expect(readPageDesignGateState(createSummary()).planningReady).toBe(true)
  })

  it('marks planningReady false when effectiveDescription is empty', () => {
    expect(readPageDesignGateState(createSummary({ effectiveDescription: '' })).planningReady).toBe(false)
  })

  it('fails closed when gate fields are omitted', () => {
    expect(readPageDesignGateState(createSummary())).toMatchObject({
      implGate: 'closed',
      upstreamContractsSatisfied: false,
    })
  })
})

describe('validatePageDesignRunGate', () => {
  it('rejects when planning is not ready', () => {
    const result = validatePageDesignRunGate({
      pageId: 'orders',
      planningReady: false,
      implGate: 'open',
      upstreamContractsSatisfied: true,
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('PLANNING_DRAFT')
  })

  it('rejects closed impl gate', () => {
    const result = validatePageDesignRunGate({
      pageId: 'orders',
      planningReady: true,
      implGate: 'closed',
      upstreamContractsSatisfied: true,
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('IMPL_GATE_CLOSED')
  })

  it('allows ready + open gate', () => {
    expect(validatePageDesignRunGate({
      pageId: 'orders',
      planningReady: true,
      implGate: 'open',
      upstreamContractsSatisfied: true,
    }).ok).toBe(true)
  })
})

describe('assertPageDesignRunGateAllowed', () => {
  it('throws when impl gate is closed', () => {
    expect(() => assertPageDesignRunGateAllowed(createSummary({ implGate: 'closed' }))).toThrow(/implGate=closed/u)
  })
})

describe('evaluatePageDesignMutationToolGate', () => {
  it('allows read-only tools when gate is closed', () => {
    const summary = createSummary({ implGate: 'closed' })
    expect(evaluatePageDesignMutationToolGate({
      toolName: 'model_class_guide',
      summary,
    }).ok).toBe(true)
  })

  it('rejects model_script when gate is closed', () => {
    const summary = createSummary({ implGate: 'closed' })
    expect(evaluatePageDesignMutationToolGate({
      toolName: 'model_script',
      summary,
    }).ok).toBe(false)
  })
})

describe('isPageDesignMutationTool', () => {
  it('detects model_script and writePageFile', () => {
    expect(isPageDesignMutationTool('model_script')).toBe(true)
    expect(isPageDesignMutationTool('writePageFile')).toBe(true)
    expect(isPageDesignMutationTool('model_class_guide')).toBe(false)
  })
})

describe('evaluatePageDesignScriptOperationGate', () => {
  it('allows loadScenarioViews when dataSet-only preset is active', () => {
    const result = evaluatePageDesignScriptOperationGate({
      toolName: 'model_script',
      allowedOperations: SCENARIO_ONLY_OPERATIONS,
      args: {
        script: [
          'const page = await this.openPageDesign({ pageId: "orders" })',
          'await page.loadScenarioViews(tool => tool.addTable({ id: "orders", title: "Orders" }))',
        ].join('\n'),
      },
    })
    expect(result.ok).toBe(true)
  })

  it('rejects editNodeTree under dataSet-only preset', () => {
    const result = evaluatePageDesignScriptOperationGate({
      toolName: 'model_script',
      allowedOperations: SCENARIO_ONLY_OPERATIONS,
      args: {
        script: 'await this.openPageDesign({ pageId: "orders" }).editNodeTree(t => t)',
      },
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('editNodeTree')
  })

  it('does not restrict script when allowedOperations is omitted', () => {
    const result = evaluatePageDesignScriptOperationGate({
      toolName: 'model_script',
      args: {
        script: 'await this.openPageDesign({ pageId: "orders" }).editNodeTree(t => t)',
      },
    })
    expect(result.ok).toBe(true)
  })
})

describe('evaluatePageDesignMutationToolGate with allowedOperations', () => {
  it('rejects empty effectiveDescription before script marker checks', () => {
    const result = evaluatePageDesignMutationToolGate({
      toolName: 'model_script',
      summary: createSummary({
        effectiveDescription: '',
      }),
      allowedOperations: SCENARIO_ONLY_OPERATIONS,
      toolArgs: { script: 'await this.openPageDesign({ pageId: "orders" }).loadScenarioViews(() => {})' },
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('effectiveDescription')
  })
})
