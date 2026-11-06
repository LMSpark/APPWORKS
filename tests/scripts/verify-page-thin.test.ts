import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,expect,it} from 'vitest'
// @ts-ignore TS7016 -- Node .mjs verifier
import {scanPageThin} from '../../tools/verify-page-thin.mjs'
const roots:string[]=[]
function scan(source:string){
 const root=mkdtempSync(join(tmpdir(),'page-thin-'));roots.push(root)
 mkdirSync(join(root,'src','lowcode'),{recursive:true});mkdirSync(join(root,'tools'))
 writeFileSync(join(root,'src','lowcode','example.ts'),source)
 return scanPageThin({root})
}
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
it('keeps formal execution fingerprints and independent reread checks',()=>{
 const result=scan(`function formalSignature(view){return JSON.stringify(view.rows.map(row=>[row.rowid,row.name]))}
 async function checkFormal(source,current){const before=formalSignature(source);await current.refresh();if(formalSignature(source)!==before||formalSignature(current)!==before)throw Error('changed')}`)
 expect(result.violations).toEqual([])
})
it('keeps reactive identity keys that invalidate dependent queries',()=>{
 const result=scan(`watch(()=>JSON.stringify([epoch,detailId,signature(view.rows.find(row=>row.rowid===detailId))]),()=>directory.load())`)
 expect(result.violations).toEqual([])
})
it.each([
 `const baselineRows=structuredClone(view.rows);const isDirty=JSON.stringify(view.rows)!==JSON.stringify(baselineRows)`,
 `const baselineRows=structuredClone(view.rows);const current=JSON.stringify(view.rows);const isDirty=current!==JSON.stringify(baselineRows)`,
 `function hasUnsavedChanges(){return JSON.stringify(view.rows)!==baseline}`,
 `const baselineRows=structuredClone(view.rows);const currentRows=view.rows;const isDirty=JSON.stringify(currentRows)!==JSON.stringify(baselineRows)`,
])('rejects a separate record baseline used to infer dirty state: %s',source=>{
 expect(scan(source).violations.some((item:{message:string})=>item.message.includes('JSON'))).toBe(true)
})
it('resolves lexical bindings instead of confusing unrelated variables with the same name',()=>{
 const result=scan(`function formal(){const current=JSON.stringify(view.rows);return current}
 function editor(){const current=42;const isDirty=current!==0;return isDirty}`)
 expect(result.violations).toEqual([])
})
it('reports uncertain serialization for review instead of inventing a violation',()=>{
 const result=scan(`const document=JSON.stringify(view.rows)`)
 expect(result.violations).toEqual([])
 expect(result.diagnostics).toHaveLength(1)
})
