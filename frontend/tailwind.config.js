/** @type {import('tailwindcss').Config} */
export default {
   content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
   ],
   theme: {
      extend: {
         colors: {
            background: "#131314",
            surface: "#1E1F20",
            primary: "#A8C7FA",
         },
      },
   },
   plugins: [
      require('@tailwindcss/typography'),
   ],
}
