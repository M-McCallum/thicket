/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'cyber-bg': {
          DEFAULT: '#0a0a0f',
          secondary: '#12121a',
          tertiary: '#1a1a2e',
          elevated: '#222236'
        },
        'neon-cyan': {
          DEFAULT: '#00f0ff',
          dim: '#00a0aa',
          glow: '#00f0ff40'
        },
        'neon-magenta': {
          DEFAULT: '#ff00aa',
          dim: '#aa0077',
          glow: '#ff00aa40'
        },
        'neon-green': {
          DEFAULT: '#00ff88',
          dim: '#00aa5c'
        },
        'neon-red': {
          DEFAULT: '#ff0040',
          dim: '#aa002a'
        },
        'neon-purple': {
          DEFAULT: '#b000ff',
          dim: '#7700aa'
        },
        'cyber-text': {
          primary: '#e0e0f0',
          secondary: '#8888aa',
          muted: '#555577'
        }
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['Share Tech Mono', 'monospace']
      },
      boxShadow: {
        'glow-cyan': '0 0 10px #00f0ff40, 0 0 20px #00f0ff20',
        'glow-magenta': '0 0 10px #ff00aa40, 0 0 20px #ff00aa20',
        'glow-green': '0 0 10px #00ff8840, 0 0 20px #00ff8820',
        'glow-purple': '0 0 10px #b000ff40, 0 0 20px #b000ff20'
      },
      animation: {
        'pulse-neon': 'pulse-neon 2s ease-in-out infinite',
        glitch: 'glitch 0.3s ease-in-out',
        scanline: 'scanline 8s linear infinite'
      },
      keyframes: {
        'pulse-neon': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' }
        },
        glitch: {
          '0%': { clipPath: 'inset(40% 0 61% 0)' },
          '20%': { clipPath: 'inset(92% 0 1% 0)' },
          '40%': { clipPath: 'inset(43% 0 1% 0)' },
          '60%': { clipPath: 'inset(25% 0 58% 0)' },
          '80%': { clipPath: 'inset(54% 0 7% 0)' },
          '100%': { clipPath: 'inset(58% 0 43% 0)' }
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' }
        }
      }
    }
  },
  plugins: []
}
