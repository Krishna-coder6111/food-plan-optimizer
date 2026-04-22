/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream:    { 50: '#FEFCF8', 100: '#FBF7EE', 200: '#F5EDDB', 300: '#EDE0C4' },
        stone:    { 50: '#FAF9F7', 100: '#F3F1ED', 200: '#E8E4DD', 300: '#D9D3C7', 400: '#B8AFA0', 500: '#918779', 600: '#6B6358', 700: '#4A453D', 800: '#2E2A25', 900: '#1A1815' },
        sage:     { 50: '#F4F7F4', 100: '#E4ECE4', 200: '#C5D6C5', 300: '#97B897', 400: '#6B9A6B', 500: '#4F7D4F', 600: '#3D6340', 700: '#2D4A30' },
        terra:    { 50: '#FEF5F0', 100: '#FDE8DC', 200: '#FACDB5', 300: '#F5A67A', 400: '#E8854E', 500: '#D4692F', 600: '#B24F1C', 700: '#8A3C15' },
        navy:     { 50: '#F0F2F7', 100: '#D8DDE8', 200: '#B1BBCF', 300: '#8A98B6', 400: '#5E7099', 500: '#3F5278', 600: '#2E3D5C', 700: '#1E2A42', 800: '#121B2E', 900: '#0A1019' },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body:    ['Satoshi', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
    },
  },
  plugins: [],
};
