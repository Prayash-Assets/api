const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  console.log('🔨 Building Lambda bundle...');

  // Build with esbuild
  await esbuild.build({
    entryPoints: ['src/lambda.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: 'dist/index.js',
    minify: true,
    treeShaking: true,
  });

  console.log('✅ Bundle created');

  // Copy PDFKit data folder for fonts
  const pdfkitDataSrc = path.join(__dirname, 'node_modules', 'pdfkit', 'js', 'data');
  const pdfkitDataDest = path.join(__dirname, 'dist', 'data');

  if (fs.existsSync(pdfkitDataSrc)) {
    console.log('📁 Copying PDFKit font data...');

    // Create destination directory
    if (!fs.existsSync(pdfkitDataDest)) {
      fs.mkdirSync(pdfkitDataDest, { recursive: true });
    }

    // Copy all files from source to destination
    const files = fs.readdirSync(pdfkitDataSrc);
    for (const file of files) {
      const srcFile = path.join(pdfkitDataSrc, file);
      const destFile = path.join(pdfkitDataDest, file);
      fs.copyFileSync(srcFile, destFile);
      console.log(`  ✓ Copied ${file}`);
    }
    console.log('✅ Font data copied');
  } else {
    console.warn('⚠️ PDFKit data folder not found at:', pdfkitDataSrc);
  }

  console.log('🎉 Build complete! Output in dist/');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
