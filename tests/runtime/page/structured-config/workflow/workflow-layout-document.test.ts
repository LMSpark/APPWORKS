import {describe,expect,it} from 'vitest'
import {WorkflowLayoutDocument} from '@/lowcode/resources/structured-config/workflow-definition/layout-document'
describe('workflow layout projection and updates',()=>{
 it('projects coordinates without using saved business properties as node truth',()=>{
  const raw='{"nodes":[{"id":"N1","x":12,"y":34,"properties":{"name":"stale"}}],"edges":[{"id":"E1","sourceNodeId":"stale","pointsList":[{"x":1,"y":2},{"x":3,"y":4}]}],"keep":false}'
  expect(WorkflowLayoutDocument.read(raw).nodePositions).toEqual({N1:{x:12,y:34}})
  expect(WorkflowLayoutDocument.read(raw).edgePaths['E1']).toHaveLength(2)
 })
 it('preserves unknown root, node and edge values while moving only the requested objects',()=>{
  const raw='{"nodes":[{"id":"N1","x":12,"y":34,"custom":false},{"id":"old","x":1,"y":2}],"edges":[{"id":"E1","custom":0}],"keep":{"future":1}}'
  const next=WorkflowLayoutDocument.move(raw,{id:'N1',x:90,y:80,edges:[{id:'E1',pointsList:[{x:90,y:80},{x:20,y:30}]}]})
  expect(JSON.parse(next)).toMatchObject({nodes:[{id:'N1',x:90,y:80,custom:false},{id:'old',x:1,y:2}],edges:[{id:'E1',custom:0}],keep:{future:1}})
 })
 it.each(['','{}','{"nodes":{},"edges":[]}','{"nodes":[{"id":"N1","x":"1","y":2}],"edges":[]}','{"nodes":[{"id":"N1"},{"id":"N1"}],"edges":[]}'])('rejects invalid layout instead of substituting an empty graph: %s',raw=>{
  expect(()=>WorkflowLayoutDocument.read(raw)).toThrow()
 })
})
