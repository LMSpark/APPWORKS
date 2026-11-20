/** @module app:services/smart-bid/operation/agent-module/models/tender-analysis-action-modules
 * 职责：公开要求、依据、递交义务及阶段结果动作。
 */
import {executeSmartBidAction,type SmartBidActionExecutor,type SmartBidActionRequest} from '../smart-bid-action-module'

export class Requirement {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 确定条款。 */ public async 确定条款(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'21',input)}}
export class Baseline {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 冻结依据。 */ public async 冻结依据(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'22',input)}}
export class SubmissionObligation {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 列出应递交事项。 */ public async 列出应递交事项(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'24',input)}}
export class TenderOutcome {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 核阶段结果。 */ public async 核阶段结果(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'58',input)}}
