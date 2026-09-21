/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        stock: {
          up: '#10B981',
          down: '#EF4444',
          dark: '#0B0E14',
          card: '#151923',
          border: '#232936',
          muted: '#8B949E',
          accent: '#3B82F6'
        }
      }
    },
  },
  plugins: [],
}
