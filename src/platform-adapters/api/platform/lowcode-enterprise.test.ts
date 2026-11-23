// @vitest-environment node
import {expect,it} from 'vitest'
import {normalizeEnterpriseCatalog} from './lowcode-enterprise.js'

it('normalizes the shared enterprise result envelope and ignores invalid rows',()=>{
 expect(normalizeEnterpriseCatalog({Data:{items:[
  {rowid:'E1',ShortName:'ent',ShortCName:'企业'},
  'invalid',
  {rowid:'E2',ShortName:'ent',ShortCName:'重复'},
 ]}})).toEqual([{id:'E1',name:'企业',shortName:'ent',shortCode:'企业'}])
})
