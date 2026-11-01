import {describe,expect,it,vi} from 'vitest'
import {JsonDataContentClient} from '@spark-appworks/spark-lowcode-api'
import {StructuredCatalogHttp} from '../structured-config/catalog/structured-config-catalog.fixture'
describe('actual JSON content tree protocol',()=>{
 it.each([null,{},'file missing'])('rejects non-tree read result %s instead of fabricating an empty document',async value=>{
  const http=new StructuredCatalogHttp({});vi.spyOn(http,'post').mockResolvedValue({Code:200,Result:value})
  await expect(new JsonDataContentClient(http).read('J1')).rejects.toThrow('JSON_CONTENT_TREE_REQUIRED')
 })
 it('rejects the actual success envelope with an omitted Result instead of exposing it as business content',async()=>{
  const http=new StructuredCatalogHttp({});vi.spyOn(http,'post').mockResolvedValue({Code:200,Message:'OK',Type:'success',Extras:{},Time:'server-time'})
  await expect(new JsonDataContentClient(http).read('J1')).rejects.toThrow('JSON_CONTENT_TREE_REQUIRED')
 })
 it('accepts a real empty tree without substituting a document object',async()=>{
  const http=new StructuredCatalogHttp({});vi.spyOn(http,'post').mockResolvedValue({Code:200,Result:[]})
  expect(await new JsonDataContentClient(http).read('J1')).toEqual([])
 })
 it.each([{},null,false,'{}'])('rejects a non-tree write before HTTP: %s',async value=>{
  const http=new StructuredCatalogHttp({});const post=vi.spyOn(http,'post')
  await expect(new JsonDataContentClient(http).save('J1',value)).rejects.toThrow('JSON_CONTENT_TREE_REQUIRED');expect(post).not.toHaveBeenCalled()
 })
 it('preserves the real tree payload and explicit backend business failures',async()=>{
  const http=new StructuredCatalogHttp({});const post=vi.spyOn(http,'post').mockResolvedValue({Code:500,Message:'拒绝保存',Result:null})
  const tree=[{id:'flag',name:'flag',pid:null,type:'boolean',value:false,haschild:false}]
  await expect(new JsonDataContentClient(http).save('J1',tree)).rejects.toThrow('拒绝保存')
  expect(post).toHaveBeenCalledWith('/api/JsonData/SaveJsonData?jsonId=J1',tree)
 })
})
