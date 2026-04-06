import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0B1320",
        mist: "#EEF4FF",
        sky: "#6DA7FF",
        lagoon: "#00A7A0",
        flame: "#F1784B",
        slate: "#5F728C"
      },
      backgroundImage: {
        "dashboard-grid":
          "radial-gradient(circle at top, rgba(109,167,255,0.18), transparent 35%), linear-gradient(135deg, rgba(5,12,24,0.98), rgba(17,34,55,0.96))"
      },
      boxShadow: {
        soft: "0 16px 45px rgba(3, 14, 30, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;
