import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const BASE_PATH = process.env.NODE_ENV === 'production' ? './' : '/'

// https://vitejs.dev/config/
export default defineConfig({
  base: BASE_PATH,
  plugins: [vue()]
})
