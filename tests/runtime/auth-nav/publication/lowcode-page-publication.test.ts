import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import * as runtimeSpace from '@/platform-adapters/data-space/lowcode-data-space-runtime'
import blueprintFileConfig from '../../../../config/pages/application/project-blueprint/pagedata.json'
import { LowcodeApiError } from '@/platform-adapters/api'
import type {ProjectBlueprintRecord} from '@spark-appworks/spark-project-model'
import {
  lowcodeApi,
  lowcodeBlueprintRecords,
  lowcodeNavigationAuthorization,
  resolveLowcodePagePublication,
  resolveLowcodePageNavigationReceipt,
} from '@/platform-adapters/lowcode-runtime'
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

function blueprintRecord(applicationId: string, pageId: string, versionId: string): ProjectBlueprintRecord {
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
    vi.spyOn(lowcodeBlueprintRecords, 'readRecords').mockResolvedValue([
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
        vi.spyOn(lowcodeBlueprintRecords, 'readRecords').mockResolvedValue([
          blueprintRecord('APP-RECEIPT', 'TOOL', ''),
        ])
        vi.spyOn(lowcodeNavigationAuthorization, 'readNavigationAuthorization').mockResolvedValue({
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
      vi.spyOn(lowcodeNavigationAuthorization, 'readNavigationAuthorization').mockResolvedValue({
        items: [authorizedNode], contexts: [],
      })
      const records = vi.spyOn(lowcodeBlueprintRecords, 'readRecords')
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
      vi.spyOn(lowcodeBlueprintRecords, 'readRecords').mockResolvedValue([
        blueprintRecord('APP-READY', 'TOOL', 'rule=2;script=3;style=4;manifest=6'),
      ])
      vi.spyOn(lowcodeNavigationAuthorization, 'readNavigationAuthorization').mockResolvedValue({
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
      vi.spyOn(lowcodeBlueprintRecords, 'readRecords').mockResolvedValue([
        blueprintRecord('APP-PROOF', 'TOOL', 'rule=2;script=3;style=4;manifest=6'),
      ])
      vi.spyOn(lowcodeNavigationAuthorization, 'readNavigationAuthorization').mockResolvedValue({
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
    vi.spyOn(lowcodeBlueprintRecords, 'readRecords').mockResolvedValue([
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
    vi.spyOn(lowcodeBlueprintRecords, 'readRecords').mockResolvedValue([
      blueprintRecord('APP-MISSING', 'TOOL', 'rule=2;script=3;style=4;manifest=6'),
    ])
    vi.spyOn(lowcodeApi.design, 'readFileBytes').mockRejectedValue(new LowcodeApiError(404, 'missing'))

    await expect(resolveLowcodePagePublication({
      projectId: 'APP-MISSING', nodeId: 'NODE', pageId: 'TOOL', scenarioIds: ['SCENE'],
    })).rejects.toThrow('PAGE_PUBLICATION_MANIFEST_MISSING')
  })

  it('rejects legacy three-file VersionId without a manifest', async () => {
    saveExecutionScope('APP-LEGACY')
    vi.spyOn(lowcodeBlueprintRecords, 'readRecords').mockResolvedValue([
      blueprintRecord('APP-LEGACY', 'LEGACY', '8'),
    ])
    const readBytes = vi.spyOn(lowcodeApi.design, 'readFileBytes')

    await expect(resolveLowcodePagePublication({
      projectId: 'APP-LEGACY', nodeId: 'NODE', pageId: 'LEGACY', scenarioIds: ['SCENE'],
    })).rejects.toThrow('PAGE_PUBLICATION_MANIFEST_MISSING')
    expect(readBytes).not.toHaveBeenCalled()
  })
})

describe('a new production navigation receipt reads original snapshot bytes again',()=>{
  it.each(['same-session-denied','same-person-new-session','exact-snapshot-missing','still-authorized'] as const)('uses the current file result for %s',async variant=>{
    const applicationId=`APP-REOPEN-${variant}`
    saveExecutionScope(applicationId)
    const files=[
      {fileName:'rule.json',version:2,text:'[]'},
      {fileName:'script.js',version:3,text:''},
      {fileName:'style.css',version:4,text:'.probe {}'},
    ] as const
    const manifest=await createPageToolPublicationManifest({pageId:'TOOL',files,pagedata:[{
      scenarioId:'SCENE',version:5,sourceRevision:'proof',text:JSON.stringify({scenarioId:'SCENE',tables:{}}),
    }]})
    const versionId='rule=2;script=3;style=4;manifest=6'
    vi.spyOn(lowcodeBlueprintRecords,'readRecords').mockResolvedValue([blueprintRecord(applicationId,'TOOL',versionId)])
    vi.spyOn(lowcodeNavigationAuthorization,'readNavigationAuthorization').mockResolvedValue({items:[authorizedNode],contexts:[]})
    const owners:DataSet[]=[]
    vi.spyOn(runtimeSpace,'loadLowcodeRuntimeScenario').mockImplementation(async command=>{
      expect(command.projectId).toBe(applicationId)
      const owner=DataSet.fromJson({scenarioId:command.scenarioId,tables:{ProjectToolFile:blueprintFileConfig.tables.ProjectToolFile}})
      owners.push(owner)
      return owner
    })
    const encoder=new TextEncoder()
    const storage=new Map<string,string>(files.map(item=>[`${item.version}__${item.fileName}`,item.text]))
    const manifestName='6__publication-manifest.json'
    let denied:string|null=null,absent:string|null=null
    const rawRead=vi.spyOn(lowcodeApi.design,'readFileBytes').mockImplementation(async locator=>{
      expect(locator).toMatchObject({appType:'designfile',customPath:`${applicationId}/TOOL`})
      if(locator.fileName===denied)throw new LowcodeApiError(403,'denied')
      if(locator.fileName===absent)throw new LowcodeApiError(404,'missing')
      if(locator.fileName===manifestName)return encoder.encode(JSON.stringify(manifest))
      const file=storage.get(locator.fileName)
      if(file===undefined)throw new Error('unexpected file name')
      return encoder.encode(file)
    })
    const command={projectId:applicationId,nodeId:'NODE',pageId:'TOOL',mainScenarioId:'SCENE',scenarioIds:['SCENE']}
    await expect(resolveLowcodePageNavigationReceipt(command)).resolves.toMatchObject({state:'READY'})
    expect(owners).toHaveLength(1)
    expect(owners[0]?.destroyed).toBe(true)
    expect(rawRead).toHaveBeenCalledTimes(4)
    if(variant==='same-person-new-session'){
      const session=lowcodeApi.session.get()
      if(!session)throw new Error('fixture session missing')
      lowcodeApi.session.clear()
      lowcodeApi.session.save({...session,accessToken:'a-different-fixture-session'})
      denied=manifestName
    }else if(variant==='same-session-denied')denied='4__style.css'
    else if(variant==='exact-snapshot-missing')absent='4__style.css'
    const next=await resolveLowcodePageNavigationReceipt(command)
    expect(next.state).toBe(variant==='still-authorized'?'READY':'MANIFEST_MISSING')
    expect(rawRead).toHaveBeenCalledTimes(variant==='same-person-new-session'?5:8)
    expect(owners).toHaveLength(variant==='same-person-new-session'?1:2)
    expect(owners.every(owner=>owner.destroyed)).toBe(true)
  })
})
