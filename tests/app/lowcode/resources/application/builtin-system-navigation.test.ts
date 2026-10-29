import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {builtinSystemApplication, parseBuiltinSystemNavigation, readBuiltinSystemNavigation} from '@/lowcode/resources/shared/builtin-system-navigation'

const rootId = 'D99A1DCE9894698799101EFD70F8FC76'
const pageId = '0C70F74793F9E858B71E0DBDEC784D57'
const publishedIds=[
  'D99A1DCE9894698799101EFD70F8FC76','78C58A7FE34F2987267A1E8AF10B2990','348D1C50B204C779AABBE2489C5E2FDF',
  'A133D679691178F192D7E9DA06829506','A0FA2BA0CF0C82B40DF6A319A3D5831D','0C70F74793F9E858B71E0DBDEC784D57',
  'FFDEF2AED3E19A38C0FCDDC748CF939B','36B01771C627B9BF5CD493DC75B996A1','28F30060CD75BA684B28EEF07732CB72',
  '62DB03B06A489600FFF86F3640D5C0E7','EDB0E34486FFB903E896E5C281230961','8CBB62EBC873A38DB9E6EEF177AFC731',
  'A63ED0065A3692044913565A16E16D67','A8FB2B2B161125A16FD15ED9581CD15B','EB720370EF06A5A656838F87E0716D6B',
  'BBA48156BAF054754E038C3A4FCBCD65','55A2B31E13461FF55D7495D6CC4EE7FB','62DA8FCF193CDF0CBA4464726E76338C',
  'A2D63AB2AAEF156E7727094A23AEA433','5E9676B1E38860B023921F48FB4370DE','E0BB79BA59101F76628F1448D6351B4E',
  'CB52B21B26AD20AADDC4498613C3078D','C24764B008CAE96205D6AA6C8487FE52','90A82E287930A234FEC3E687C94A93EA',
  'A73BFB70B8EA48FA84C4D8F3CD4F20BD','6DA2948858EE3C55476751E2722EE0B4',
]
const source=JSON.parse(readFileSync('config/navigation/appworks-system.json','utf8')) as Record<string,unknown>
const evidence=JSON.parse(readFileSync('notes/evidence/workbench-tool-mapping-20261029/builtin-blueprint-business-records.json','utf8')) as {
  applicationId:string
  businessFields:string[]
  rows:Array<Record<string,unknown>>
}

describe('AppWorks repository navigation source', () => {
  it('loads the declared root and the registered Vue subset from the application source', async () => {
    const application = builtinSystemApplication()
    const navigation = await readBuiltinSystemNavigation()
    expect(application).toEqual({id: rootId, name: '软件工坊[AppWorks]'})
    expect(navigation.navigationRootId).toBe(application.id)
    expect(navigation.nodes.filter(item => item.kind === 'Navitem')).toHaveLength(18)
    expect(navigation.nodes.some(item => item.id === pageId
      && item.url === 'vue:/features/application/application-manager/ui/application-manager-page')).toBe(true)
  })

  it('preserves all builtin business records and derives only the fixed published identities',async()=>{
    const navigation=await readBuiltinSystemNavigation()
    const parsed=navigation as unknown as Record<string,unknown>
    const records=parsed['records'] as Array<Record<string,unknown>>|undefined
    const publishedNodeIds=parsed['publishedNodeIds'] as readonly string[]|undefined
    expect(records).toEqual(evidence.rows)
    expect(records).toHaveLength(85)
    expect(records?.every(record=>Object.keys(record).length===evidence.businessFields.length)).toBe(true)
    expect(records?.find(record=>record['rowid']===rootId)).toMatchObject({name:'DataSchemaManage',FunName:'软件工坊[AppWorks]',conType:'Model',NavigationUrl:null})
    expect(publishedNodeIds).toHaveLength(26)
    expect(publishedNodeIds).toEqual(publishedIds)
    expect(navigation.nodes).toHaveLength(26)
    expect(navigation.nodes.filter(item=>item.kind==='Navitem')).toHaveLength(18)
    expect(navigation.nodes.find(item=>item.id==='E328FBBF518141973C575D612CD75151')).toBeUndefined()
  })

  it.each([
    ['root differs from the application identity', (value:Record<string,unknown>)=>{value['navigationRootId']='E99A1DCE9894698799101EFD70F8FC76'}],
    ['node parent is missing', (value:Record<string,unknown>)=>{
      const records=value['records'] as Array<Record<string,unknown>>
      records.find(record=>record['rowid']===pageId)!['prowid']='FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
    }],
    ['non-root parent chain has a cycle', (value:Record<string,unknown>)=>{
      const records=value['records'] as Array<Record<string,unknown>>
      const child=records.find(record=>record['rowid']===pageId)!
      const parent=records.find(record=>record['rowid']===child['prowid'])!
      child['prowid']=parent['rowid'];parent['prowid']=child['rowid']
    }],
    ['an unrelated second root exists', (value:Record<string,unknown>)=>{
      const records=value['records'] as Array<Record<string,unknown>>
      records.find(record=>record['rowid']===pageId)!['prowid']='000000'
    }],
    ['a published node is duplicated', (value:Record<string,unknown>)=>{
      const ids=value['publishedNodeIds'] as string[]
      ids[ids.length-1]=ids[0]!
    }],
  ])('rejects %s', (_label, mutate) => {
    const invalid=JSON.parse(JSON.stringify(source)) as Record<string,unknown>
    mutate(invalid)
    expect(() => parseBuiltinSystemNavigation(invalid)).toThrow('BUILTIN_NAVIGATION_SOURCE_INVALID')
  })
})
