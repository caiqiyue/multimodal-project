import type { ChatEventBase } from './envelope.ts';

export interface MessageStartEvent extends ChatEventBase {
  type: 'message.start';
  role: 'assistant';
}

export interface MessageDeltaEvent extends ChatEventBase {
  type: 'message.delta';
  delta: string;
}

export interface MessageDoneEvent extends ChatEventBase {
  type: 'message.done';
  finish_reason: 'stop' | 'length' | 'error';
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamErrorEvent extends ChatEventBase {
  type: 'error';
  code: string;
  message: string;
}

export interface ToolCallEvent extends ChatEventBase {
  type: 'tool.call';
  name: string;
  args: Record<string, unknown>;
  tool_call_id: string;
}

export interface ToolResultEvent extends ChatEventBase {
  type: 'tool.result';
  name: string;
  content: string;
  tool_call_id: string;
}

export type ChatEvent =
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageDoneEvent
  | ToolCallEvent
  | ToolResultEvent
  | StreamErrorEvent;

export type ChatEventType = ChatEvent['type'];
