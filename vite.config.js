import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const RUNTIME_ASSETS = [
  'CNAME',
  '.nojekyll',
  'og.jpg',
  'bochka_og_1280x720.jpg',
  'photo_2026-11-08_00-00-14.jpg',
  'photo_2026-11-08_00-00-26.jpg',
  'hf_20261017_093522_42c309d3-daf2-486e-9539-a8dcb422167c.mp4',
  'video/trailer.mp4',
  'assets/images.jpg',
  'assets/images_2.jpg',
  'assets/images_3.jpg',
  'assets/images_5.jpg',
  'assets/images_6.jpg',
  'assets/zvontsov.png',
  'assets/keyed/ocean_panorama.webp',
  'assets/keyed/ocean_till_barrel.webp',
  'assets/keyed/ocean_beach_bg.webp',
  'assets/keyed/ocean_till_sitting.webp',
  'assets/keyed/ocean_barrel_closed.webp',
  'assets/keyed/ocean_barrel_arm.webp',
  'assets/sfx/barrel_hit_high.mp3',
  'assets/sfx/barrel_hit_low.mp3',
  'assets/sfx/barrel_hit_mid.mp3',
  'assets/sfx/barrel_knock_inside.mp3',
  'assets/sfx/chain_clink_1.mp3',
  'assets/sfx/chain_clink_2.mp3',
  'assets/sfx/factory_hum.mp3',
  'assets/sfx/scream_1.mp3',
  'assets/sfx/scream_2.mp3',
  'assets/sfx/water_drop_1.mp3',
  'assets/sfx/water_drop_2.mp3',
  'public/sprites/film_clock.webp',
];

function stripStaticImportMapAndCopyAssets() {
  let outDir = 'dist';
  return {
    name: 'bochka-hybrid-build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml(html) {
      return html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/i, '');
    },
    closeBundle() {
      const root = process.cwd();
      for (const rel of RUNTIME_ASSETS) {
        const src = path.join(root, rel);
        if (!fs.existsSync(src)) continue;
        const dst = path.join(root, outDir, rel);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
        if (rel.startsWith('public/')) {
          const aliasDst = path.join(root, outDir, rel.slice('public/'.length));
          fs.mkdirSync(path.dirname(aliasDst), { recursive: true });
          fs.copyFileSync(src, aliasDst);
        }
      }
      // Рекурсивно копируем public/sfx/* (обманки, скримеры, целевые звуки v8.0)
      const sfxRoot = path.join(root, 'public', 'sfx');
      const copyDirRec = (srcDir, relSub) => {
        if (!fs.existsSync(srcDir)) return;
        for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
          const s = path.join(srcDir, ent.name);
          const r = path.join(relSub, ent.name);
          if (ent.isDirectory()) {
            copyDirRec(s, r);
          } else {
            for (const dst of [path.join(root, outDir, 'public', 'sfx', r), path.join(root, outDir, 'sfx', r)]) {
              fs.mkdirSync(path.dirname(dst), { recursive: true });
              fs.copyFileSync(s, dst);
            }
          }
        }
      };
      copyDirRec(sfxRoot, '');

      const dictSrc = path.join(root, 'src', 'dict.json');
      if (fs.existsSync(dictSrc)) {
        const dictDst = path.join(root, outDir, 'src', 'dict.json');
        fs.mkdirSync(path.dirname(dictDst), { recursive: true });
        fs.copyFileSync(dictSrc, dictDst);
      }
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [stripStaticImportMapAndCopyAssets()],
  build: {
    outDir: 'dist',
    assetsDir: 'bundle',
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: path.resolve(process.cwd(), 'index.html'),
        admin: path.resolve(process.cwd(), 'admin/index.html'),
        testbog: path.resolve(process.cwd(), 'testbog/index.html'),
      },
      output: {
        manualChunks: {
          three: ['three'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
