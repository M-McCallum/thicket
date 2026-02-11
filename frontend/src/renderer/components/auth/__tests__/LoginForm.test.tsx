import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginForm from '../LoginForm'
import { useAuthStore } from '../../../stores/authStore'

vi.mock('../../../services/api', () => ({
  auth: {
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn()
  },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  setOnTokenRefresh: vi.fn()
}))

vi.mock('../../../services/ws', () => ({
  wsService: {
    connect: vi.fn(),
    disconnect: vi.fn()
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

  it('renders login mode by default', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: 'JACK IN' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('runner@thicket.app')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('netrunner')).not.toBeInTheDocument()
  })

  it('toggles to signup mode', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.click(screen.getByText("Don't have an account? Sign up"))

    expect(screen.getByPlaceholderText('netrunner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CREATE ACCOUNT' })).toBeInTheDocument()
  })

  it('toggles back to login', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.click(screen.getByText("Don't have an account? Sign up"))
    expect(screen.getByPlaceholderText('netrunner')).toBeInTheDocument()

    await user.click(screen.getByText('Already have an account? Log in'))
    expect(screen.queryByPlaceholderText('netrunner')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JACK IN' })).toBeInTheDocument()
  })

  it('submits login', async () => {
    const { auth } = await import('../../../services/api')
    vi.mocked(auth.login).mockResolvedValue({
      user: { id: 'u1', username: 'test', email: 'test@test.com', display_name: null, avatar_url: null, status: 'online' },
      access_token: 'at',
      refresh_token: 'rt'
    })

    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByPlaceholderText('runner@thicket.app'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
    await user.click(screen.getByRole('button', { name: 'JACK IN' }))

    await waitFor(() => {
      expect(auth.login).toHaveBeenCalledWith({ email: 'test@test.com', password: 'password123' })
    })
  })

  it('submits signup', async () => {
    const { auth } = await import('../../../services/api')
    vi.mocked(auth.signup).mockResolvedValue({
      user: { id: 'u1', username: 'newuser', email: 'new@test.com', display_name: null, avatar_url: null, status: 'online' },
      access_token: 'at',
      refresh_token: 'rt'
    })

    const user = userEvent.setup()
    render(<LoginForm />)

    await user.click(screen.getByText("Don't have an account? Sign up"))
    await user.type(screen.getByPlaceholderText('netrunner'), 'newuser')
    await user.type(screen.getByPlaceholderText('runner@thicket.app'), 'new@test.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
    await user.click(screen.getByRole('button', { name: 'CREATE ACCOUNT' }))

    await waitFor(() => {
      expect(auth.signup).toHaveBeenCalledWith({
        username: 'newuser',
        email: 'new@test.com',
        password: 'password123'
      })
    })
  })

  it('shows loading state', () => {
    useAuthStore.setState({ isLoading: true })

    render(<LoginForm />)
    expect(screen.getByRole('button', { name: 'CONNECTING...' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CONNECTING...' })).toBeDisabled()
  })

  it('displays error', () => {
    useAuthStore.setState({ error: 'Invalid credentials' })

    render(<LoginForm />)
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
  })

  it('renders THICKET branding', () => {
    render(<LoginForm />)
    expect(screen.getByText('THICKET')).toBeInTheDocument()
  })
})
