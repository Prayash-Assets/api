const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/lambda.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['aws-sdk'],
  minify: true,
  sourcemap: false,
}).catch(() => process.exit(1));
