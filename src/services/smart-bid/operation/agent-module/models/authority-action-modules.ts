/** @module app:services/smart-bid/operation/agent-module/models/authority-action-modules
 * 职责：公开企业资料、用途、人员、担保与代表授权动作。
 */
import {executeSmartBidAction,type SmartBidActionExecutor,type SmartBidActionRequest} from '../smart-bid-action-module'

export class ResourceVersion {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 取适用材料。 */ public async 取适用材料(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'17',input)}}
export class Person {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 核拟任人。 */ public async 核拟任人(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'25',input)}}
export class BidSecurity {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 核担保办理。 */ public async 核担保办理(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'26',input)}}
export class AuthorityGrant {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 核代表权限。 */ public async 核代表权限(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'27',input)}
 /** 登记代表委托。 */ public async 登记代表委托(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'55',input)}}
export class ResourceUseDecision {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 登记资料使用决定。 */ public async 登记资料使用决定(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'56',input)}}
