import esbuild from 'esbuild';
import { rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });

await esbuild.build({
  entryPoints: {
    extension: 'src/extension.ts',
    'backend-launcher': 'src/backendLauncher.ts',
  },
  bundle: true,
  outdir: 'dist',
  outExtension: { '.js': '.cjs' },
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['vscode'],
  sourcemap: true,
  minify: false,
  logLevel: 'info',
});
