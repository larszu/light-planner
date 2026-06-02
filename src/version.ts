// App version — injected by Vite from package.json (see vite.config.ts).
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
export const APP_NAME = 'Light Planner';
