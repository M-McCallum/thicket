/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'sol-bg': {
          DEFAULT: 'rgb(var(--color-bg) / <alpha-value>)',
          secondary: 'rgb(var(--color-bg-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--color-bg-tertiary) / <alpha-value>)',
          elevated: 'rgb(var(--color-bg-elevated) / <alpha-value>)'
        },
        'sol-amber': {
          DEFAULT: 'rgb(var(--color-amber) / <alpha-value>)',
          dim: 'rgb(var(--color-amber-dim) / <alpha-value>)',
          glow: 'rgb(var(--color-amber) / 0.25)'
        },
        'sol-rose': {
          DEFAULT: 'rgb(var(--color-rose) / <alpha-value>)',
          dim: 'rgb(var(--color-rose-dim) / <alpha-value>)',
          glow: 'rgb(var(--color-rose) / 0.25)'
        },
        'sol-green': {
          DEFAULT: 'rgb(var(--color-green) / <alpha-value>)',
          dim: 'rgb(var(--color-green-dim) / <alpha-value>)'
        },
        'sol-coral': {
          DEFAULT: 'rgb(var(--color-coral) / <alpha-value>)',
          dim: 'rgb(var(--color-coral-dim) / <alpha-value>)'
        },
        'sol-sage': {
          DEFAULT: 'rgb(var(--color-sage) / <alpha-value>)',
          dim: 'rgb(var(--color-sage-dim) / <alpha-value>)'
        },
        'sol-text': {
          primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted) / <alpha-value>)'
        }
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body: ['Nunito', 'sans-serif'],
        mono: ['Fira Mono', 'monospace']
      },
      boxShadow: {
        'glow-amber': '0 0 12px rgb(var(--color-amber) / 0.21), 0 0 24px rgb(var(--color-amber) / 0.09)',
        'glow-green': '0 0 12px rgb(var(--color-green) / 0.21), 0 0 24px rgb(var(--color-green) / 0.09)',
        'glow-coral': '0 0 12px rgb(var(--color-coral) / 0.21), 0 0 24px rgb(var(--color-coral) / 0.09)',
        'glow-sage': '0 0 12px rgb(var(--color-sage) / 0.21), 0 0 24px rgb(var(--color-sage) / 0.09)',
        'glow-rose': '0 0 12px rgb(var(--color-rose) / 0.21), 0 0 24px rgb(var(--color-rose) / 0.09)'
      },
      animation: {
        breathe: 'breathe 4s ease-in-out infinite',
        dappled: 'dappled 12s ease-in-out infinite',
        'grow-in': 'grow-in 0.3s ease-out'
      },
      keyframes: {
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' }
        },
        dappled: {
          '0%': { backgroundPosition: '0% 0%' },
          '50%': { backgroundPosition: '100% 100%' },
          '100%': { backgroundPosition: '0% 0%' }
        },
        'grow-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        }
      }
    }
  },
  plugins: []
}
