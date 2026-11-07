/// <reference types="node" />
import {execFileSync} from 'node:child_process'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect,it} from 'vitest'

it('retains an applied edit baseline across garbage collection until its tracking lifecycle ends',()=>{
 const modulePath=resolve(dirname(fileURLToPath(import.meta.url)),'../../strategies/crud/dirty-tracking-delegate.ts')
 const script=`
  import assert from 'node:assert/strict';
  import {pathToFileURL} from 'node:url';
  const {DirtyTrackingDelegate}=await import(pathToFileURL(${JSON.stringify(modulePath)}).href);
  const tracking=new DirtyTrackingDelegate(()=>undefined,()=>new Set(),()=>['rowid']);
  tracking.markDirty('F',{rowid:'F',Name:'old',description:''});
  tracking.markDirty('F',{rowid:'F',Name:'intermediate',description:''});
  const current={rowid:'F',Name:'new',description:''};
  for(let i=0;i<4;i++){await new Promise(resolve=>setImmediate(resolve));global.gc();}
  assert.deepEqual(tracking.getDiff('F',current),{Name:{from:'old',to:'new'}});
  assert.equal(tracking.getOriginal('F').Name,'old');
  tracking.clearDirty('F');
  assert.equal(tracking.getOriginal('F'),undefined);
  assert.equal(tracking.hasPendingChanges(),false);
  tracking.markDirty('F',current);tracking.trackDelete('F',current);
  assert.equal(tracking.getOriginal('F'),undefined);
  assert.equal(tracking.getPendingDeleteSnapshot('F').Name,'new');
  tracking.clearAll();assert.equal(tracking.hasPendingChanges(),false);
 `
 expect(()=>execFileSync(process.execPath,['--expose-gc','--import','tsx','--input-type=module','-e',script],{encoding:'utf8',windowsHide:true,timeout:15000})).not.toThrow()
})
