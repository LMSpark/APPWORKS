import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {builtinSystemApplication, parseBuiltinSystemNavigation, readBuiltinSystemNavigation} from '@/lowcode/resources/repository/builtin-system-navigation'

const rootId = 'D99A1DCE9894698799101EFD70F8FC76'
const pageId = '0C70F74793F9E858B71E0DBDEC784D57'
const source=JSON.parse(readFileSync('config/navigation/appworks-system.json','utf8')) as Record<string,unknown>
const publishedIds=source['publishedNodeIds'] as string[]
const publishedNavitems=(source['records'] as Array<Record<string,unknown>>).filter(record=>publishedIds.includes(String(record['rowid']))&&record['conType']==='Navitem').length
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
    expect(navigation.nodes.filter(item => item.kind === 'Navitem')).toHaveLength(publishedNavitems)
    expect(navigation.nodes.some(item => item.id === pageId
      && item.url === 'vue:/features/application/application-manager/ui/application-manager-page')).toBe(true)
    expect(navigation.nodes.some(item => item.id === '4138A7C47ECB96EA85CA61A8A8B7191F'
      && item.parentId === '9D26D23E5A9DD0D31619D776114405E8'
      && item.url === 'vue:/features/organization/organization-structure/ui/organization-structure-page')).toBe(true)
    expect(navigation.nodes.some(item => item.id === '0A835EB88AAC2BDFBDE344477C6827BB'
      && item.parentId === '9D26D23E5A9DD0D31619D776114405E8'
      && item.url === 'vue:/features/organization/job-management/ui/job-management-page')).toBe(true)
    expect(navigation.nodes.some(item => item.id === '1B7FD70E326717B8E4B611D0431FFCBA'
      && item.parentId === '9D26D23E5A9DD0D31619D776114405E8'
      && item.url === 'vue:/features/organization/user-management/ui/user-management-page')).toBe(true)
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
    expect(new Set(publishedNodeIds).size).toBe(publishedIds.length)
    expect(publishedNodeIds).toEqual(publishedIds)
    expect(navigation.nodes).toHaveLength(publishedIds.length)
    expect(navigation.nodes.filter(item=>item.kind==='Navitem')).toHaveLength(publishedNavitems)
    expect(navigation.nodes.find(item=>item.id==='E328FBBF518141973C575D612CD75151')).toMatchObject({title:'流程监控',kind:'Model',url:'vue:/features/system/flow-monitor/ui/flow-monitor-page',publishInMenu:true})
    expect(navigation.nodes.find(item=>item.id==='93DF05182084B1F0E8DA7283E83BBE0C')).toMatchObject({url:'vue:/features/application/application-context/ui/application-database-relations-page',publishInMenu:true})
    expect(navigation.nodes.find(item=>item.id==='88A4D51B01702C3856F4632E234BF34B')).toMatchObject({url:'vue:/features/data-platform/structured-config/dimension-definition/ui/dimension-design-page',publishInMenu:true})
    expect(navigation.nodes.find(item=>item.id==='2CA968B3513084BA2537BB0C85AE945E')).toMatchObject({url:'vue:/features/application/data-menu/ui/data-menu-page',publishInMenu:true})
  })

  it('derives projection size from the declared published identities without weakening validation', () => {
    const previous = JSON.parse(JSON.stringify(source)) as Record<string, unknown>
    const ids = previous['publishedNodeIds'] as string[]
    ids.splice(ids.indexOf('0A835EB88AAC2BDFBDE344477C6827BB'), 1)
    const navigation = parseBuiltinSystemNavigation(previous)
    expect(navigation.nodes).toHaveLength(publishedIds.length - 1)
    expect(navigation.nodes.filter(item => item.kind === 'Navitem')).toHaveLength(publishedNavitems - 1)
    expect(navigation.nodes.some(item => item.id === '0A835EB88AAC2BDFBDE344477C6827BB')).toBe(false)
    previous['publishedNodeIds'] = [rootId]
    expect(() => parseBuiltinSystemNavigation(previous)).toThrow('发布选择缺少页面')
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
