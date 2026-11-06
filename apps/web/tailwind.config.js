/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px' },
    extend: {
      colors: {
        ax: {
          green: '#00BF80',
          'green-text': '#007A55',
          'green-deep': '#005E42',
          mint: '#E3F8EF',
          'mint-strong': '#BFF0DC',
          navy: '#192338',
          'navy-deep': '#111A2B',
          'navy-card': '#1A2640',
          'navy-line': '#24344F',
          'navy-sub': '#9FB0C8',
          bg: '#F4F9F6',
          card: '#FFFFFF',
          surface: '#EDF3F7',
          border: '#E1EAF0',
          muted: '#5E6F86',
          busy: '#A3302A',
          'busy-bg': '#FDF0EF',
          deal: '#F2B53A',
          'deal-bg': '#FDF1D6',
          'deal-text': '#7A5300',
          reserved: '#2F6FED',
          'reserved-bg': '#EAF1FE',
        },
        ctl: {
          bg: '#0E1626',
          panel: '#16213A',
          raised: '#1C2A47',
          line: '#26375A',
          text: '#E3EAF4',
          sub: '#9FB0C8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        card: '20px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(25,35,56,.06)',
        sheet: '0 -8px 30px rgba(25,35,56,.14)',
        float: '0 10px 30px rgba(25,35,56,.16)',
        fab: '0 6px 16px rgba(0,191,128,.45)',
      },
      spacing: {
        nav: '84px',
      },
    },
  },
  plugins: [],
};
