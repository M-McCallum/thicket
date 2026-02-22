import type { WSEvent, WSEventType } from '../types/ws'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'
const WS_URL = API_BASE.replace(/^http/, 'ws').replace(/\/api$/, '/ws')
const HEARTBEAT_INTERVAL = 30000
const RECONNECT_DELAY = 3000
const MAX_RECONNECT_DELAY = 30000
const SESSION_EXPIRED_CLOSE_CODE = 4001

export type WSConnectionStatus = 'connected' | 'connecting' | 'disconnected'

type EventHandler = (data: unknown) => void
type StatusListener = (status: WSConnectionStatus) => void

export class WebSocketService {
  private ws: WebSocket | null = null
  private token: string | null = null
  private handlers: Map<WSEventType, Set<EventHandler>> = new Map()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = RECONNECT_DELAY
  private shouldReconnect = false
  private onSessionExpired: (() => void) | null = null
  private _status: WSConnectionStatus = 'disconnected'
  private statusListeners: Set<StatusListener> = new Set()

  get status(): WSConnectionStatus {
    return this._status
  }

  private setStatus(status: WSConnectionStatus): void {
    if (this._status === status) return
    this._status = status
    this.statusListeners.forEach((l) => l(status))
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    return () => { this.statusListeners.delete(listener) }
  }

  connect(token: string): void {
    this.token = token
    this.shouldReconnect = true
    this.doConnect()
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.cleanup()
    this.setStatus('disconnected')
  }

  on(event: WSEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)

    return () => {
      this.handlers.get(event)?.delete(handler)
    }
  }

  send(event: WSEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event))
    }
  }

  subscribe(channelId: string): void {
    this.send({ type: 'SUBSCRIBE', data: { channel_id: channelId } })
  }

  unsubscribe(channelId: string): void {
    this.send({ type: 'UNSUBSCRIBE', data: { channel_id: channelId } })
  }

  sendTyping(channelId: string): void {
    this.send({ type: 'TYPING_START', data: { channel_id: channelId } })
  }

  sendTokenRefresh(newToken: string): void {
    this.token = newToken
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'TOKEN_REFRESH', data: { token: newToken } })
    }
    // If WS is closed/reconnecting, the new token will be used on next IDENTIFY
  }

  setOnSessionExpired(handler: () => void): void {
    this.onSessionExpired = handler
  }

  private doConnect(): void {
    if (!this.token) return

    this.setStatus('connecting')
    this.ws = new WebSocket(WS_URL)

    this.ws.onopen = () => {
      this.send({ type: 'IDENTIFY', data: { token: this.token } })
      this.reconnectDelay = RECONNECT_DELAY
      this.startHeartbeat()
      this.setStatus('connected')
    }

    this.ws.onmessage = (event) => {
      try {
        const wsEvent: WSEvent = JSON.parse(event.data)

        if (wsEvent.type === 'SESSION_EXPIRED') {
          this.shouldReconnect = false
          this.cleanup()
          this.setStatus('disconnected')
          this.onSessionExpired?.()
          return
        }

        this.dispatch(wsEvent)
      } catch {
        // Ignore malformed messages
      }
    }

    this.ws.onclose = (event) => {
      this.stopHeartbeat()
      if (event.code === SESSION_EXPIRED_CLOSE_CODE) {
        this.shouldReconnect = false
        this.setStatus('disconnected')
        this.onSessionExpired?.()
        return
      }
      if (this.shouldReconnect) {
        this.setStatus('connecting')
        this.scheduleReconnect()
      } else {
        this.setStatus('disconnected')
      }
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  private dispatch(event: WSEvent): void {
    const handlers = this.handlers.get(event.type)
    if (handlers) {
      handlers.forEach((handler) => handler(event.data))
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'HEARTBEAT' })
    }, HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.doConnect()
    }, this.reconnectDelay)

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY)
  }

  private cleanup(): void {
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

export const wsService = new WebSocketService()
