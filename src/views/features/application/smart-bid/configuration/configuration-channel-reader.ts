/**
 * @module app:views/features/application/smart-bid/configuration/configuration-channel-reader
 * 职责：读取当前作用域的原配置指针，不用历史启停回执推断当前版本。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {originalRegistrationView,readOriginalRegistrationView} from '../authority/original-registration-view'

export type ConfigurationScope='PLATFORM'|'ENTERPRISE'|'PROJECT'
const keys=['kind','key','scope','scopeId']
const fields=['version','state','hash']

export function configurationChannelReadView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,fields)
}

export async function readRegisteredConfigurationChannel(
 host:Parameters<typeof readOriginalRegistrationView>[0]&Readonly<{scopeId:string;configurationScope:ConfigurationScope}>,
 input:Readonly<{kind:string;key:string}>){
 const {kind,key}=input,{scopeId,configurationScope:scope}=host
 if(![kind,key,scopeId].every(identity))throw Error('CONFIGURATION_CHANNEL_SCOPE')
 const read=await readOriginalRegistrationView(host,{model:'ConfigChannel',viewName:'currentChannel'},{kind,key,scope,scopeId})
 if(!read.row)return Object.freeze({state:'MISSING' as const,assertCurrent:read.assertCurrent})
 const {version,state,hash}=read.row
 const assertCurrent=read.captureFields(state==='ACTIVE'?fields:['version','state'])
 if(!identity(version))throw Error('CONFIGURATION_CHANNEL_SCOPE')
 if(state==='DISABLED')return Object.freeze({state,pointerVersion:version,assertCurrent})
 if(state!=='ACTIVE'||typeof hash!=='string'||!/^[a-f0-9]{64}$/u.test(hash))throw Error('CONFIGURATION_CHANNEL_SCOPE')
 return Object.freeze({state,pointerVersion:version,versionDigest:hash,assertCurrent})
}
