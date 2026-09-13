import { beforeEach, expect, it, vi } from 'vitest';
import type { PerceptionPluginRuntimeContext, PluginReplyEvent } from '@originos/core/modules/perception-runtime/plugins';
import { FeishuPerceptionPlugin } from '../plugin';
import type { FeishuSdkMessageEvent } from '../types';
const mocks = vi.hoisted(() => ({ upload:vi.fn(), reply:vi.fn(), close:vi.fn(), receive:undefined as ((event: FeishuSdkMessageEvent) => Promise<void>) | undefined }));
vi.mock('@larksuiteoapi/node-sdk',()=>({
 Domain:{Lark:'lark',Feishu:'feishu'},
 Client:class { im={v1:{file:{create:mocks.upload},message:{reply:mocks.reply}}}; },
 WSClient:class { start=vi.fn(async()=>undefined);close=mocks.close; },
 EventDispatcher:class { register(handlers: {'im.message.receive_v1':typeof mocks.receive}) { mocks.receive=handlers['im.message.receive_v1'];return this;} },
 createLarkChannel:()=>({send:vi.fn(),stream:vi.fn()}),
}));
beforeEach(()=>{mocks.upload.mockResolvedValue({file_key:'key'});mocks.reply.mockResolvedValue({code:0,data:{message_id:'sent'}});});
it.each(['success','upload-failure','send-failure','stop','cancel','empty','large'])('official file APIs preserve reply target and stop safety (%s)',async(mode)=>{
 const plugin=new FeishuPerceptionPlugin();
 let deliver:((event:PluginReplyEvent)=>Promise<unknown>)|undefined;
 let finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve;});
 const host:PerceptionPluginRuntimeContext={pluginId:'originos.feishu',connectorId:'test',settings:{appId:'cli_0123456789abcdef',domain:'feishu',secretRef:'test'},ports:{
  credentials:{bind:vi.fn(),remove:vi.fn(),resolve:async()=>JSON.stringify({appSecret:'fixture'})},
  events:{submit:async()=>{await pending;return[];}},replies:{register:(_handle,next)=>{deliver=next;return vi.fn();}},health:{report:vi.fn()},
 }};
 await plugin.start(host);
 const handling=mocks.receive!({sender:{sender_type:'user',sender_id:{open_id:'u'}},message:{message_id:'incoming',chat_id:'chat',chat_type:'group',message_type:'text',content:'{"text":"test"}',create_time:'1788756000000'}});
 await vi.waitFor(()=>expect(deliver).toBeDefined());
 const signal=new AbortController();
 mocks.upload.mockImplementationOnce(async()=>{
  if(mode==='upload-failure')throw new Error('rejected');
  if(mode==='stop')await plugin.stop(host);
  if(mode==='cancel')signal.abort();
  return {file_key:'key'};
 });
 if(mode==='send-failure')mocks.reply.mockResolvedValueOnce({code:999});
 const bytes=new Uint8Array(mode==='empty'?0:mode==='large'?20_000_001:3);
 const result=deliver!({type:'file',file:{fileName:'report.pdf',bytes},signal:signal.signal});
 if(mode==='success')await expect(result).resolves.toMatchObject({status:'delivered',messageId:'sent'});else await expect(result).rejects.toBeDefined();
 if(!['empty','large'].includes(mode))expect(mocks.upload).toHaveBeenCalledWith({data:{file_type:'stream',file_name:'report.pdf',file:Buffer.from(bytes)}});
 else expect(mocks.upload).not.toHaveBeenCalled();
 expect(mocks.reply).toHaveBeenCalledTimes(['success','send-failure'].includes(mode)?1:0);
 if(mode==='success')expect(mocks.reply).toHaveBeenCalledWith({path:{message_id:'incoming'},data:{msg_type:'file',content:'{"file_key":"key"}'}});
 finish();await handling;await plugin.stop(host);
});
