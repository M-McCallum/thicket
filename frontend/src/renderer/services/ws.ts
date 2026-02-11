import type { WSEvent, WSEventType } from '../types/ws'

const WS_URL = 'ws://localhost:8080/ws'
const HEARTBEAT_INTERVAL = 30000
const RECONNECT_DELAY = 3000
const MAX_RECONNECT_DELAY = 30000

type EventHandler = (data: unknown) => void

export class WebSocketService {
  private ws: WebSocket | null = null
  private token: string | null = null
  private handlers: Map<WSEventType, Set<EventHandler>> = new Map()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = RECONNECT_DELAY
  private shouldReconnect = false

  connect(token: string): void {
    this.token = token
    this.shouldReconnect = true
    this.doConnect()
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.cleanup()
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

  private doConnect(): void {
    if (!this.token) return

    this.ws = new WebSocket(WS_URL)

    this.ws.onopen = () => {
      this.send({ type: 'IDENTIFY', data: { token: this.token } })
      this.reconnectDelay = RECONNECT_DELAY
      this.startHeartbeat()
    }

    this.ws.onmessage = (event) => {
      try {
        const wsEvent: WSEvent = JSON.parse(event.data)
        this.dispatch(wsEvent)
      } catch {
        // Ignore malformed messages
      }
    }

    this.ws.onclose = () => {
      this.stopHeartbeat()
      if (this.shouldReconnect) {
        this.scheduleReconnect()
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
