/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'sol-bg': {
          DEFAULT: '#141e13',
          secondary: '#1c2a1a',
          tertiary: '#243222',
          elevated: '#2f3d2c'
        },
        'sol-amber': {
          DEFAULT: '#e8a926',
          dim: '#b08020',
          glow: '#e8a92640'
        },
        'sol-rose': {
          DEFAULT: '#c47a8a',
          dim: '#9a5a68',
          glow: '#c47a8a40'
        },
        'sol-green': {
          DEFAULT: '#5cba5c',
          dim: '#3d8a3d'
        },
        'sol-coral': {
          DEFAULT: '#d96850',
          dim: '#a04838'
        },
        'sol-sage': {
          DEFAULT: '#8aad78',
          dim: '#6a8a5e'
        },
        'sol-text': {
          primary: '#e8e0d0',
          secondary: '#9a9280',
          muted: '#605848'
        }
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body: ['Nunito', 'sans-serif'],
        mono: ['Fira Mono', 'monospace']
      },
      boxShadow: {
        'glow-amber': '0 0 12px #e8a92635, 0 0 24px #e8a92618',
        'glow-green': '0 0 12px #5cba5c35, 0 0 24px #5cba5c18',
        'glow-coral': '0 0 12px #d9685035, 0 0 24px #d9685018',
        'glow-sage': '0 0 12px #8aad7835, 0 0 24px #8aad7818',
        'glow-rose': '0 0 12px #c47a8a35, 0 0 24px #c47a8a18'
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
