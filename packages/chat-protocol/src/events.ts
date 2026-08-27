import type { ChatEventBase } from './envelope';

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

export type ChatEvent =
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageDoneEvent
  | StreamErrorEvent;

export type ChatEventType = ChatEvent['type'];
