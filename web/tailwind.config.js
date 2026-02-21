/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'sol-bg': {
          DEFAULT: 'rgb(var(--sol-bg) / <alpha-value>)',
          secondary: 'rgb(var(--sol-bg-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--sol-bg-tertiary) / <alpha-value>)',
          elevated: 'rgb(var(--sol-bg-elevated) / <alpha-value>)'
        },
        'sol-amber': {
          DEFAULT: 'rgb(var(--sol-amber) / <alpha-value>)',
          dim: 'rgb(var(--sol-amber-dim) / <alpha-value>)',
          glow: 'rgb(var(--sol-amber) / 0.25)'
        },
        'sol-rose': {
          DEFAULT: 'rgb(var(--sol-rose) / <alpha-value>)',
          dim: 'rgb(var(--sol-rose-dim) / <alpha-value>)',
          glow: 'rgb(var(--sol-rose) / 0.25)'
        },
        'sol-green': {
          DEFAULT: 'rgb(var(--sol-green) / <alpha-value>)',
          dim: 'rgb(var(--sol-green-dim) / <alpha-value>)'
        },
        'sol-coral': {
          DEFAULT: 'rgb(var(--sol-coral) / <alpha-value>)',
          dim: 'rgb(var(--sol-coral-dim) / <alpha-value>)'
        },
        'sol-sage': {
          DEFAULT: 'rgb(var(--sol-sage) / <alpha-value>)',
          dim: 'rgb(var(--sol-sage-dim) / <alpha-value>)'
        },
        'sol-text': {
          primary: 'rgb(var(--sol-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--sol-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--sol-text-muted) / <alpha-value>)'
        }
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body: ['Nunito', 'sans-serif'],
        mono: ['Fira Mono', 'monospace']
      },
      boxShadow: {
        'glow-amber': '0 0 12px rgb(var(--sol-amber) / 0.21), 0 0 24px rgb(var(--sol-amber) / 0.09)',
        'glow-green': '0 0 12px rgb(var(--sol-green) / 0.21), 0 0 24px rgb(var(--sol-green) / 0.09)',
        'glow-coral': '0 0 12px rgb(var(--sol-coral) / 0.21), 0 0 24px rgb(var(--sol-coral) / 0.09)',
        'glow-sage': '0 0 12px rgb(var(--sol-sage) / 0.21), 0 0 24px rgb(var(--sol-sage) / 0.09)',
        'glow-rose': '0 0 12px rgb(var(--sol-rose) / 0.21), 0 0 24px rgb(var(--sol-rose) / 0.09)'
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
