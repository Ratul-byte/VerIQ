import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 900: "#0b1437", 800: "#111c4a", 700: "#1b2a63", 500: "#51608f", 300: "#a3accb", 100: "#e6e9f4", 50: "#f4f6fb" },
        brand: { DEFAULT: "#4338ca", soft: "#eef2ff", dark: "#3730a3" },
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
