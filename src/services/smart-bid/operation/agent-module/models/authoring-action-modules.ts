/** @module app:services/smart-bid/operation/agent-module/models/authoring-action-modules
 * 职责：公开分册、模板、候选、采用与审核动作。
 */
import {executeSmartBidAction,type SmartBidActionExecutor,type SmartBidActionRequest} from '../smart-bid-action-module'

export class BidVolume {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 策划分册。 */ public async 策划分册(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'32',input)}}
export class DocumentTemplate {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 匹配原表。 */ public async 匹配原表(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'33',input)}}
export class ContentRevision {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 生成候选。 */ public async 生成候选(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'38',input)}}
export class ContentAdoption {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 采用变更。 */ public async 采用变更(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'39',input)}}
export class Approval {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 核审核覆盖。 */ public async 核审核覆盖(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'45',input)}}
