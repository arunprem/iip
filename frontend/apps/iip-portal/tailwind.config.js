/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'iip-bg': 'rgb(var(--color-iip-bg) / <alpha-value>)',
        'iip-surface': 'rgb(var(--color-iip-surface) / <alpha-value>)',
        'iip-surface-hover': 'rgb(var(--color-iip-surface-hover) / <alpha-value>)',
        'iip-surface-active': 'rgb(var(--color-iip-surface-active) / <alpha-value>)',
        'iip-primary': 'rgb(var(--color-iip-primary) / <alpha-value>)',
        'iip-primary-hover': 'rgb(var(--color-iip-primary-hover) / <alpha-value>)',
        'iip-text': 'rgb(var(--color-iip-text) / <alpha-value>)',
        'iip-text-muted': 'rgb(var(--color-iip-text-muted) / <alpha-value>)',
        'iip-border': 'rgb(var(--color-iip-border) / <alpha-value>)',
        'iip-border-hover': 'rgb(var(--color-iip-border-hover) / <alpha-value>)',
        'class-unclassified': 'rgb(var(--color-class-unclassified) / <alpha-value>)',
        'class-restricted': 'rgb(var(--color-class-restricted) / <alpha-value>)',
        'class-confidential': 'rgb(var(--color-class-confidential) / <alpha-value>)',
        'class-secret': 'rgb(var(--color-class-secret) / <alpha-value>)',
        'class-top-secret': 'rgb(var(--color-class-top-secret) / <alpha-value>)',
      }
    },
  },
  plugins: [],
}
