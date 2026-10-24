import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: '#20231F',
        olive: '#20231F',
        ink: '#20231F',
        sage: '#69775E',
        'light-sage': '#DCE4D6',
        cream: '#F8F6F1',
        terracotta: '#B96E52',
        'terracotta-ink': '#8E4E38',
        charcoal: '#20231F',
        muted: '#686A63',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        heading: ['Poppins', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        editorial: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        urdu: ['Noto Sans Arabic', 'Noto Nastaliq Urdu', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 30px rgba(32, 35, 31, 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config
