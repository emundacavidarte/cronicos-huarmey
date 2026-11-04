/**
 * icons.js
 * Biblioteca de Íconos Vectoriales SVG Premium para MÁXIME Crónicos Huarmey
 * Diseño de Grado Ejecutivo inspirado en Google Material Symbols & Lucide Icons.
 * Proporciona vectores SVG nítidos, modernos, escalables y con colores armonizados.
 */

(function (root) {
  'use strict';

  const AppIcons = {
    // 1. Navegación Principal
    map(size = 22, color = '#1A73E8') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 18L3 15.5V3.5L9 6L15 3.5L21 6V18L15 15.5L9 18Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M9 6V18" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M15 3.5V15.5" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="15" cy="8.5" r="2.5" fill="#34A853" stroke="#FFFFFF" stroke-width="1"/>
      </svg>`;
    },

    dashboard(size = 22, color = '#1A73E8') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="13" width="4.5" height="8" rx="1.5" fill="#1A73E8"/>
        <rect x="9.75" y="8" width="4.5" height="13" rx="1.5" fill="#9334E6"/>
        <rect x="16.5" y="3" width="4.5" height="18" rx="1.5" fill="#1E8E3E"/>
        <path d="M3 11L9.5 5.5L14.5 9.5L21 3" stroke="#F29900" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    },

    padron(size = 22, color = '#1A73E8') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 2H15C15.5523 2 16 2.44772 16 3V4.5H8V3C8 2.44772 8.44772 2 9 2Z" fill="${color}"/>
        <rect x="4.5" y="4.5" width="15" height="17" rx="2" stroke="${color}" stroke-width="2"/>
        <path d="M8.5 9.5H15.5M8.5 13H15.5M8.5 16.5H12" stroke="#5F6368" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="16.5" cy="16.5" r="3.5" fill="#D93025"/>
        <path d="M15.2 16.5L16.2 17.5L17.8 15.8" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    },

    excel(size = 22, color = '#1E8E3E') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M14 2V8H20" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M8.5 15.5L11.5 18.5M11.5 18.5L14.5 15.5M11.5 18.5V12" stroke="#1A73E8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    },

    layers(size = 22, color = '#1A73E8') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7.5L12 13L22 7.5L12 2Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 12.5L12 18L22 12.5" stroke="#9334E6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 17.5L12 23L22 17.5" stroke="#1E8E3E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    },

    users(size = 22, color = '#1A73E8') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 21V19C16 16.7909 14.2091 15 12 15H5C2.79086 15 1 16.7909 1 19V21" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="8.5" cy="7" r="4" stroke="${color}" stroke-width="2"/>
        <path d="M23 21V19C22.9986 17.2 21.6 15.6 19.8 15.2" stroke="#5F6368" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16 3.3C17.5 3.6 18.5 5 18.5 7C18.5 9 17.5 10.4 16 10.7" stroke="#5F6368" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    },

    plus(size = 20, color = '#FFFFFF') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 5V19M5 12H19" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    },

    // 2. Especialidades Clínicas & HEARTS
    stethoscope(size = 20, color = '#1A73E8') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 3V8C4 10.2091 5.79086 12 8 12C10.2091 12 12 10.2091 12 8V3" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M8 12V15C8 17.2091 9.79086 19 12 19H14C16.2091 19 18 17.2091 18 15V14" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <circle cx="18" cy="12" r="3" fill="#E8F0FE" stroke="${color}" stroke-width="2"/>
        <circle cx="4" cy="3" r="1.5" fill="${color}"/>
        <circle cx="12" cy="3" r="1.5" fill="${color}"/>
      </svg>`;
    },

    heartPulse(size = 20, color = '#D93025') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20.84 4.61C19.85 3.6 18.49 3 17 3C15.05 3 13.36 4.07 12 5.58C10.64 4.07 8.95 3 7 3C5.51 3 4.15 3.6 3.16 4.61C1.06 6.76 1.06 10.24 3.16 12.39L12 21.42L20.84 12.39C22.94 10.24 22.94 6.76 20.84 4.61Z" fill="#FCE8E6" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M7 12H9.5L11 8L13 16L14.5 12H17" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    },

    pill(size = 20, color = '#9334E6') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10.5 6.5L6.5 10.5C4.84315 12.1569 4.84315 14.8431 6.5 16.5C8.15685 18.1569 10.8431 18.1569 12.5 16.5L16.5 12.5C18.1569 10.8431 18.1569 8.15685 16.5 6.5C14.8431 4.84315 12.1569 4.84315 10.5 6.5Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8.5 14.5L14.5 8.5" stroke="${color}" stroke-width="2"/>
        <path d="M10.5 6.5L14.5 8.5L8.5 14.5L6.5 10.5C4.84 12.16 4.84 14.84 6.5 16.5C8.16 18.16 10.84 18.16 12.5 16.5" fill="#F3E8FD" opacity="0.6"/>
      </svg>`;
    },

    lab(size = 20, color = '#1A73E8') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 3H15M10 3V8L5 18C4.3 19.4 5.3 21 6.9 21H17.1C18.7 21 19.7 19.4 19 18L14 8V3" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 16H17" stroke="#34A853" stroke-width="2" stroke-linecap="round"/>
        <circle cx="10" cy="18" r="1" fill="#34A853"/>
        <circle cx="14" cy="18.5" r="1.5" fill="#34A853"/>
      </svg>`;
    },

    history(size = 20, color = '#1A73E8') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C8.13623 21 4.85874 18.5634 3.61908 15.1325" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M3 8.5V12.5H7" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M12 7V12L15.5 14" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    },

    // 3. Acciones, Estados y Botones
    location(size = 18, color = '#D93025') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 21C16 16.5 19 13 19 9C19 5.13401 15.866 2 12 2C8.13401 2 5 5.13401 5 9C5 13 8 16.5 12 21Z" fill="#FCE8E6" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="12" cy="9" r="3" fill="${color}"/>
      </svg>`;
    },

    calendar(size = 18, color = '#1A73E8') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="4" width="18" height="18" rx="2" stroke="${color}" stroke-width="2"/>
        <path d="M16 2V6M8 2V6M3 10H21" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <circle cx="12" cy="15" r="2" fill="${color}"/>
      </svg>`;
    },

    whatsapp(size = 18, color = '#25D366') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.63C8.75 21.41 10.38 21.82 12.04 21.82C17.5 21.82 21.95 17.37 21.95 11.91C21.95 6.45 17.5 2 12.04 2Z" fill="#E6F4EA" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M16.4 14.5C16.18 14.39 15.11 13.86 14.91 13.79C14.71 13.72 14.56 13.68 14.41 13.91C14.26 14.13 13.83 14.65 13.7 14.8C13.57 14.95 13.44 14.97 13.22 14.86C13 14.75 12.29 14.51 11.44 13.76C10.78 13.17 10.33 12.45 10.2 12.23C10.07 12.01 10.19 11.89 10.3 11.78C10.4 11.68 10.52 11.52 10.63 11.39C10.74 11.26 10.78 11.17 10.85 11.02C10.92 10.87 10.88 10.74 10.83 10.63C10.78 10.52 10.33 9.41 10.15 8.97C9.97 8.54 9.79 8.6 9.65 8.59C9.52 8.58 9.37 8.58 9.22 8.58C9.07 8.58 8.83 8.64 8.63 8.86C8.43 9.08 7.87 9.6 7.87 10.67C7.87 11.74 8.65 12.77 8.76 12.92C8.87 13.07 10.3 15.26 12.48 16.2C13 16.42 13.4 16.57 13.71 16.66C14.31 16.85 14.86 16.82 15.3 16.76C15.78 16.69 16.79 16.15 17 15.56C17.21 14.97 17.21 14.46 17.15 14.36C17.09 14.25 16.94 14.19 16.72 14.08L16.4 14.5Z" fill="${color}"/>
      </svg>`;
    },

    clipboardCheck(size = 18, color = '#1E8E3E') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 4H18C19.1046 4 20 4.89543 20 6V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V6C4 4.89543 4.89543 4 6 4H8" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <rect x="8" y="2" width="8" height="4" rx="1" stroke="${color}" stroke-width="2" fill="#FFFFFF"/>
        <path d="M9 13L11 15L15 10" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    },

    logout(size = 18, color = '#5F6368') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H9" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M16 17L21 12M21 12L16 7M21 12H9" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    },

    search(size = 18, color = '#80868B') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="11" cy="11" r="7" stroke="${color}" stroke-width="2.2"/>
        <path d="M20 20L16 16" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
      </svg>`;
    },

    home(size = 16, color = '#202124') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 10L12 3L21 10V20C21 20.5523 20.5523 21 20 21H15V14H9V21H4C3.44772 21 3 20.5523 3 20V10Z" fill="${color}"/>
      </svg>`;
    },

    checkCircle(size = 16, color = '#1E8E3E') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="#E6F4EA" stroke="${color}" stroke-width="2"/>
        <path d="M8 12L11 15L16 9" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    },

    alertTriangle(size = 16, color = '#D93025') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L1 21H23L12 2Z" fill="#FCE8E6" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M12 9V14M12 17.5V18" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    },

    clock(size = 16, color = '#F29900') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="#FEF7E0" stroke="${color}" stroke-width="2"/>
        <path d="M12 6V12L16 14" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    },

    hospital(size = 16, color = '#9334E6') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="4" width="18" height="18" rx="2" fill="#F3E8FD" stroke="${color}" stroke-width="2"/>
        <path d="M12 8V16M8 12H16" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
    },

    edit(size = 16, color = '#FFFFFF') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11 4H4C3.44772 4 3 4.44772 3 5V20C3 20.5523 3.44772 21 4 21H19C19.5523 21 20 20.5523 20 20V13" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M18.5 2.5C19.3284 1.67157 20.6716 1.67157 21.5 2.5C22.3284 3.32843 22.3284 4.67157 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    },

    phone(size = 16, color = '#1A73E8') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22 16.92V19.92C22.0011 20.1986 21.9441 20.4743 21.8326 20.7294C21.721 20.9845 21.5574 21.2132 21.3524 21.3999C21.1473 21.5866 20.9054 21.7271 20.6421 21.8122C20.3787 21.8974 20.0997 21.9253 19.823 21.8938C16.7428 21.5539 13.787 20.5028 11.19 18.82C8.77382 17.2792 6.72077 15.2262 5.18 12.81C3.49126 10.2018 2.43928 7.23277 2.106 4.14C2.07455 3.86435 2.10237 3.58635 2.18731 3.32386C2.27225 3.06138 2.41243 2.8203 2.5986 2.6159C2.78477 2.41149 3.01272 2.24838 3.26735 2.13702C3.52199 2.02566 3.79718 1.96856 4.075 1.97H7.075C7.56457 1.96522 8.03948 2.13783 8.412 2.45582C8.78453 2.77381 9.03099 3.21689 9.105 3.702C9.2435 4.60749 9.49757 5.49137 9.862 6.336C10.0076 6.67138 10.0461 7.04271 9.97235 7.40026C9.89862 7.75781 9.71597 8.08552 9.448 8.34L8.178 9.61C9.61278 12.1332 11.8668 14.3872 14.39 15.822L15.66 14.552C15.9145 14.284 16.2422 14.1014 16.5997 14.0276C16.9573 13.9539 17.3286 13.9924 17.664 14.138C18.5086 14.5024 19.3925 14.7565 20.298 14.895C20.7884 14.9698 21.2361 15.2205 21.5552 15.5994C21.8744 15.9782 22.0439 16.4593 22.032 16.953L22 16.92Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    },

    door(size = 16, color = '#1E8E3E') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 21V3C19 2.44772 18.5523 2 18 2H6C5.44772 2 5 2.44772 5 3V21" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M2 21H22" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M14 11H15" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
    },

    city(size = 16, color = '#5F6368') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 21H21" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M5 21V7L13 3V21" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M13 10L19 7V21" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M9 9V9.01M9 13V13.01M9 17V17.01M16 13V13.01M16 17V17.01" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    },

    refresh(size = 16, color = '#1A73E8') {
      return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M23 4V10H17" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M1 20V14H7" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3.51 9A9 9 0 0 1 18.36 5.64L23 10M1 14L5.64 18.36A9 9 0 0 0 20.49 15" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    }
  };

  root.AppIcons = AppIcons;
})(typeof window !== 'undefined' ? window : this);
