import { supabase } from './SupabaseClient';

export type WsMessage =
  | { type: 'start_stream' }
  | { type: 'stop_stream' }
  | { type: 'start_recording' }
  | { type: 'stop_recording' };

type MessageHandler = (msg: WsMessage) => void;

class WebSocketService {
  private channel: any;
  private deviceId: string = '';
  private handlers: Set<MessageHandler> = new Set();
  private _isConnected: boolean = false;

  onStatusChange?: (connected: boolean) => void;

  async init() {
    this._connect();
  }

  async reconnect(url: string, deviceId: string, deviceName: string, authToken?: string) {
    this.deviceId = deviceId;
    this._disconnect();
    this._connect();
  }

  disconnect() {
    this._disconnect();
  }

  get isConnected() { return this._isConnected; }

  addHandler(h: MessageHandler) { this.handlers.add(h); }
  removeHandler(h: MessageHandler) { this.handlers.delete(h); }

  send(obj: any) {
    if (this._isConnected && this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'mobile_msg',
        payload: { ...obj, deviceId: obj.deviceId || this.deviceId },
      });
    }
  }

  private _connect() {
    this.channel = supabase.channel(`micnet_room`);

    this.channel
      .on('broadcast', { event: 'manager_cmd' }, (payload: any) => {
        const msg = payload.payload;
        if (msg.deviceId === this.deviceId || msg.deviceId === 'all') {
          for (const h of this.handlers) h(msg as WsMessage);
        }
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          this._isConnected = true;
          this.onStatusChange?.(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this._isConnected = false;
          this.onStatusChange?.(false);
        }
      });
  }

  private _disconnect() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this._isConnected = false;
    this.onStatusChange?.(false);
  }
}

export const wsService = new WebSocketService();
