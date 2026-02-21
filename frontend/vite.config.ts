import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'force-charset-utf8',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const originalSetHeader = res.setHeader;
          res.setHeader = function (name, value) {
            if (name.toLowerCase() === 'content-type' && typeof value === 'string') {
              if (
                (value.includes('javascript') || value.includes('html') || value.includes('css') || value.includes('json')) &&
                !value.toLowerCase().includes('charset')
              ) {
                value += '; charset=utf-8';
              }
            }
            return originalSetHeader.call(this, name, value);
          };
          next();
        });
      }
    }
  ],
  server: {
    host: '0.0.0.0',
  },
})
