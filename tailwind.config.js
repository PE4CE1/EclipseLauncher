/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        hub: {
          base:     '#040405',
          surface:  '#0a0a0c',
          elevated: '#121214',
          border:   '#27272a',
          accent:   '#ffffff',
          'accent-hover': '#e4e4e7',
          muted:    '#71717a',
          text:     '#fafafa',
          'text-secondary': '#a1a1aa',
          success:  '#10b981',
          warning:  '#f59e0b',
          danger:   '#ef4444',
          steam:    '#000000',
          'steam-accent': '#fafafa',
          epic:     '#000000',
          'epic-accent': '#fafafa',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'glass': 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
      },
      backdropBlur: {
        xs: '2px',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      animation: {
        'shimmer':    'shimmer 2.5s ease-in-out infinite',
        'fade-in':    'fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up':   'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-left': 'slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow':       'glow 3s ease-in-out infinite alternate',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          from: { opacity: '0', transform: 'translateX(-20px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        glow: {
          from: { boxShadow: '0 0 10px rgba(255, 255, 255, 0.05)' },
          to:   { boxShadow: '0 0 25px rgba(255, 255, 255, 0.15)' },
        },
      },
      boxShadow: {
        'glass':    '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        'card':     '0 10px 40px -10px rgba(0,0,0,0.8)',
        'accent':   '0 0 30px rgba(255,255,255,0.1)',
        'glow-sm':  '0 0 15px rgba(255,255,255,0.05)',
      },
      borderRadius: {
        'xl2': '1rem',
        'xl3': '1.25rem',
      },
    },
  },
  plugins: [],
}
