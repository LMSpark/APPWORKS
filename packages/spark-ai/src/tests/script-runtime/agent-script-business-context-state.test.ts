import { describe, expect, it } from 'vitest'

import { executeAiNativeScript } from '../../agent/native-runtime/native-script-runner'
import type { AiRuntimeApiMetadataJson } from '../../class-model'

class RuntimeChild {
  public constructor(private readonly id: string) {}

  public readLabel(input: { prefix: string }): string {
    return `${input.prefix}:${this.id}`
  }
}

class RuntimeParent {
  public readonly child: RuntimeChild

  public constructor(id: string) {
    this.child = new RuntimeChild(id)
  }

  public readChildLabel(input: { prefix: string }): string {
    return this.child.readLabel(input)
  }
}

class AgentBusinessContext {
  public parent: RuntimeParent | undefined

  public createParent(input: { id: string }): RuntimeParent {
    this.parent = new RuntimeParent(input.id)
    return this.parent
  }
}

const stringSchema = { type: 'string' } as const

const childApi = {
  kind: 'runtimechild',
  name: 'RuntimeChild',
  description: 'Child model created by RuntimeParent constructor.',
  actions: [
    {
      name: 'readLabel',
      methodName: 'readLabel',
      description: 'Read the label from the child instance.',
      paramsSchema: {
        type: 'object',
        properties: { prefix: stringSchema },
        required: ['prefix'],
        additionalProperties: false,
      },
    },
  ],
} satisfies AiRuntimeApiMetadataJson['rootApi']

const parentApi = {
  kind: 'runtimeparent',
  name: 'RuntimeParent',
  description: 'Parent model whose real constructor materializes child.',
  actions: [
    {
      name: 'readChildLabel',
      methodName: 'readChildLabel',
      description: 'Read child label through the parent instance.',
      paramsSchema: {
        type: 'object',
        properties: { prefix: stringSchema },
        required: ['prefix'],
        additionalProperties: false,
      },
    },
  ],
  attributes: [
    {
      name: 'child',
      description: 'Child assigned by the RuntimeParent constructor.',
      schema: { type: 'object' },
      readable: true,
      writable: false,
      api: childApi,
    },
  ],
} satisfies AiRuntimeApiMetadataJson['rootApi']

const metadata = {
  schemaVersion: 1,
  rootApi: {
    kind: 'agentbusinesscontext',
    name: 'AgentBusinessContext',
    description: 'Agent business context that stores runtime state across model_script calls.',
    actions: [
      {
        name: 'createParent',
        methodName: 'createParent',
        description: 'Create a parent using the real constructor and store it on this context.',
        paramsSchema: {
          type: 'object',
          properties: { id: stringSchema },
          required: ['id'],
          additionalProperties: false,
        },
        resultApis: [
          { resultPath: [], api: parentApi },
          { resultPath: ['child'], api: childApi },
        ],
      },
    ],
    attributes: [
      {
        name: 'parent',
        description: 'Parent stored by createParent on the real business context.',
        schema: { type: 'object' },
        readable: true,
        writable: false,
        api: parentApi,
      },
    ],
  },
} satisfies AiRuntimeApiMetadataJson

describe('model_script business context state', () => {
  it('runs JavaScript FC script against a real context object and preserves state across turns', async () => {
    const instance = new AgentBusinessContext()

    const createAndRead = await executeAiNativeScript({
      instance,
      metadata,
      script: [
        'const parent = await this.createParent({ id: "orders" })',
        'return await parent.child.readLabel({ prefix: "created" })',
      ].join('\n'),
    })

    expect(createAndRead.ok).toBe(true)
    expect(createAndRead.data).toBe('created:orders')
    expect(instance.parent).toBeInstanceOf(RuntimeParent)
    expect(instance.parent?.child).toBeInstanceOf(RuntimeChild)

    const readStoredState = await executeAiNativeScript({
      instance,
      metadata,
      script: 'return await this.parent.child.readLabel({ prefix: "stored" })',
    })

    expect(readStoredState.ok).toBe(true)
    expect(readStoredState.data).toBe('stored:orders')
  })

  it('keeps direct facade assignment local to the current script call', async () => {
    const instance = new AgentBusinessContext()

    const directAssignment = await executeAiNativeScript({
      instance,
      metadata,
      script: [
        'this.parent = { child: { readLabel: () => "fake" } }',
        'return this.parent.child.readLabel({ prefix: "ignored" })',
      ].join('\n'),
    })

    expect(directAssignment.ok).toBe(true)
    expect(directAssignment.data).toBe('fake')
    expect(instance.parent).toBeUndefined()

    const nextTurnRead = await executeAiNativeScript({
      instance,
      metadata,
      script: 'return await this.parent.child.readLabel({ prefix: "stored" })',
    })

    expect(nextTurnRead.ok).toBe(false)
  })
})
