/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        coral: { DEFAULT: '#C8694A', light: '#F5EDE6' },
        brown: { DEFAULT: '#5C3420', mid: '#8B5C40', light: '#C4A090' },
        border: '#EDD5C0',
        bg: { DEFAULT: '#FDFAF7', alt: '#F5EDE6' },
        green: '#2E7D52',
        red: '#C0392B',
        amber: '#BA7517',
        blue: '#185FA5',
      },
      borderRadius: {
        phone: '40px',
      },
    },
  },
  plugins: [],
};
