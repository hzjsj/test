import { MSG_TYPES } from './constants';
import type { CapturedRequest, CaptureState, FilterRule } from './types';

interface MessagePayloads {
  [MSG_TYPES.CAPTURED_REQUEST]: { tabId: number; request: CapturedRequest };
  [MSG_TYPES.GET_STATE]: { tabId: number };
  [MSG_TYPES.STATE_UPDATE]: CaptureState;
  [MSG_TYPES.UPDATE_FILTERS]: { rules: FilterRule[] };
  [MSG_TYPES.GET_FILTERED_REQUESTS]: { tabId: number };
  [MSG_TYPES.LOG_TO_CONSOLE]: { tabId?: number; request: CapturedRequest };
  [MSG_TYPES.FILTERS_CHANGED]: { rules: FilterRule[] };
  [MSG_TYPES.CLEAR_REQUESTS]: { tabId: number };
  [MSG_TYPES.TOGGLE_CAPTURE]: { tabId: number };
}

type MessageType = keyof MessagePayloads;

export async function sendMessage<T extends MessageType>(
  type: T,
  payload: MessagePayloads[T]
): Promise<void> {
  await chrome.runtime.sendMessage({ type, payload });
}

export async function sendMessageWithResponse<T extends MessageType>(
  type: T,
  payload: MessagePayloads[T]
): Promise<unknown> {
  return chrome.runtime.sendMessage({ type, payload });
}

export function onMessage<T extends MessageType>(
  type: T,
  handler: (payload: MessagePayloads[T], sender: chrome.runtime.MessageSender) => void
): () => void {
  const listener = (
    message: { type: string; payload: unknown },
    sender: chrome.runtime.MessageSender
  ) => {
    if (message.type === type) {
      handler(message.payload as MessagePayloads[T], sender);
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
