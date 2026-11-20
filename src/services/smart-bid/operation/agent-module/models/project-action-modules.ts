/** @module app:services/smart-bid/operation/agent-module/models/project-action-modules
 * 职责：公开投标项目、主体、成员、决策和移交动作。
 */
import {executeSmartBidAction,type SmartBidActionExecutor,type SmartBidActionRequest} from '../smart-bid-action-module'

export class TenderLot {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 定位标段。 */ public async 定位标段(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'08',input)}}
export class BidSubject {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 识别企业。 */ public async 识别企业(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'09',input)}}
export class ProjectSubject {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 核成员组合。 */ public async 核成员组合(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'18',input)}}
export class ParticipationDecision {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 登记投标决策。 */ public async 登记投标决策(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'19',input)}}
export class ContentProject {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 绑定编制范围。 */ public async 绑定编制范围(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'20',input)}}
export class BidHandoff {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 核本轮移交。 */ public async 核本轮移交(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'59',input)}}
