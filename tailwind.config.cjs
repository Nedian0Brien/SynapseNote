const colors = require('./tailwind/colors.cjs');
const boxShadow = require('./tailwind/box-shadow.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/react-tailwindcss-datepicker/dist/index.esm.js',
  ],
  important: '#body',
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ...colors,
        // Chat-specific colors for focus states (avoiding conflicts with existing system)
        ring: 'hsl(var(--ring))',
        'chat-primary': {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        'chat-border': 'hsl(var(--border))',
        // Missing color classes for template.css and app.scss
        'border-primary': 'var(--line-border)',
        'fill-default': 'var(--fill-default)',
      },
      caretColor: {
        'fill-default': 'var(--fill-default)',
      },
      boxShadow,
      borderRadius: {
        100: '4px',
        200: '6px',
        300: '8px',
        400: '12px',
        500: '16px',
        600: '20px',
      },
      padding: {
        100: '4px',
        200: '6px',
        300: '8px',
        400: '12px',
        500: '16px',
        600: '20px',
        xs: '4px',
        sm: '6px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
      keyframes: {
        blink: {
          '0%, 50%': { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
      },
      animation: {
        blink: 'blink 1s infinite',
      },
    },
  },
  plugins: [],
};
