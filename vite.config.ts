import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// `--mode lan` serves over self-signed HTTPS so iOS Safari allows the camera.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'lan' ? [basicSsl()] : [],
}));
