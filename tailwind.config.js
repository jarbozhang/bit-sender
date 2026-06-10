/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // 工业信号控制台配色（深色优先）
        void: "#05080a",
        bg: "#090f12",
        panel: "#0d141a",
        "panel-2": "#0f1820",
        elevated: "#142029",
        line: "#1b2a33",
        "line-bright": "#294049",
        txt: "#dde8ed",
        dim: "#7e919c",
        faint: "#4a5a64",
        amber: "#ffb224",
        "amber-dim": "#b87d18",
        cyan: "#36e0cf",
        signalgreen: "#46d483",
        signalred: "#ff5d6c",
        violet: "#8b7dff",
      },
      fontFamily: {
        display: ['"Chakra Petch"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
        ui: ['"IBM Plex Sans"', "sans-serif"],
      },
      boxShadow: {
        "glow-amber": "0 0 18px -6px rgba(255,178,36,.45)",
        "glow-cyan": "0 0 18px -6px rgba(54,224,207,.35)",
      },
    },
  },
  plugins: [],
};
