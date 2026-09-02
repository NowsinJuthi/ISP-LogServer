import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 900: '#01131a', 800: '#031a22', 700: '#06212a' },
        brand: {
          DEFAULT: '#26bfb0',
          deep: '#0a6258',
          light: '#5eead4',
          soft: '#e7f8f6',
        },
        accent: '#26bfb0',
        gold: '#f59e0b',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#f43f5e',
      },
    },
  },
  plugins: [],
};

export default config;
