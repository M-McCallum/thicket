/** @type {import('tailwindcss').Config} */

function withOpacity(variableName) {
  return ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `rgb(var(${variableName}) / ${opacityValue})`
    }
    return `rgb(var(${variableName}))`
  }
}

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'sol-bg': {
          DEFAULT: withOpacity('--sol-bg'),
          secondary: withOpacity('--sol-bg-secondary'),
          tertiary: withOpacity('--sol-bg-tertiary'),
          elevated: withOpacity('--sol-bg-elevated')
        },
        'sol-amber': {
          DEFAULT: withOpacity('--sol-amber'),
          dim: withOpacity('--sol-amber-dim'),
          glow: 'rgb(var(--sol-amber) / 0.25)'
        },
        'sol-rose': {
          DEFAULT: withOpacity('--sol-rose'),
          dim: withOpacity('--sol-rose-dim'),
          glow: 'rgb(var(--sol-rose) / 0.25)'
        },
        'sol-green': {
          DEFAULT: withOpacity('--sol-green'),
          dim: withOpacity('--sol-green-dim')
        },
        'sol-coral': {
          DEFAULT: withOpacity('--sol-coral'),
          dim: withOpacity('--sol-coral-dim')
        },
        'sol-sage': {
          DEFAULT: withOpacity('--sol-sage'),
          dim: withOpacity('--sol-sage-dim')
        },
        'sol-text': {
          primary: withOpacity('--sol-text-primary'),
          secondary: withOpacity('--sol-text-secondary'),
          muted: withOpacity('--sol-text-muted')
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
