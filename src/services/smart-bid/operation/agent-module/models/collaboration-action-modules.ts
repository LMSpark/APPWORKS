/** @module app:services/smart-bid/operation/agent-module/models/collaboration-action-modules
 * 职责：公开问题登记与复验动作。
 */
import {executeSmartBidAction,type SmartBidActionExecutor,type SmartBidActionRequest} from '../smart-bid-action-module'

export class CheckFinding {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 登记问题。 */ public async 登记问题(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'43',input)}
 /** 复验问题。 */ public async 复验问题(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'44',input)}}
