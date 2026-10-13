import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { validateApiBaseUrl } from './src/api/config.ts';

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const environment = loadEnv(mode, process.cwd(), 'VITE_');
    validateApiBaseUrl(environment.VITE_API_BASE_URL, process.env.RENDER === 'true');
  }
  return {
    plugins: [react()],
    server: { host: 'localhost', port: 5173, strictPort: true },
  };
});
