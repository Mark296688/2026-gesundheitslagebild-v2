import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-base': 'var(--bg-base)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-elevated-2': 'var(--bg-elevated-2)',
        'bg-subtle': 'var(--bg-subtle)',
        'bg-hover': 'var(--bg-hover)',
        'bg-active': 'var(--bg-active)',

        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-disabled': 'var(--text-disabled)',
        'text-on-color': 'var(--text-on-color)',

        'accent-blue': 'var(--accent-blue)',
        'accent-blue-soft': 'var(--accent-blue-soft)',
        'accent-indigo': 'var(--accent-indigo)',
        'accent-purple': 'var(--accent-purple)',
        'accent-teal': 'var(--accent-teal)',
        'accent-green': 'var(--accent-green)',
        'accent-yellow': 'var(--accent-yellow)',
        'accent-orange': 'var(--accent-orange)',
        'accent-red': 'var(--accent-red)',
        'accent-pink': 'var(--accent-pink)',

        'status-ok': 'var(--status-ok)',
        'status-notice': 'var(--status-notice)',
        'status-warn': 'var(--status-warn)',
        'status-critical': 'var(--status-critical)',

        'chart-1': 'var(--chart-1)',
        'chart-2': 'var(--chart-2)',
        'chart-3': 'var(--chart-3)',
        'chart-4': 'var(--chart-4)',
        'chart-5': 'var(--chart-5)',

        // shadcn bridging (wird durch globals.css auf obige Tokens gemappt)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderColor: {
        '1': 'var(--border-1)',
        '2': 'var(--border-2)',
        strong: 'var(--border-strong)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        display: 'var(--font-display)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        display: ['28px', { lineHeight: '34px', letterSpacing: '-0.02em', fontWeight: '600' }],
        h1: ['22px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        h2: ['18px', { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '600' }],
        h3: ['15px', { lineHeight: '20px', fontWeight: '600' }],
        body: ['14px', { lineHeight: '20px' }],
        label: ['13px', { lineHeight: '18px', letterSpacing: '0.01em', fontWeight: '500' }],
        caption: ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        micro: ['11px', { lineHeight: '14px', letterSpacing: '0.04em', fontWeight: '500' }],
        'mono-sm': ['13px', { lineHeight: '18px' }],
        'mono-lg': ['22px', { lineHeight: '26px', letterSpacing: '-0.02em', fontWeight: '500' }],
      },
      spacing: {
        '1': 'var(--space-1)',
        '2': 'var(--space-2)',
        '3': 'var(--space-3)',
        '4': 'var(--space-4)',
        '5': 'var(--space-5)',
        '6': 'var(--space-6)',
        '8': 'var(--space-8)',
        '10': 'var(--space-10)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        panel: 'var(--shadow-panel)',
      },
      backdropBlur: {
        glass: '24px',
        'glass-strong': '40px',
      },
      backdropSaturate: {
        glass: '1.6',
        'glass-strong': '1.8',
      },
      zIndex: {
        map: 'var(--z-map)',
        route: 'var(--z-route)',
        marker: 'var(--z-marker)',
        panel: 'var(--z-panel)',
        tooltip: 'var(--z-tooltip)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
      },
      transitionTimingFunction: {
        liquid: 'cubic-bezier(.2,.7,.2,1)',
      },
      transitionDuration: {
        '120': '120ms',
        '180': '180ms',
      },
    },
  },
  plugins: [animate],
};

export default config;
