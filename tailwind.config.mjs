/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'warm-black': '#161614',
        'sage':       '#5E7E58',
        'off-white':  '#F2EDE3',
        'warm-cream': '#E2DDD3',
        'stone':      '#8A8278',
        'gold':       '#B8882E',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body:    ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
