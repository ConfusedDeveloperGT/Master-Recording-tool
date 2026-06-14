module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}", "./index.{js,ts}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#121212',
        elevated: '#1e1e1e',
        primary: '#f9fafb',
        secondary: '#a1a1aa',
        tertiary: '#52525b',
        accent: '#facc15', // yellow-400
        'accent-primary': '#FF6B00', // NDA Orange
      },
    },
  },
  plugins: [],
}
