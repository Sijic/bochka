import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const vendorDir = path.join(root, 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });

// 1. Copy prebuilt standalone three.module.min.js straight from node_modules
const threeSrc = path.join(root, 'node_modules', 'three', 'build', 'three.module.min.js');
const threeCoreSrc = path.join(root, 'node_modules', 'three', 'build', 'three.core.min.js');
if (fs.existsSync(threeCoreSrc)) {
  fs.copyFileSync(threeCoreSrc, path.join(vendorDir, 'three.core.min.js'));
}
fs.copyFileSync(threeSrc, path.join(vendorDir, 'three.module.min.js'));

// 2. Bundle @supabase/supabase-js into a single ESM file ./vendor/supabase.esm.js
const tmpEntry = path.join(vendorDir, '_supabase_entry.js');
fs.writeFileSync(tmpEntry, `export * from '@supabase/supabase-js';\n`, 'utf8');

await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: 'vendor',
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: tmpEntry,
      formats: ['es'],
      fileName: () => 'supabase.esm.js',
    },
  },
});

fs.unlinkSync(tmpEntry);
console.log('✓ Vendor ESM bundles ready in ./vendor/');
