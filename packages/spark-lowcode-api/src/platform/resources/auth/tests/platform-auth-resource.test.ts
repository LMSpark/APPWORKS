import {afterEach,expect,it,vi} from 'vitest'
import {DataSet,bindDataSetCommandSubmit,bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import {LowcodeApiError,PlatformAuthResource} from '@spark-appworks/spark-lowcode-api'

const command=(resourceId:string,fields:readonly string[])=>({resourceType:'command',resourceId,
 columns:[{name:'commandId',type:'string',isPrimaryKey:true},...fields.map(name=>({name,type:'string'}))],
 views:{default:{autoLoad:false,commitMode:'staged',queryConfig:{pagination:'none'}}}})
const R=PlatformAuthResource.resources
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))

function fixture(){
 const platform={
  login:vi.fn(async()=>({})),
  listEnterprises:vi.fn(async()=>[{id:'E1',name:'领码科技',shortName:'lingma',shortCode:'LM'}]),
  registerUser:vi.fn(async()=>({id:'U1',raw:{}})),
  registerEnterprise:vi.fn(async()=>({id:'T1',raw:{}})),
  sendVerificationCode:vi.fn(async()=>undefined),
 }
 const ds=DataSet.fromJson({scenarioId:'platform-login',tables:{
  EnterpriseCatalog:{resourceType:'logical-view',resourceId:R.enterpriseCatalog,columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'name',type:'string'},{name:'shortName',type:'string'}],
   views:{default:{autoLoad:false,queryConfig:{allPages:true,maxRows:5000}}}},
  LoginRequest:command(R.login,['enterpriseName','account','password','outcome']),
  UserRegistrationRequest:command(R.userRegistration,['enterpriseName','account','displayName','sex','channel','contact','verificationCode','password','confirmPassword','outcome','message']),
  EnterpriseRegistrationRequest:command(R.enterpriseRegistration,['domainKey','englishName','chineseName','chineseShortName','administratorAccount','administratorPassword','channel','verificationAccount','verificationCode','outcome','message']),
  VerificationCodeRequest:command(R.verificationCode,['enterpriseName','channel','account','scene','outcome']),
 }})
 sets.push(ds)
 const resource=new PlatformAuthResource({platform,assertCurrent:()=>undefined})
 const view=(name:string)=>{const found=ds.getView(name);if(!found)throw Error(name);return found}
 bindDataSetReadonlyCommandQuery(view('EnterpriseCatalog'),resource.enterpriseCatalog(view('EnterpriseCatalog')))
 bindDataSetCommandSubmit(view('LoginRequest'),resource.login(view('LoginRequest')))
 bindDataSetCommandSubmit(view('UserRegistrationRequest'),resource.userRegistration(view('UserRegistrationRequest')))
 bindDataSetCommandSubmit(view('EnterpriseRegistrationRequest'),resource.enterpriseRegistration(view('EnterpriseRegistrationRequest')))
 bindDataSetCommandSubmit(view('VerificationCodeRequest'),resource.verificationCode(view('VerificationCodeRequest')))
 const loaded=new Set<string>()
 const add=async(name:string,data:Record<string,unknown>)=>{
  const target=view(name);if(!loaded.has(name)){loaded.add(name);await target.refresh()}
  const id=target.getPkKey(await target.addRow(data));if(id===undefined)throw Error('missing id')
  return{target,id,save:()=>ds.saveChanges({views:[{tableName:name,viewId:'default',ids:[id]}]})}
 }
 return{platform,view,add}
}
const user={enterpriseName:'lingma',account:'alice',displayName:'Alice',sex:'F',channel:'EMAIL',contact:'a@example.com',verificationCode:'123456',password:'secret1',confirmPassword:'secret1'}

it('loads the public enterprise directory as read-only rows',async()=>{
 const f=fixture(),catalog=f.view('EnterpriseCatalog');await catalog.refresh()
 expect(catalog.rows).toEqual([expect.objectContaining({id:'E1',name:'领码科技',shortName:'lingma'})])
 expect(catalog.fieldAccess(catalog.rows[0]!,'shortName').write).toBe('denied')
})
it('signs in through the platform and keeps neither password nor token in the receipt',async()=>{
 const f=fixture(),{target,id,save}=await f.add('LoginRequest',{enterpriseName:' lingma ',account:'alice',password:'secret1'})
 await save()
 expect(f.platform.login).toHaveBeenCalledWith({enterpriseName:'lingma',account:'alice',password:'secret1'})
 const row=target.rows.find(item=>target.getPkKey(item)===id)
 expect(row).toMatchObject({enterpriseName:'lingma',account:'alice',outcome:'signed-in'});expect(row?.['password']).toBeUndefined()
})
it('keeps an explicit login rejection retryable',async()=>{
 const f=fixture();f.platform.login.mockRejectedValueOnce(new LowcodeApiError(401,'账号或密码错误'))
 const {target,save}=await f.add('LoginRequest',{enterpriseName:'lingma',account:'alice',password:'bad'})
 await expect(save()).rejects.toThrow('账号或密码错误');expect(target.hasUnconfirmedSave).toBe(false)
 await save();expect(f.platform.login).toHaveBeenCalledTimes(2)
})
it('rejects mismatched confirmation and short passwords before any registration request',async()=>{
 const f=fixture()
 await expect((await f.add('UserRegistrationRequest',{...user,confirmPassword:'other11'})).save()).rejects.toThrow('两次密码不一致')
 await expect((await f.add('UserRegistrationRequest',{...user,password:'123',confirmPassword:'123'})).save()).rejects.toThrow('至少 6 位')
 expect(f.platform.registerUser).not.toHaveBeenCalled()
})
it('registers a user, maps the contact by channel, and signs in with the same account',async()=>{
 const f=fixture(),{target,id,save}=await f.add('UserRegistrationRequest',user);await save()
 expect(f.platform.registerUser).toHaveBeenCalledWith(expect.objectContaining({email:'a@example.com',phone:'',displayName:'Alice',sex:'F'}))
 expect(f.platform.login).toHaveBeenCalledWith({enterpriseName:'lingma',account:'alice',password:'secret1'})
 expect(target.rows.find(item=>target.getPkKey(item)===id)).toMatchObject({outcome:'signed-in'})
})
it('reports a registered tenant whose administrator cannot sign in yet',async()=>{
 const f=fixture();f.platform.login.mockRejectedValueOnce(new LowcodeApiError(500,'企业待审核'))
 const {target,id,save}=await f.add('EnterpriseRegistrationRequest',{domainKey:'NewApp',englishName:'New App',chineseName:'新应用',chineseShortName:'新应用',
  administratorAccount:'admin',administratorPassword:'secret1',channel:'MOBILE',verificationAccount:'13800000000',verificationCode:'1234'})
 await save()
 expect(f.platform.registerEnterprise).toHaveBeenCalledWith(expect.objectContaining({domainKey:'NewApp',phone:'13800000000',email:''}))
 const receipt=target.rows.find(item=>target.getPkKey(item)===id)
 expect(receipt).toMatchObject({domainKey:'NewApp',administratorAccount:'admin',outcome:'registered',message:'企业待审核'})
 expect(receipt?.['administratorPassword']).toBeUndefined()
})
it('keeps an unanswered registration unknown, never resends it, and confirms it only by signing in',async()=>{
 const f=fixture();f.platform.registerUser.mockRejectedValueOnce(new Error('timeout'))
 f.platform.login.mockRejectedValueOnce(new LowcodeApiError(401,'账号不存在'))
 const {target,id,save}=await f.add('UserRegistrationRequest',user)
 await expect(save()).rejects.toThrow('结果未知');expect(target.hasUnconfirmedSaveFor([id])).toBe(true)
 await expect(save()).rejects.toThrow('仍未确认');expect(target.hasUnconfirmedSaveFor([id])).toBe(true)
 await save()
 expect(f.platform.registerUser).toHaveBeenCalledTimes(1);expect(f.platform.login).toHaveBeenCalledTimes(2)
 expect(target.rows.find(item=>target.getPkKey(item)===id)).toMatchObject({outcome:'signed-in'})
})
it('treats an answered registration rejection as an explicit failure',async()=>{
 const f=fixture();f.platform.registerUser.mockRejectedValueOnce(new LowcodeApiError(500,'验证码错误'))
 const {target,id,save}=await f.add('UserRegistrationRequest',user)
 await expect(save()).rejects.toThrow('验证码错误');expect(target.hasUnconfirmedSaveFor([id])).toBe(false)
})
it('sends verification codes repeatedly with the declared scene',async()=>{
 const f=fixture()
 for(let attempt=0;attempt<2;attempt++)await (await f.add('VerificationCodeRequest',{enterpriseName:'lingma',channel:'EMAIL',account:'a@example.com',scene:'REGISTER'})).save()
 expect(f.platform.sendVerificationCode).toHaveBeenCalledTimes(2)
 expect(f.platform.sendVerificationCode).toHaveBeenLastCalledWith({enterpriseName:'lingma',channel:'EMAIL',account:'a@example.com',scene:'REGISTER'})
})
