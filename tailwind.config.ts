import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#F1FCF7',
          100: '#DAF7E8',
          200: '#B7EFD3',
          300: '#7DDFB0',
          400: '#47CC8F',
          500: '#2CB67D',
          600: '#1F8F63',
          700: '#166A49',
          800: '#14563D',
          900: '#124733',
          950: '#0D2F24',
        },
        secondary: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },
        accent: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#0F172A',
          600: '#0B1220',
          700: '#09101B',
          800: '#070D17',
          900: '#020617',
          950: '#01040A',
        },
        background: '#F8FAFC',
        surface: '#FFFFFF',
        foreground: {
          DEFAULT: '#0F172A',
          secondary: '#475569',
          muted: '#64748B',
        },
        success: {
          50: '#ECFDF5',
          100: '#DCFCE7',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
        },
        warning: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        error: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        },
        border: {
          DEFAULT: '#E2E8F0',
          light: '#EDF2F7',
          dark: '#CBD5E1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Poppins', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'display-2xl': [
          '4.5rem',
          { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '700' },
        ],
        'display-xl': [
          '3.75rem',
          { lineHeight: '1.08', letterSpacing: '-0.03em', fontWeight: '700' },
        ],
        'display-lg': ['3rem', { lineHeight: '1.12', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-md': [
          '2.25rem',
          { lineHeight: '1.18', letterSpacing: '-0.025em', fontWeight: '600' },
        ],
        'display-sm': [
          '1.875rem',
          { lineHeight: '1.25', letterSpacing: '-0.02em', fontWeight: '600' },
        ],
        'display-xs': ['1.5rem', { lineHeight: '1.35', fontWeight: '600' }],
        'body-xl': ['1.25rem', { lineHeight: '1.65' }],
        'body-lg': ['1.125rem', { lineHeight: '1.65' }],
        'body-md': ['1rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.55' }],
        'body-xs': ['0.75rem', { lineHeight: '1.5' }],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        card: '0 10px 30px rgba(15, 23, 42, 0.05)',
        'card-hover': '0 18px 40px rgba(15, 23, 42, 0.08)',
        elevated: '0 24px 60px rgba(15, 23, 42, 0.12)',
        modal: '0 30px 80px rgba(15, 23, 42, 0.14)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #1F8F63 0%, #2CB67D 100%)',
        'gradient-gold': 'linear-gradient(135deg, #2CB67D 0%, #7DDFB0 50%, #DAF7E8 100%)',
      },
    },
  },
  plugins: [],
}

export default config
