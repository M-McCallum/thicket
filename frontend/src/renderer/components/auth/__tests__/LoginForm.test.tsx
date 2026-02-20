import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginForm from '../LoginForm'
import { useAuthStore } from '../../../stores/authStore'

vi.mock('../../../services/api', () => ({
  auth: {
    logout: vi.fn(),
    me: vi.fn()
  },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  setOAuthRefreshHandler: vi.fn()
}))

vi.mock('../../../services/ws', () => ({
  wsService: {
    connect: vi.fn(),
    disconnect: vi.fn()
  }
}))

vi.mock('../../../services/oauth', () => ({
  oauthService: {
    startLogin: vi.fn(),
    handleCallback: vi.fn(),
    refreshToken: vi.fn(),
    logout: vi.fn()
  }
}))

describe('LoginForm', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null
    })
    vi.clearAllMocks()
  })

  it('renders OAuth login button', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: 'Enter the Grove' })).toBeInTheDocument()
  })

  it('shows loading state', () => {
    useAuthStore.setState({ isLoading: true })

    render(<LoginForm />)
    expect(screen.getByRole('button', { name: 'Growing...' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Growing...' })).toBeDisabled()
  })

  it('displays error', () => {
    useAuthStore.setState({ error: 'Invalid credentials' })

    render(<LoginForm />)
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
  })

  it('renders Thicket branding', () => {
    render(<LoginForm />)
    expect(screen.getByText('Thicket')).toBeInTheDocument()
  })

  it('calls startLogin on OAuth button click', async () => {
    const { oauthService } = await import('../../../services/oauth')
    vi.mocked(oauthService.startLogin).mockResolvedValue(undefined)

    const user = userEvent.setup()
    render(<LoginForm />)

    await user.click(screen.getByRole('button', { name: 'Enter the Grove' }))

    await waitFor(() => {
      expect(oauthService.startLogin).toHaveBeenCalled()
    })
  })
})
