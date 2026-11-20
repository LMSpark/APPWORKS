import {afterEach, describe, expect, it, vi} from 'vitest'
import {LowcodeApiError, type LowcodeProjectBlueprintRecord} from '@spark-appworks/spark-lowcode-api'
import {
  lowcodeApi,
  resolveLowcodePagePublication,
  resolveLowcodePageNavigationReceipt,
} from '@/lowcode/lowcode-runtime'
import {createPageToolPublicationManifest} from '@/services/project/page-tool-publication'

function saveExecutionScope(applicationId: string): void {
  lowcodeApi.session.save({
    accessToken: 'access', refreshToken: 'refresh',
    accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
    identity: {userId: 'USER', account: 'fixture', displayName: 'Fixture', enterpriseId: 'TENANT',
      enterpriseShortName: 'tenant', role: null, raw: {}},
    enterprise: {id: 'TENANT', name: 'Tenant', code: 'TENANT', shortName: 'tenant',
      shortCode: 'tenant', raw: {}},
  })
  lowcodeApi.application.save({
    application: {id: applicationId, code: applicationId, name: applicationId, description: '',
      enterpriseId: 'TENANT', enterpriseShortName: 'tenant', isDefault: false},
    navigationRootId: 'ROOT',
  })
}

function blueprintRecord(applicationId: string, pageId: string, versionId: string): LowcodeProjectBlueprintRecord {
  return {
    nodeId: 'NODE', parentNodeId: 'ROOT', projectId: applicationId, kind: 'page',
    capability: {name: pageId},
    navigation: {
      title: pageId, target: `cfg:${pageId}`, order: 0,
      publishInMenu: true, showChildren: true, beginGroup: false,
    },
    dataSpace: {scenarioId: 'SCENE', models: []},
    source: {VersionId: versionId},
  }
}

const authorizedNode = {
  id: 'NODE', target: 'cfg:TOOL', targetKind: 'cfg' as const, formKey: null, children: [],
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  lowcodeApi.application.clear()
  lowcodeApi.session.clear()
})

describe('lowcode page publication resolver', () => {
  it('reads the manifest by the host pointer without carrying a version in navigation', async () => {
    saveExecutionScope('APP')
    const manifest = await createPageToolPublicationManifest({
      pageId: 'TOOL',
      files: [
        {fileName: 'rule.json', version: 2, text: '[]'},
        {fileName: 'script.js', version: 3, text: ''},
        {fileName: 'style.css', version: 4, text: ''},
      ],
      pagedata: [{
        scenarioId: 'SCENE', version: 5, sourceRevision: 'source-proof',
        text: JSON.stringify({scenarioId: 'SCENE', tables: {}}),
      }],
    })
    vi.spyOn(lowcodeApi.blueprint, 'readRecords').mockResolvedValue([
      blueprintRecord('APP', 'TOOL', 'rule=2;script=3;style=4;manifest=6'),
    ])
    const readBytes = vi.spyOn(lowcodeApi.design, 'readFileBytes')
      .mockResolvedValue(new TextEncoder().encode(`${JSON.stringify(manifest)}\n`))

    const resolution = await resolveLowcodePagePublication({
      projectId: 'APP', nodeId: 'NODE', pageId: 'TOOL', scenarioIds: ['SCENE'],
    })

    expect(resolution?.manifest?.sourceRevision).toBe(manifest.sourceRevision)
    expect(resolution?.publicationRef).toBe('rule=2;script=3;style=4;manifest=6')
    expect(readBytes).toHaveBeenCalledExactlyOnceWith({
      appType: 'designfile', customPath: 'APP/TOOL', fileName: '6__publication-manifest.json',
    })
  })

  describe('lowcode page navigation receipt', () => {
    it.each([
      ['AUTH_MISSING', undefined],
      ['BLUEPRINT_ONLY', []],
    ] as const)('reports %s before materializing a page', async (state, authorization) => {
      if (state === 'BLUEPRINT_ONLY') {
        saveExecutionScope('APP-RECEIPT')
        vi.spyOn(lowcodeApi.blueprint, 'readRecords').mockResolvedValue([
          blueprintRecord('APP-RECEIPT', 'TOOL', ''),
        ])
        vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockResolvedValue({
          items: authorization, contexts: [],
        })
      }
      const result = await resolveLowcodePageNavigationReceipt({
        projectId: 'APP-RECEIPT', nodeId: 'NODE', pageId: 'TOOL',
        mainScenarioId: 'SCENE', scenarioIds: ['SCENE'],
      })
      expect(result.state).toBe(state)
    })

    it('distinguishes missing manifest, scenario and identity requirements', async () => {
      saveExecutionScope('APP-STATES')
      vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockResolvedValue({
        items: [authorizedNode], contexts: [],
      })
      const records = vi.spyOn(lowcodeApi.blueprint, 'readRecords')
      records.mockResolvedValue([blueprintRecord('APP-STATES', 'TOOL', '')])
      const command = {
        projectId: 'APP-STATES', nodeId: 'NODE', pageId: 'TOOL',
        mainScenarioId: 'SCENE', scenarioIds: ['SCENE'],
      }
      await expect(resolveLowcodePageNavigationReceipt(command)).resolves.toMatchObject({state: 'MANIFEST_MISSING'})

      await expect(resolveLowcodePageNavigationReceipt({
        ...command, mainScenarioId: 'OTHER', scenarioIds: ['OTHER'],
      })).resolves.toMatchObject({state: 'IDENTITY_CONFLICT'})

      const missingScenario = blueprintRecord('APP-STATES', 'TOOL', '')
      Reflect.deleteProperty(missingScenario, 'dataSpace')
      records.mockResolvedValue([missingScenario])
      await expect(resolveLowcodePageNavigationReceipt(command)).resolves.toMatchObject({state: 'SCENARIO_MISSING'})
    })

    it('returns READY only after the authorized manifest and every file proof match', async () => {
      saveExecutionScope('APP-READY')
      const files = {'rule.json': '[]', 'script.js': '', 'style.css': ''} as const
      const manifest = await createPageToolPublicationManifest({
        pageId: 'TOOL',
        files: [
          {fileName: 'rule.json', version: 2, text: files['rule.json']},
          {fileName: 'script.js', version: 3, text: files['script.js']},
          {fileName: 'style.css', version: 4, text: files['style.css']},
        ],
        pagedata: [{
          scenarioId: 'SCENE', version: 5, sourceRevision: 'proof',
          text: JSON.stringify({scenarioId: 'SCENE', tables: {}}),
        }],
      })
      vi.spyOn(lowcodeApi.blueprint, 'readRecords').mockResolvedValue([
        blueprintRecord('APP-READY', 'TOOL', 'rule=2;script=3;style=4;manifest=6'),
      ])
      vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockResolvedValue({
        items: [authorizedNode], contexts: [],
      })
      vi.spyOn(lowcodeApi.design, 'readFileBytes')
        .mockResolvedValue(new TextEncoder().encode(JSON.stringify(manifest)))
      const receipt = await resolveLowcodePageNavigationReceipt({
        projectId: 'APP-READY', nodeId: 'NODE', pageId: 'TOOL',
        mainScenarioId: 'SCENE', scenarioIds: ['SCENE'],
      }, async commands => commands.map(command => files[command.fileName]))

      expect(receipt).toMatchObject({state: 'READY', publication: {publicationRef: 'rule=2;script=3;style=4;manifest=6'}})
      expect(receipt.files?.map(file => file.fileName)).toEqual(['rule.json', 'script.js', 'style.css'])
    })

    it('downgrades a readable manifest to IDENTITY_CONFLICT when a file proof was altered', async () => {
      saveExecutionScope('APP-PROOF')
      const manifest = await createPageToolPublicationManifest({
        pageId: 'TOOL',
        files: [
          {fileName: 'rule.json', version: 2, text: '[]'},
          {fileName: 'script.js', version: 3, text: ''},
          {fileName: 'style.css', version: 4, text: ''},
        ],
        pagedata: [{
          scenarioId: 'SCENE', version: 5, sourceRevision: 'proof',
          text: JSON.stringify({scenarioId: 'SCENE', tables: {}}),
        }],
      })
      vi.spyOn(lowcodeApi.blueprint, 'readRecords').mockResolvedValue([
        blueprintRecord('APP-PROOF', 'TOOL', 'rule=2;script=3;style=4;manifest=6'),
      ])
      vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockResolvedValue({
        items: [authorizedNode], contexts: [],
      })
      vi.spyOn(lowcodeApi.design, 'readFileBytes')
        .mockResolvedValue(new TextEncoder().encode(JSON.stringify(manifest)))
      await expect(resolveLowcodePageNavigationReceipt({
        projectId: 'APP-PROOF', nodeId: 'NODE', pageId: 'TOOL',
        mainScenarioId: 'SCENE', scenarioIds: ['SCENE'],
      }, async commands => commands.map(command => command.fileName === 'rule.json' ? 'tampered' : '')))
        .resolves.toMatchObject({state: 'IDENTITY_CONFLICT'})
    })
  })

  it('fails closed when the manifest conflicts with the three-file pointer', async () => {
    saveExecutionScope('APP-CONFLICT')
    const manifest = await createPageToolPublicationManifest({
      pageId: 'TOOL',
      files: [
        {fileName: 'rule.json', version: 2, text: '[]'},
        {fileName: 'script.js', version: 3, text: ''},
        {fileName: 'style.css', version: 4, text: ''},
      ],
      pagedata: [],
    })
    vi.spyOn(lowcodeApi.blueprint, 'readRecords').mockResolvedValue([
      blueprintRecord('APP-CONFLICT', 'TOOL', 'rule=9;script=3;style=4;manifest=6'),
    ])
    vi.spyOn(lowcodeApi.design, 'readFileBytes')
      .mockResolvedValue(new TextEncoder().encode(JSON.stringify(manifest)))

    await expect(resolveLowcodePagePublication({
      projectId: 'APP-CONFLICT', nodeId: 'NODE', pageId: 'TOOL', scenarioIds: [],
    })).rejects.toThrow('PAGE_PUBLICATION_POINTER_CONFLICT')
  })

  it('reports a missing manifest snapshot instead of falling back to working files', async () => {
    saveExecutionScope('APP-MISSING')
    vi.spyOn(lowcodeApi.blueprint, 'readRecords').mockResolvedValue([
      blueprintRecord('APP-MISSING', 'TOOL', 'rule=2;script=3;style=4;manifest=6'),
    ])
    vi.spyOn(lowcodeApi.design, 'readFileBytes').mockRejectedValue(new LowcodeApiError(404, 'missing'))

    await expect(resolveLowcodePagePublication({
      projectId: 'APP-MISSING', nodeId: 'NODE', pageId: 'TOOL', scenarioIds: ['SCENE'],
    })).rejects.toThrow('PAGE_PUBLICATION_MANIFEST_MISSING')
  })

  it('rejects legacy three-file VersionId without a manifest', async () => {
    saveExecutionScope('APP-LEGACY')
    vi.spyOn(lowcodeApi.blueprint, 'readRecords').mockResolvedValue([
      blueprintRecord('APP-LEGACY', 'LEGACY', '8'),
    ])
    const readBytes = vi.spyOn(lowcodeApi.design, 'readFileBytes')

    await expect(resolveLowcodePagePublication({
      projectId: 'APP-LEGACY', nodeId: 'NODE', pageId: 'LEGACY', scenarioIds: ['SCENE'],
    })).rejects.toThrow('PAGE_PUBLICATION_MANIFEST_MISSING')
    expect(readBytes).not.toHaveBeenCalled()
  })
})
