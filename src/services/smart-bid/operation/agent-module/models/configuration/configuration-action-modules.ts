/** @module app:services/smart-bid/operation/agent-module/models/configuration-action-modules
 * 职责：公开业务配置启停动作。
 */
import {executeSmartBidAction,type SmartBidActionExecutor,type SmartBidActionRequest} from '../../smart-bid-action-module'

export class ConfigurationRelease {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 启用业务配置。 */ public async 启用业务配置(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'60',input)}
 /** 停用业务配置。 */ public async 停用业务配置(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'61',input)}}
