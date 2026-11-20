/** @module app:services/smart-bid/operation/agent-module/models/tender-source-action-modules
 * 职责：公开招标原件、版本、澄清、修改及后续事项动作。
 */
import {executeSmartBidAction,type SmartBidActionExecutor,type SmartBidActionRequest} from '../smart-bid-action-module'

export class TenderFileRegister {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 核领取清单。 */ public async 核领取清单(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'10',input)}}
export class TenderFileVersion {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 固定原件。 */ public async 固定原件(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'11',input)}
 /** 读原件位置。 */ public async 读原件位置(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'12',input)}}
export class PrebidInquiry {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 核澄清进展。 */ public async 核澄清进展(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'13',input)}}
export class TenderAddendum {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 对照变更。 */ public async 对照变更(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'14',input)}
 /** 追查变更引用。 */ public async 追查变更引用(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'23',input)}}
export class TenderRecord {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 提取事项。 */ public async 提取事项(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'15',input)}
 /** 核定事项。 */ public async 核定事项(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'16',input)}}
export class TenderFollowup {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 登记后续事项。 */ public async 登记后续事项(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'57',input)}}
