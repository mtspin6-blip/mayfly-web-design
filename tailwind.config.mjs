/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'warm-black': '#161614',
        'sage':       '#4E6949',
        'off-white':  '#F2EDE3',
        'warm-cream': '#E2DDD3',
        'stone':      '#68615A',
        'gold':       '#7C5C1D',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body:    ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
