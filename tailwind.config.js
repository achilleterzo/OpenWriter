/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      // Slate e accent passano da variabili CSS: tema chiaro/scuro e colore d'accento si cambiano a runtime.
      colors: {
        slate: {
        50: 'rgb(var(--slate-50) / <alpha-value>)',
        100: 'rgb(var(--slate-100) / <alpha-value>)',
        200: 'rgb(var(--slate-200) / <alpha-value>)',
        300: 'rgb(var(--slate-300) / <alpha-value>)',
        400: 'rgb(var(--slate-400) / <alpha-value>)',
        500: 'rgb(var(--slate-500) / <alpha-value>)',
        600: 'rgb(var(--slate-600) / <alpha-value>)',
        700: 'rgb(var(--slate-700) / <alpha-value>)',
        800: 'rgb(var(--slate-800) / <alpha-value>)',
        900: 'rgb(var(--slate-900) / <alpha-value>)',
        950: 'rgb(var(--slate-950) / <alpha-value>)',
        },
        emerald: {
          300: 'rgb(var(--emerald-300) / <alpha-value>)',
          400: 'rgb(var(--emerald-400) / <alpha-value>)',
        },
        rose: {
          300: 'rgb(var(--rose-300) / <alpha-value>)',
          400: 'rgb(var(--rose-400) / <alpha-value>)',
        },
        amber: {
          300: 'rgb(var(--amber-300) / <alpha-value>)',
          400: 'rgb(var(--amber-400) / <alpha-value>)',
        },
        teal: {
          200: 'rgb(var(--teal-200) / <alpha-value>)',
          300: 'rgb(var(--teal-300) / <alpha-value>)',
          900: 'rgb(var(--teal-900) / <alpha-value>)',
          950: 'rgb(var(--teal-950) / <alpha-value>)',
        },
        accent: {
        300: 'rgb(var(--accent-300) / <alpha-value>)',
        400: 'rgb(var(--accent-400) / <alpha-value>)',
        500: 'rgb(var(--accent-500) / <alpha-value>)',
        600: 'rgb(var(--accent-600) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
