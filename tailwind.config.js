/** @type {import('tailwindcss').Config} */
// 颜色用 CSS 变量（RGB 分量）+ <alpha-value>，使 bg-amber/10 等 alpha 修饰符在
// 暗/亮主题下都有效。变量值见 src/styles.css（:root 暗色 / html.light 亮色）。
const c = (v) => `rgb(var(${v}) / <alpha-value>)`;

module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        void: c("--void"),
        bg: c("--bg"),
        panel: c("--panel"),
        "panel-2": c("--panel-2"),
        elevated: c("--elevated"),
        line: c("--line"),
        "line-bright": c("--line-bright"),
        txt: c("--txt"),
        dim: c("--dim"),
        faint: c("--faint"),
        amber: c("--amber"),
        "amber-dim": c("--amber-dim"),
        cyan: c("--cyan"),
        signalgreen: c("--signalgreen"),
        signalred: c("--signalred"),
        violet: c("--violet"),
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
