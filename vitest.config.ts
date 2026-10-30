import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({esbuild:{jsx:'automatic'},resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url)),'server-only':fileURLToPath(new URL('./tests/backend/server-only.ts',import.meta.url))}},test:{include:['tests/backend/**/*.test.{ts,tsx}']}});
