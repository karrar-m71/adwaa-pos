import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  resolve: {
    alias: [
      {
        find: /^firebase\/firestore$/,
        replacement: fileURLToPath(new URL('./src/utils/firestoreProxy.js', import.meta.url)),
      },
      {
        find: 'firebase/firestore-real',
        replacement: fileURLToPath(new URL('./node_modules/firebase/firestore/dist/esm/index.esm.js', import.meta.url)),
      },
    ],
  },
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
