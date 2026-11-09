/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pink: {
          DEFAULT: '#E8A3BA',
          50: '#FFF4F7',
          100: '#FCE9EF',
          200: '#F7D6E1',
          300: '#F0C0D1',
          400: '#E8A3BA',
          500: '#DE8CAA',
          600: '#C96F91',
          700: '#B25A7B',
          800: '#8F4864',
          900: '#6E384E'
        },
        blush: '#FCE9EF',
        pale: '#FFF4F7',
        warm: '#FFFCFD',
        surface: '#F5F5F7',
        line: '#F0DDE4',
        ink: '#493B42',
        muted: '#8D7D85',
        ok: '#75A98A',
        warn: '#E4AD65',
        bad: '#D77A83'
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px rgba(73,59,66,0.04), 0 4px 16px rgba(201,111,145,0.06)',
        pop: '0 8px 32px rgba(73,59,66,0.12)'
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.15rem'
      }
    }
  },
  plugins: []
}
