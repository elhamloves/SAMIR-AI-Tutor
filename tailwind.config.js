/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'night-purple': '#6B46C1',
        'night-blue': '#3B82F6',
        'night-dark': '#0F172A',
        'night-darker': '#020617',
      },
      backgroundImage: {
        'gradient-night': 'linear-gradient(135deg, #6B46C1 0%, #3B82F6 50%, #8B5CF6 100%)',
        'gradient-night-dark': 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #334155 100%)',
        'gradient-purple-blue': 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)',
      },
    },
  },
  plugins: [],
}

