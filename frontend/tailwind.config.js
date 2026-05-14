/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Flat `red: "#FF0000"` used to override Tailwind's whole red
        // scale, which silently broke every `bg-red-500` / `text-red-300`
        // etc. in the codebase (notably the mini-app trade buttons).
        // Keep `bg-red` working via DEFAULT and restore the default
        // Tailwind scale for the numbered variants.
        red: {
          DEFAULT: "#FF0000",
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
          800: "#991b1b",
          900: "#7f1d1d",
          950: "#450a0a",
        },
        black: "#000000",

        // background colors
        default: "#0B0F19",
        secondary: "#121621",
        tertiary: "#1F242F",
        emphasis: "#1F242F",
        accent: "#060A14",
        "success-primary": "#053321",
        "success-secondary": "#074D31",
        "brand-primary": "#F25C05",
        "brand-secondary": "#F29F04",
        attention: "#4E1D09",
        e: "#55160C",
        "alt-default": "#1E2022",
        "brand-dimmed-1": "#252f2f",
        "brand-dimmed-2": "#161b26",
        "progress-gray": "#1a202a",
        "progress-left": "#01C38D",
        "progress-right": "#FFFF00",
        overlay: "#0C111D",
        "error-primary": "#3D1B16",
        "error-secondary": "#6C261B",
        "default-hover": "#131822",
        "brand-blitz": "#F6FF73",
        "brand-blitz-secondary": "#262716",
        "draft-picks": "#96F5FF",
        "draft-picks-2": "#96EAFF",
        "fixed-fdv": "#EDA8FF",
        "float-fdv": "#AFDAFF",
        "floor-strategy": "#BEBAFF",

        // font colors
        fg: {
          primary: "#F5F5F6",
          secondary: "#9C9C9D",
          tertiary: "#94969C",
          disabled: "#85888E",
          accent: "#ffffff",
          "success-primary": "#75E0A7",
          "success-secondary": "#47CD89",
          "brand-primary": "#BCFE8F",
          "brand-secondary": "#A3E683",
          "error-primary": "#FF0000FF",
          "alt-default": "#0C111D",
          "alt-default-muted": "#868A8E",
          "gray-line": "#d9d9d983",
          "fixed-fdv": "#EDA8FF",
          "float-fdv": "#AFDAFF",
          "floor-strategy": "#BEBAFF",
        },

        // border colors
        bd: {
          primary: "#333741",
          secondary: "#1F242F",
          "brand-secondary": "#496537",
          subtle: "#1F242F",
          emphasis: "#0C111D",
          disabled: "#333741",
          success: "#074D31",
          attention: "#4E1D09",
          danger: "#F97066",
          danger2: "#55160C",
          "success-primary": "#074D31",
          blitz: "#5A5E28",
          "fixed-fdv": "#EDA8FF",
          "float-fdv": "#AFDAFF",
          "floor-strategy": "#BEBAFF",
        },

        // other colors
      },
      backgroundImage: {
        texture: "url(/src/assets/grainy-main.png)",
        "texture-zoomed-out": "url(/src/assets/grainy-top1.png)",
        "top-contributor": "url(/src/assets/bg-top-contributor.png)",
        fallback: "url(/src/assets/fallback.png)",
        "grand-prize": "url(/src/assets/bg-grand-prize.png)",
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      backgroundColor: {
        "contribution-gradient":
          "linear-gradient(90deg, #F4FFEC 0%, #ACFF73 8%, rgba(172, 255, 115, 0.25) 29.5%, rgba(172, 255, 115, 0.00) 100%);",
      },
      fontFamily: {
        geist: ["Geist", "Arial", "sans-serif"],
        "geist-mono": ["GeistMono", "monospace"],
        "sulphur-point": ["Sulphur Point", "sans-serif"],
        vcr: ["VCR OSD Mono", "monospace"],
        francy: ["Francy", "sans-serif"],
        satoshi: ["Satoshi", "sans-serif"],
        newsreader: ["Newsreader", "Georgia", "serif"],
      },
      boxShadow: {
        underline: "0px 2px 0px 0px rgba(188,254,143,1)",
        header: "0px 10px 10px -2px rgba(172,255,115,0.05);",
        "header-transparent": "0px 5px 6px -2px rgba(172,255,115,0.0);",
        around: "0 0 10px 4px rgba(172, 255, 115, 0.2);",
        "around-1": "0 10px 10px 4px rgba(172, 255, 115, 0.05);",
        "around-2": "0 10px 20px 8px rgba(172, 255, 115, 0.15);",
        "draft-pick-card": "0px 4px 12px 0px rgba(150, 234, 255, 0.25);",
      },
      gridTemplateColumns: {
        "borg-input": "minmax(180px, 1fr) 88px",
        "modal-header": "24px minmax(24px, 1fr)",
        "curator-socials": "128px, 24px, 328px, 32px",
        "bo-timeline": "160px minmax(320px, 1fr)",
        "min-max": "30px 1fr",
        "form-steps": "32px minmax(200px, 400px)",
      },
      lineHeight: {
        11: "44px",
      },
      "body-xl-semibold": [
        "18px",
        {
          lineHeight: "26px",
          fontWeight: "bold",
        },
      ],
      "body-l-medium": [
        "16px",
        {
          lineHeight: "24px",
          fontWeight: 500,
        },
      ],
      fontSize: {
        "body-xl-semibold": [
          "18px",
          {
            lineHeight: "26px",
            fontWeight: 600,
          },
        ],
        "body-l-medium": [
          "16px",
          {
            lineHeight: "24px",
            fontWeight: 500,
          },
        ],
        "body-l-regular": [
          "16px",
          {
            lineHeight: "24px",
            fontWeight: 400,
          },
        ],
      },
      transitionProperty: {
        "draft-pick-card": "colors, box-shadow",
        "opacity-colors": "opacity, colors",
      },
      keyframes: {
        "top-down": {
          "0%": { transform: "translateY(-5%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "top-up": {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(-5%)", opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: 0, transform: "translateY(40%)", filter: "blur(10px)" },
          "100%": { opacity: 1, transform: "translateY(0%)", filter: "blur(0px)" },
        },
        "fade-in-2": {
          "0%": { opacity: 0, transform: "translateY(10%)", filter: "blur(10px)" },
          "100%": { opacity: 1, transform: "translateY(0%)", filter: "blur(0px)" },
        },
        "fade-in-from-above": {
          "0%": { opacity: 0, transform: "translateY(-10%)" },
          "100%": { opacity: 1, transform: "translateY(0%)" },
        },
        "fade-in-from-above-2": {
          "0%": { opacity: 0, transform: "translateY(-10px)" },
          "100%": { opacity: 1, transform: "translateY(0%)" },
        },
        "fade-out-down": {
          "0%": { opacity: 1, transform: "translateY(0%)" },
          "100%": { opacity: 0, transform: "translateY(10px)" },
        },
        "fade-out": {
          "0%": { opacity: 1, transform: "translateY(0%)" },
          "100%": { opacity: 0, transform: "translateY(10%)" },
        },
        "fade-out-to-above": {
          "0%": { opacity: 1, transform: "translateY(0%)" },
          "100%": { opacity: 0, transform: "translateY(-10%)" },
        },
        "slide-skeleton": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(+100%)" },
        },
        "slide-in-from-left": {
          "0%": { transform: "translateX(-20%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        underline: {
          "0%": { width: "0", transform: "translateY(6px)", opacity: 0 },
          "100%": { width: "16px", transform: "translateY(0)", opacity: 1 },
        },
        "activate-circle": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.5)" },
          "100%": { transform: "scale(1)" },
        },
        "opacity-in": {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        "rotate-border": {
          "0%": { transform: "translate(-50%, -50%) scale(1.4) rotate(45deg)" },
          "18%": { transform: "translate(-22%, -50%) scale(1.4) rotate(65deg)" },
          "32%": { transform: "translate(-25%, -50%) scale(1.4) rotate(205deg)" },
          "50%": { transform: "translate(-50%, -50%) scale(1.4) rotate(225deg)" },
          "68%": { transform: "translate(-72%, -50%) scale(1.4) rotate(245deg)" },
          "82%": { transform: "translate(-75%, -50%) scale(1.4) rotate(385deg)" },
          "100%": { transform: "translate(-50%, -50%) scale(1.4) rotate(405deg)" },
        },
        "looped-video": {
          "0%": { opacity: 0 },
          "14%": { opacity: 0.5 },
          "86%": { opacity: 0.5 },
          "100%": { opacity: 0 },
        },
        "slide-exit-left": {
          "0%": { opacity: 1, transform: "translateX(0%)" },
          "100%": { opacity: 0, transform: "translateX(-10%)" },
        },
        "slide-entrance-left": {
          "0%": { opacity: 0, transform: "translateX(10%)" },
          "100%": { opacity: 1, transform: "translateX(0%)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "opacity-in": "opacity-in 0.6s ease-in-out forwards",
        "opacity-in-fast": "opacity-in 0.2s ease-in-out forwards",
        "top-down": "top-down 0.1s ease-out forwards",
        "top-up": "top-up 0.2s ease-out forwards",
        "fade-in": "fade-in 0.2s ease-in-out",
        "fade-in-from-below": "fade-in-2 0.2s ease-in-out forwards",
        "fade-in-from-below-slow": "fade-in 1s ease-in-out forwards",
        "fade-in-from-below-slow-2": "fade-in-2 1s ease-in-out forwards",
        "fade-in-from-above": "fade-in-from-above 0.4s ease-out",
        "fade-in-from-above-2": "fade-in-from-above-2 0.21s ease-in-out",
        "fade-out-down": "fade-out-down 0.21s ease-in-out",
        "fade-out": "fade-out 0.31s ease-in-out",
        "fade-out-to-above": "fade-out-to-above 0.41s ease-out",
        "slide-skeleton": "slide-skeleton 1s ease-in-out infinite",
        underline: "underline 0.31s ease-in-out",
        "activate-circle": "activate-circle 0.5s 1 ease-in-out ",
        "slide-in-from-left": "slide-in-from-left 0.5s 1 ease-in-out ",
        "rotate-border": "rotate-border 6s linear infinite",
        "looped-video": "looped-video 7.04s ease-in-out infinite",
        "slide-exit-left": "slide-exit-left 0.5s ease-in-out forwards",
        "slide-entrance-left": "slide-entrance-left 0.5s ease-in-out forwards",
        marquee: "marquee 48s linear infinite",
      },
    },
  },
  plugins: [],
}
