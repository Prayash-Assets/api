const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/lambda.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: [],
  minify: false,
  sourcemap: true,
}).catch(() => process.exit(1));
