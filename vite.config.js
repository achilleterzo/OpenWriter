import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    watch: {
      // La cartella `.ow` dei progetti (conversazioni, note, cronologia) si riscrive di continuo e non fa parte dell'app: se il progetto
      // aperto è questo stesso repository, il watcher non deve toccarla (su Windows bloccava le rinomine e poteva far cadere Vite).
      ignored: ['**/.ow/**'],
    },
  },
})
