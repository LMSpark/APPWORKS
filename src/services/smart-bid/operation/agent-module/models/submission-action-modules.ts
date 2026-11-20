/** @module app:services/smart-bid/operation/agent-module/models/submission-action-modules
 * 职责：公开封装、递交、回执和截止组合动作。
 */
import {executeSmartBidAction,type SmartBidActionExecutor,type SmartBidActionRequest} from '../smart-bid-action-module'

export class SubmissionPackage {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 封装递交文件。 */ public async 封装递交文件(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'49',input)}
 /** 核对包内文件。 */ public async 核对包内文件(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'50',input)}}
export class SubmissionAttempt {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 办理递交或撤回。 */ public async 办理递交或撤回(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'51',input)}
 /** 查本次办理。 */ public async 查本次办理(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'52',input)}}
export class ChannelReceipt {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 核接收凭据。 */ public async 核接收凭据(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'53',input)}}
export class SubmissionReconciliation {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 核截止组合。 */ public async 核截止组合(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'54',input)}}
