import {afterEach,expect,it,vi} from 'vitest'
import {defineComponent,h} from 'vue'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
import {useContentAuthoringDeparture} from '@/views/features/application/smart-bid/authoring/ui/entry/use-content-authoring-departure'

const state=vi.hoisted(()=>({source:undefined as {readonly isDirty:boolean}|undefined}))
vi.mock('@spark-appworks/spark-app',()=>({useSystemPageDirtySource:(source:{readonly isDirty:boolean})=>{state.source=source}}))
let wrapper:VueWrapper|undefined
afterEach(()=>{wrapper?.unmount();state.source=undefined})
it('guards real route updates and departure while exposing the same pending condition to the original owner',async()=>{
 let hostPending=false,canLeave=true
 const page=defineComponent({setup(){useContentAuthoringDeparture({get hasPending(){return hostPending}},()=>({get canLeave(){return canLeave}}));return()=>h('div','正文')}})
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/authoring',component:page},{path:'/other',component:defineComponent({render:()=>h('div','其他页')})}]})
 await router.push('/authoring?draftId=D');await router.isReady()
 wrapper=mount(RouterView,{global:{plugins:[router]}});await flushPromises()
 canLeave=false
 expect(state.source?.isDirty).toBe(true)
 await router.push('/authoring?draftId=OTHER');expect(router.currentRoute.value.query['draftId']).toBe('D')
 await router.push('/other');expect(router.currentRoute.value.path).toBe('/authoring')
 canLeave=true;hostPending=true
 await router.push('/other');expect(router.currentRoute.value.path).toBe('/authoring')
 hostPending=false;expect(state.source?.isDirty).toBe(false)
 await router.push('/other');expect(router.currentRoute.value.path).toBe('/other')
})
