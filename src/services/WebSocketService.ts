/**
 * WebSocketService.ts
 * Manages persistent WebSocket connection to the signaling server.
 * Handles reconnection, queuing, and message dispatch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type WsMessage =
  | { type: 'start_stream' }
  | { type: 'stop_stream' }
  | { type: 'start_recording' }
  | { type: 'stop_recording' };

type MessageHandler = (msg: WsMessage) => void;

const RECONNECT_DELAY_MS = 4000;
const MAX_QUEUE = 100;

class WebSocketService {
  private ws: WebSocket | null = null;
  private serverUrl: string = 'ws://localhost:3001'; // default, overridden by settings
  private deviceId: string = '';
  private deviceName: string = '';
  private authToken: string = 'micnet-secret-change-me';
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: string[] = [];
  private _isConnected: boolean = false;
  private _shouldConnect: boolean = false;

  onStatusChange?: (connected: boolean) => void;

  /** Load settings and connect */
  async init() {
    try {
      const url   = await AsyncStorage.getItem('serverUrl');
      const id    = await AsyncStorage.getItem('deviceId');
      const name  = await AsyncStorage.getItem('deviceName');
      const token = await AsyncStorage.getItem('authToken');
      if (url)   this.serverUrl  = url;
      if (id)    this.deviceId   = id;
      if (name)  this.deviceName = name;
      if (token) this.authToken  = token;
    } catch {}
    this._shouldConnect = true;
    this._connect();
  }

  /** Reconnect with a new URL */
  async reconnect(url: string, deviceId: string, deviceName: string, authToken?: string) {
    this.serverUrl  = url;
    this.deviceId   = deviceId;
    this.deviceName = deviceName;
    if (authToken) this.authToken = authToken;
    this._shouldConnect = true;
    this._disconnect();
    this._connect();
  }

  disconnect() {
    this._shouldConnect = false;
    this._disconnect();
  }

  get isConnected() { return this._isConnected; }

  addHandler(h: MessageHandler) { this.handlers.add(h); }
  removeHandler(h: MessageHandler) { this.handlers.delete(h); }

  /** Send any JSON-serializable object */
  send(obj: object) {
    const payload = JSON.stringify(obj);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      if (this.messageQueue.length < MAX_QUEUE) {
        this.messageQueue.push(payload);
      }
    }
  }

  private _connect() {
    if (!this._shouldConnect) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    // Append auth token as query param
    const sep = this.serverUrl.includes('?') ? '&' : '?';
    const url = `${this.serverUrl}${sep}token=${encodeURIComponent(this.authToken)}`;
    console.log(`[WS] Connecting to ${this.serverUrl}`);
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      console.error('[WS] Failed to create WebSocket:', e);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this._isConnected = true;
      this.onStatusChange?.(true);

      // Announce device
      this.ws!.send(JSON.stringify({
        type: 'device_hello',
        deviceId: this.deviceId,
        deviceName: this.deviceName,
      }));

      // Flush queued messages
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift();
        if (msg) this.ws!.send(msg);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        for (const h of this.handlers) h(msg);
      } catch {}
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected');
      this._isConnected = false;
      this.onStatusChange?.(false);
      if (this._shouldConnect) this._scheduleReconnect();
    };

    this.ws.onerror = (e) => {
      console.warn('[WS] Error:', e);
    };
  }

  private _disconnect() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this._isConnected = false;
    this.onStatusChange?.(false);
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  private _scheduleReconnect() {
    if (this.reconnectTimer) return;
    console.log(`[WS] Reconnecting in ${RECONNECT_DELAY_MS}ms…`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connect();
    }, RECONNECT_DELAY_MS);
  }
}

export const wsService = new WebSocketService();
