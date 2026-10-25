// Growth Buddies Light — Tailwind preset for "buddies" apps.
// Usage: tailwind.config.js → presets: [require('./design/growth-buddies-light/tailwind-preset.cjs')]
const tokens = require('./tokens.json');

module.exports = {
  theme: {
    extend: {
      colors: {
        teal: tokens.color.teal,
        ink: tokens.color.ink,
        gb: {
          bg: tokens.color.ink['50'],
          surface: '#FFFFFF',
          line: tokens.color.ink['200'],
          fg: tokens.color.ink['950'],
          muted: tokens.color.ink['500'],
          brand: tokens.color.teal['600'],
          action: tokens.color.teal['700'],
          'action-hover': tokens.color.teal['800'],
          success: tokens.color.status.success,
          warning: tokens.color.status.warning,
          danger: tokens.color.status.danger,
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gb-brand': tokens.semantic['brand-gradient'],
      },
    },
  },
};
