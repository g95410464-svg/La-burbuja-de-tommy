/**
 * Configuración de Tailwind CSS.
 *
 * NOTA DE ARQUITECTURA (Senior):
 * Definimos aquí una paleta de colores propia ("cuento") y animaciones
 * personalizadas en lugar de usar utilidades sueltas repetidas por todo
 * el código. Esto centraliza el "design system" en un único punto de
 * verdad, lo cual facilita el mantenimiento y evita el "magic number"
 * de colores hex desperdigados por los componentes.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta cálida y amigable pensada para niños, con buen contraste
        // para accesibilidad (WCAG AA como mínimo en textos principales).
        cuento: {
          bg: '#FFF7ED',
          fondo: '#FEF3E2',
          crema: '#FFFBF2',
          coral: '#FF6B6B',
          coralOscuro: '#EE5A5A',
          turquesa: '#4ECDC4',
          turquesaOscuro: '#3BB4AB',
          amarillo: '#FFD166',
          amarilloOscuro: '#F4B740',
          morado: '#A78BFA',
          moradoOscuro: '#8B6FE0',
          azul: '#5B9FED',
          verde: '#6BCB77',
          tinta: '#2D2A32',
          tintaSuave: '#5C5866',
        },
      },
      fontFamily: {
        // Fuente redondeada y legible, típica de interfaces infantiles.
        cuento: ['"Baloo 2"', '"Nunito"', 'system-ui', 'sans-serif'],
        serif: ['"Merriweather"', '"Times New Roman"', 'serif'],
      },
      borderRadius: {
        blob: '2rem',
      },
      boxShadow: {
        libro: '0 20px 40px -12px rgba(45, 42, 50, 0.25)',
        boton: '0 6px 0 0 rgba(0,0,0,0.15)',
      },
      keyframes: {
        // Micro-interacción de "respiración" para invitar al toque.
        latido: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        // Entrada suave para tarjetas de la biblioteca.
        aparecer: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Efecto de "pase de página" simplificado (flip en el eje Y).
        pasarPagina: {
          '0%': { transform: 'rotateY(0deg)', opacity: '1' },
          '50%': { transform: 'rotateY(-90deg)', opacity: '0.4' },
          '100%': { transform: 'rotateY(0deg)', opacity: '1' },
        },
        flotar: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        brillo: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        latido: 'latido 1.8s ease-in-out infinite',
        aparecer: 'aparecer 0.45s ease-out both',
        pasarPagina: 'pasarPagina 0.5s ease-in-out',
        flotar: 'flotar 3s ease-in-out infinite',
        brillo: 'brillo 1.6s linear infinite',
      },
    },
  },
  plugins: [
      function ({ addUtilities }) {
        const gradientHeader = {
          '.gradient-header': {
            background: 'linear-gradient(135deg, #2D2A32 0%, #5D4F67 100%)',
            '@apply text-white': {},
          },
        };
        addUtilities(gradientHeader, ['responsive']);
      },
    ],
}

