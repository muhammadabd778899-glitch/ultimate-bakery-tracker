/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pink: {
          DEFAULT: '#F1789E',
          50: '#FFF1F5',
          100: '#FFE1EA',
          200: '#FFC7D8',
          300: '#FBA3BE',
          400: '#F1789E',
          500: '#E35683',
          600: '#C93E6B',
          700: '#A62F55',
          800: '#7E2341',
          900: '#5A1A2E'
        },
        blush: '#FFEAF1',
        pale: '#FFF8F3',
        warm: '#FFFDFB',
        surface: '#FAF0EA',
        line: '#F1E0D6',
        ink: '#3D2633',
        muted: '#8A6F7B',
        ok: '#3FA372',
        warn: '#E7A13B',
        bad: '#D9536B',
        apricot: '#F59E6B',
        butter: '#F4C95D',
        mint: '#58C99A',
        sky: '#62B4E8',
        lilac: '#A78BFA',
        berry: '#C93E6B',
        cocoa: '#3B2230',
        cream: '#FFF6EC',
        coral: '#EF7C6B'
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px rgba(61,38,51,0.04), 0 10px 30px -18px rgba(201,62,107,0.22)',
        pop: '0 18px 44px -20px rgba(61,38,51,0.35)',
        glow: '0 12px 30px -14px rgba(227,86,131,0.55)'
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.15rem',
        '3xl': '1.6rem'
      },
      keyframes: {
        floaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-7px)' }
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        floaty: 'floaty 7s ease-in-out infinite',
        rise: 'rise .35s ease-out both'
      }
    }
  },
  plugins: []
}
