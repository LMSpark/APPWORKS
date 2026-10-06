import { describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace } from '../../src/project/project-workspace'
import type { ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData } from '../../src/blueprint/project-blueprint-node'
import { findNodeById } from '../../src/blueprint/project-blueprint-tree'
import type { ProjectBlueprintGateway } from '../../src/io/project-blueprint-client'
function node(id:string,parent='root'):ProjectBlueprintTreeNodeData { return {nodeId:id,parentNodeId:parent,projectId:'demo',kind:'module',capability:{name:id},navigation:{title:id,order:0,publishInMenu:true,showChildren:true,beginGroup:false},source:{}} }
type MutableGateway = { -readonly [K in keyof ProjectBlueprintGateway]: ProjectBlueprintGateway[K] }
function fixture(children:ProjectBlueprintTreeNodeData[]=[],synthetic=false) {
  const root:ProjectBlueprintTreeData={...node(synthetic?'project-blueprint:demo':'root',''),children}
  const calls:string[]=[]
  const take=(nodes:ProjectBlueprintTreeNodeData[],id:string):ProjectBlueprintTreeNodeData|undefined=>{const index=nodes.findIndex(item=>item.nodeId===id);if(index>=0)return nodes.splice(index,1)[0];for(const child of nodes){const removed=take(child.children ?? [],id);if(removed)return removed}return undefined}
  const bucket=(id:string|null|undefined):ProjectBlueprintTreeNodeData[]=>{const parent=!id || id===root.nodeId ? root : findNodeById(root.children,id);if(!parent)throw new Error('parent missing');parent.children ??= []; return parent.children}
  const gateway:MutableGateway={loadRoot:async()=>structuredClone(root),addNode:async args=>{calls.push(`add:${args.node.nodeId}`);const created=structuredClone(args.node);delete created.children;created.parentNodeId=args.parentId ?? '';bucket(args.parentId).splice(args.index ?? 0,0,created);return created},updateNode:async(id,patch)=>{calls.push(`update:${id}`);const item=id===root.nodeId?root:findNodeById(root.children,id);if(!item)throw new Error('missing');Object.assign(item,structuredClone(patch));return structuredClone(item)},deleteNode:async id=>{calls.push(`delete:${id}`);return take(root.children,id) ?? null},moveNode:async(id,parent,index)=>{calls.push(`move:${id}`);const item=take(root.children,id);if(!item)throw new Error('missing');item.parentNodeId=parent ?? '';bucket(parent).splice(index,0,item);return structuredClone(item)}}
  const workspace=new ProjectWorkspace({projectId:'demo',pageFiles:{readPageFile:async()=>''},blueprint:gateway})
  workspace.project.replaceBlueprintTree(structuredClone(root))
  return {root,calls,workspace,gateway}
}
describe('workspace formal blueprint saving',()=>{
  it('persists planned adds/deletes including nested parents and validates real readback',async()=>{const f=fixture([{...node('old'),children:[node('old-child','old')]}]);f.workspace.project.replaceBlueprintChildren([{...node('new'),children:[node('new-child','new')]}]);await f.workspace.saveAll();expect(f.calls).toEqual(['delete:old-child','delete:old','add:new','add:new-child']);expect(f.root.children[0]?.children?.[0]?.nodeId).toBe('new-child');expect(f.workspace.project.blueprintDirty).toBe(false)})
  it('persists parent moves and changed grouped metadata',async()=>{const f=fixture([{...node('a'),children:[node('child','a')]},node('b')]);const child={...node('child','b'),capability:{name:'changed'}};f.workspace.project.replaceBlueprintChildren([node('a'),{...node('b'),children:[child]}]);await f.workspace.saveAll();expect(f.calls).toContain('move:child');expect(f.calls).toContain('update:child');expect(findNodeById(f.root.children,'child')).toMatchObject({parentNodeId:'b',capability:{name:'changed'}})})
  it('rejects an unconfirmed update and keeps planning dirty',async()=>{const f=fixture([node('a')]);f.gateway.updateNode=vi.fn(async()=>node('a'));f.workspace.project.replaceBlueprintChildren([{...node('a'),capability:{name:'new'}}]);await expect(f.workspace.saveAll()).rejects.toThrow('SAVE_UNCONFIRMED');expect(f.workspace.project.blueprintDirty).toBe(true)})
  it('keeps edits performed during saving and refuses clean acknowledgement',async()=>{const f=fixture([node('a')]);const update=f.gateway.updateNode!;f.gateway.updateNode=async(id,patch)=>{const result=await update(id,patch);f.workspace.project.replaceBlueprintChildren([{...node('a'),capability:{name:'during'}}]);return result};f.workspace.project.replaceBlueprintChildren([{...node('a'),capability:{name:'submitted'}}]);await expect(f.workspace.saveAll()).rejects.toThrow('EDIT_DURING_SAVE');expect(f.workspace.project.findNodeById('a')?.name).toBe('during');expect(f.workspace.project.blueprintDirty).toBe(true)})
  it('does not persist a synthetic projection root and moves its children to wire top level',async()=>{
    const f=fixture([node('a',''),node('b','')],true)
    f.workspace.project.replaceBlueprintChildren([node('a',''),node('b',''),node('c','')]);await f.workspace.saveAll()
    expect(f.calls).not.toContain('add:project-blueprint:demo');expect(f.calls).not.toContain('update:project-blueprint:demo')
    const move=vi.spyOn(f.gateway,'moveNode');await f.workspace.moveMountedPage('c',null,0);expect(move).toHaveBeenCalledWith('c',null,0)
    await expect(f.workspace.saveProjectLayout()).rejects.toThrow('合成蓝图根')
  })
  it('maps a displayed top-level drop to the real project root identity',async()=>{
    const f=fixture([node('a')]);const move=vi.spyOn(f.gateway,'moveNode');await f.workspace.moveMountedPage('a',null,0);expect(move).toHaveBeenCalledWith('a','root',0)
  })

  it('preserves edits made while a selected-node save is in flight',async()=>{
    const f=fixture([node('a')]);f.workspace.project.selectNode('a');const draft=f.workspace.project.beginBlueprintDraft();draft.node.capability.name='submitted';f.workspace.project.applyBlueprintNodeEdit(draft)
    const update=f.gateway.updateNode!;f.gateway.updateNode=async(id,patch)=>{const confirmed=await update(id,patch);const edited=f.workspace.project.beginBlueprintDraft();edited.node.capability.name='during';f.workspace.project.applyBlueprintNodeEdit(edited);return confirmed}
    await expect(f.workspace.saveSelectedBlueprintNode({skipReload:true})).rejects.toThrow('EDIT_DURING_SAVE')
    expect(f.workspace.project.findNodeById('a')?.name).toBe('during');expect(f.workspace.project.blueprintDirty).toBe(true)
  })

  it('confirms wire-normalized empty optional text and ignores readonly model dependency projections',async()=>{
    const f=fixture([node('a')]);f.workspace.project.selectNode('a');const draft=f.workspace.project.beginBlueprintDraft();draft.node.capability.description='';draft.node.navigation!.target='';draft.node.prototype={htmlDescription:''};draft.node.dataSpace={scenarioId:'scene',models:[{metaName:'Orders'}]};f.workspace.project.applyBlueprintNodeEdit(draft)
    f.gateway.updateNode=async()=>({...node('a'),capability:{name:'a'},dataSpace:{scenarioId:'scene',models:[]}})
    await f.workspace.saveSelectedBlueprintNode({skipReload:true});expect(f.workspace.project.blueprintDirty).toBe(false)
  })

})
