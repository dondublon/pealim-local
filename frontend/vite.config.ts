import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// pealim_ru.db лежит в корне проекта и отдаётся через symlink в public/,
// поэтому разрешаем dev-серверу читать каталог на уровень выше frontend/.
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: [projectRoot] },
  },
});
