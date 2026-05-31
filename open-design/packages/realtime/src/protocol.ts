// SPDX-License-Identifier: Apache-2.0

import * as decoding from "lib0/decoding";

export const Y_WEBSOCKET_MESSAGE_SYNC = 0;
export const Y_WEBSOCKET_MESSAGE_AWARENESS = 1;

export const REALTIME_MESSAGE_MAX_BYTES = 16 * 1024 * 1024;

export type YWebSocketMessageType =
  | typeof Y_WEBSOCKET_MESSAGE_SYNC
  | typeof Y_WEBSOCKET_MESSAGE_AWARENESS;

export type RealtimeMessage = Uint8Array | ArrayBuffer;

export interface RealtimeDecoderOptions {
  maxBytes?: number;
}

export interface DecodedRealtimeMessage {
  bytes: Uint8Array;
  decoder: decoding.Decoder;
  messageType: YWebSocketMessageType;
}

export function isYWebSocketMessageType(value: number): value is YWebSocketMessageType {
  return value === Y_WEBSOCKET_MESSAGE_SYNC || value === Y_WEBSOCKET_MESSAGE_AWARENESS;
}

export function toBoundedRealtimeUint8Array(
  data: RealtimeMessage,
  options: RealtimeDecoderOptions = {},
): Uint8Array {
  const maxBytes = options.maxBytes ?? REALTIME_MESSAGE_MAX_BYTES;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength > maxBytes) {
    throw new RangeError("realtime message exceeds maximum size");
  }
  return bytes;
}

export function createBoundedRealtimeDecoder(
  data: RealtimeMessage,
  options: RealtimeDecoderOptions = {},
): decoding.Decoder {
  return decoding.createDecoder(toBoundedRealtimeUint8Array(data, options));
}

export function decodeRealtimeMessage(
  data: RealtimeMessage,
  options: RealtimeDecoderOptions = {},
): DecodedRealtimeMessage {
  const bytes = toBoundedRealtimeUint8Array(data, options);
  const decoder = decoding.createDecoder(bytes);
  const messageType = decoding.readVarUint(decoder);
  if (!isYWebSocketMessageType(messageType)) {
    throw new RangeError("unknown realtime message type");
  }
  return { bytes, decoder, messageType };
}
