import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebSocketService } from '../ws'

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3

  readyState = MockWebSocket.OPEN
  url: string

  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null

  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent('close'))
    }
  })

  constructor(url: string) {
    this.url = url
    // Simulate async open
    setTimeout(() => {
      if (this.readyState !== MockWebSocket.CLOSED) {
        this.readyState = MockWebSocket.OPEN
        if (this.onopen) this.onopen(new Event('open'))
      }
    }, 0)
  }

  // Helper to simulate receiving a message
  _receive(data: unknown): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }))
    }
  }

  _receiveRaw(data: string): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }))
    }
  }
}

let instances: MockWebSocket[] = []

function getLatestWS(): MockWebSocket {
  return instances[instances.length - 1]
}

describe('WebSocketService', () => {
  let service: WebSocketService

  beforeEach(() => {
    vi.useFakeTimers()
    instances = []
    const MockWSConstructor = vi.fn((url: string) => {
      const ws = new MockWebSocket(url)
      instances.push(ws)
      return ws
    })
    // The production code uses WebSocket.OPEN for readyState comparison
    Object.assign(MockWSConstructor, {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3
    })
    globalThis.WebSocket = MockWSConstructor as unknown as typeof WebSocket
    service = new WebSocketService()
  })

  afterEach(() => {
    service.disconnect()
    vi.useRealTimers()
  })

  describe('Connection', () => {
    it('creates WebSocket with correct URL', () => {
      service.connect('test-token')
      expect(globalThis.WebSocket).toHaveBeenCalledWith('ws://localhost:8080/ws')
    })

    it('sends IDENTIFY on open', async () => {
      service.connect('test-token')
      await vi.advanceTimersByTimeAsync(0) // trigger onopen

      const ws = getLatestWS()
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'IDENTIFY', data: { token: 'test-token' } })
      )
    })

    it('disconnect closes WS and stops reconnection', async () => {
      service.connect('test-token')
      await vi.advanceTimersByTimeAsync(0)

      const ws = getLatestWS()
      service.disconnect()

      expect(ws.close).toHaveBeenCalled()

      // Should not reconnect after disconnect
      await vi.advanceTimersByTimeAsync(10000)
      expect(instances).toHaveLength(1)
    })

    it('disconnect clears heartbeat interval', async () => {
      service.connect('test-token')
      await vi.advanceTimersByTimeAsync(0) // trigger onopen

      service.disconnect()

      // Advance past heartbeat interval - no send should occur after disconnect
      const ws = getLatestWS()
      const sendCountAfterDisconnect = ws.send.mock.calls.length
      await vi.advanceTimersByTimeAsync(60000)
      // close() was called but no new heartbeat sends
      expect(ws.send.mock.calls.length).toBe(sendCountAfterDisconnect)
    })
  })

  describe('Heartbeat', () => {
    it('sends HEARTBEAT every 30s after connect', async () => {
      service.connect('test-token')
      await vi.advanceTimersByTimeAsync(0) // trigger onopen

      const ws = getLatestWS()
      // First call is IDENTIFY
      expect(ws.send).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(30000)
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'HEARTBEAT' }))

      await vi.advanceTimersByTimeAsync(30000)
      // IDENTIFY + 2 heartbeats = 3
      expect(ws.send).toHaveBeenCalledTimes(3)
    })
  })

  describe('Event Dispatch', () => {
    it('on() registers handler and dispatches events', async () => {
      const handler = vi.fn()
      service.on('MESSAGE_CREATE', handler)
      service.connect('test-token')
      await vi.advanceTimersByTimeAsync(0)

      const ws = getLatestWS()
      ws._receive({ type: 'MESSAGE_CREATE', data: { id: '1', content: 'hello' } })

      expect(handler).toHaveBeenCalledWith({ id: '1', content: 'hello' })
    })

    it('on() returns working unsubscribe function', async () => {
      const handler = vi.fn()
      const unsub = service.on('MESSAGE_CREATE', handler)
      service.connect('test-token')
      await vi.advanceTimersByTimeAsync(0)

      const ws = getLatestWS()
      ws._receive({ type: 'MESSAGE_CREATE', data: { id: '1' } })
      expect(handler).toHaveBeenCalledTimes(1)

      unsub()
      ws._receive({ type: 'MESSAGE_CREATE', data: { id: '2' } })
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('multiple handlers for same event both fire', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      service.on('MESSAGE_CREATE', handler1)
      service.on('MESSAGE_CREATE', handler2)
      service.connect('test-token')
      await vi.advanceTimersByTimeAsync(0)

      const ws = getLatestWS()
      ws._receive({ type: 'MESSAGE_CREATE', data: { id: '1' } })

      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)
    })

    it('ignores malformed (non-JSON) messages', async () => {
      const handler = vi.fn()
      service.on('MESSAGE_CREATE', handler)
      service.connect('test-token')
      await vi.advanceTimersByTimeAsync(0)

      const ws = getLatestWS()
      ws._receiveRaw('not valid json {{{')

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('Send Methods', () => {
    it('send does nothing when not connected', () => {
      // Service not connected, no WS instance
      service.send({ type: 'HEARTBEAT' })
      expect(instances).toHaveLength(0)
    })

    it('subscribe/unsubscribe/sendTyping send correct events', async () => {
      service.connect('test-token')
      await vi.advanceTimersByTimeAsync(0)

      const ws = getLatestWS()
      ws.send.mockClear()

      service.subscribe('ch-1')
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'SUBSCRIBE', data: { channel_id: 'ch-1' } })
      )

      service.unsubscribe('ch-1')
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'UNSUBSCRIBE', data: { channel_id: 'ch-1' } })
      )

      service.sendTyping('ch-1')
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'TYPING_START', data: { channel_id: 'ch-1' } })
      )
    })
  })

  describe('Reconnection', () => {
    it('reconnects with exponential backoff on unexpected close', async () => {
      service.connect('test-token')
      await vi.advanceTimersByTimeAsync(0) // trigger onopen
      expect(instances).toHaveLength(1)

      // Simulate unexpected close (server drops connection)
      const ws = getLatestWS()
      ws.readyState = MockWebSocket.CLOSED
      ws.onclose!(new CloseEvent('close'))

      // First reconnect at 3000ms
      await vi.advanceTimersByTimeAsync(3000)
      expect(instances).toHaveLength(2)

      // Simulate second close
      const ws2 = getLatestWS()
      await vi.advanceTimersByTimeAsync(0) // trigger onopen
      ws2.readyState = MockWebSocket.CLOSED
      ws2.onclose!(new CloseEvent('close'))

      // Second reconnect at 6000ms (doubled)
      await vi.advanceTimersByTimeAsync(3000)
      expect(instances).toHaveLength(2) // not yet
      await vi.advanceTimersByTimeAsync(3000)
      expect(instances).toHaveLength(3)
    })
  })
})
