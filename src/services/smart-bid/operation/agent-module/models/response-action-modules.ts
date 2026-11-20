/** @module app:services/smart-bid/operation/agent-module/models/response-action-modules
 * 职责：公开价格、事实、响应与资格复核动作。
 */
import {executeSmartBidAction,type SmartBidActionExecutor,type SmartBidActionRequest} from '../smart-bid-action-module'

export class PriceSheet {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 复算报价。 */ public async 复算报价(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'28',input)}}
export class ApprovedPrice {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 读取批准价。 */ public async 读取批准价(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'29',input)}}
export class FactVersion {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 登记批准使用的事实。 */ public async 登记批准使用的事实(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'30',input)}
 /** 读取批准使用的事实。 */ public async 读取批准使用的事实(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'31',input)}}
export class ResponseAssignment {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 分派答复。 */ public async 分派答复(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'34',input)}}
export class QualificationReview {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 核所选证明。 */ public async 核所选证明(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'35',input)}}
export class Response {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 编拟响应。 */ public async 编拟响应(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'36',input)}
 /** 核对答复。 */ public async 核对答复(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'37',input)}}
