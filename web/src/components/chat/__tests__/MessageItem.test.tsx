import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MessageItem from '../MessageItem'
import type { Message } from '../../../types/models'

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    channel_id: 'c1',
    author_id: 'u1',
    content: 'Hello world',
    created_at: '2025-01-15T10:30:00Z',
    updated_at: '2025-01-15T10:30:00Z',
    author_username: 'testuser',
    author_display_name: 'Test User',
    ...overrides
  }
}

describe('MessageItem', () => {
  it('renders author display name', () => {
    render(<MessageItem message={makeMessage()} isOwn={false} />)
    expect(screen.getByText('Test User')).toBeInTheDocument()
  })

  it('falls back to username', () => {
    render(<MessageItem message={makeMessage({ author_display_name: null })} isOwn={false} />)
    expect(screen.getByText('testuser')).toBeInTheDocument()
  })

  it('falls back to "Unknown"', () => {
    render(
      <MessageItem
        message={makeMessage({ author_display_name: null, author_username: undefined })}
        isOwn={false}
      />
    )
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('renders message content', () => {
    render(<MessageItem message={makeMessage({ content: 'My test message' })} isOwn={false} />)
    expect(screen.getByText('My test message')).toBeInTheDocument()
  })

  it('renders formatted time', () => {
    render(<MessageItem message={makeMessage()} isOwn={false} />)
    // toLocaleTimeString with hour:2-digit, minute:2-digit produces a time string
    const timeElement = screen.getByText(/\d{1,2}:\d{2}/)
    expect(timeElement).toBeInTheDocument()
  })

  it('shows "(edited)" when timestamps differ', () => {
    render(
      <MessageItem
        message={makeMessage({
          created_at: '2025-01-15T10:30:00Z',
          updated_at: '2025-01-15T10:35:00Z'
        })}
        isOwn={false}
      />
    )
    expect(screen.getByText('(edited)')).toBeInTheDocument()
  })

  it('hides "(edited)" when timestamps match', () => {
    render(<MessageItem message={makeMessage()} isOwn={false} />)
    expect(screen.queryByText('(edited)')).not.toBeInTheDocument()
  })

  it('applies own-message styling', () => {
    render(<MessageItem message={makeMessage()} isOwn={true} />)
    const displayName = screen.getByText('Test User')
    expect(displayName.className).toContain('text-sol-amber')
  })
})
