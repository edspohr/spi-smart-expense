/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      colors: {
        // Keeping 'brand' but re-palette to something professional if needed,
        // or just rely on Slate for the UI structure.
        // Removed manual slate to allow all colors (zinc, etc)
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#6366f1", // Indigo 500
          600: "#4f46e5", // Indigo 600
          700: "#4338ca", // Indigo 700
          800: "#3730a3", // Indigo 800
          900: "#312e81", // Indigo 900
        },
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
      boxShadow: {
        soft: "0 4px 20px -2px rgba(0, 0, 0, 0.05)",
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.07)",
      },
    },
  },
  plugins: [],
};
