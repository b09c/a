import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['8d4e11b8-e76c-4cd0-88d7-1bfe03674117-00-upnb8q0ez9pp.sisko.replit.dev', '.replit.dev']
  },
  base: '/a/',
})
