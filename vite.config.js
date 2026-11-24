import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const RUNTIME_ASSETS = [
  'CNAME',
  '.nojekyll',
  'legal.html',
  'public/legal.html',
  'src/legal.js',
  'src/trophies.js',
  'src/v16_ux.js',
  'src/til_game.js',
  'assets/config/media_slots.json',
  'public/vendor/telegram-web-app.js',
  'public/vendor/vk-videoplayer.js',
  'public/fonts/fonts.css',
  'public/cards/card_workshop_hall.webp',
  'public/cards/card_boy_escape.webp',
  'public/cards/card_father_shadow.webp',
  'public/cards/card_chain_grip.webp',
  'public/cards/card_pastor_vigil.webp',
  'public/cards/card_barrel_eye.webp',
  'public/cards/card_fire_dog.webp',
  'public/cards/card_til_glasses.webp',
  'public/cards/card_til_north_sea.webp',
  'og.jpg',
  'bochka_og_1280x720.jpg',
  'photo_2026-11-08_00-00-14.jpg',
  'photo_2026-11-08_00-00-26.jpg',
  'hf_20261017_093522_42c309d3-daf2-486e-9539-a8dcb422167c.mp4',
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
  'assets/sfx/voices/screamer_0.mp3',
  'assets/sfx/voices/screamer_1.mp3',
  'assets/sfx/voices/screamer_2.mp3',
  'assets/sfx/voices/screamer_3.mp3',
  'assets/sfx/voices/screamer_4.mp3',
  'assets/sfx/voices/screamer_5.mp3',
  'assets/sfx/water_drop_1.mp3',
  'assets/sfx/water_drop_2.mp3',
  'public/sprites/film_clock.webp',
  'public/sprites/screamer_hand.webp',
  'public/sprites/screamer_pastor.webp',
  'public/sprites/screamer_father.webp',
  'public/sprites/screamer_blogger.webp',
  'public/sprites/horror_barrel_face.webp',
  'public/sprites/horror_barrel_face_f2.webp',
  'public/sprites/horror_claw_hands.webp',
  'public/sprites/horror_gasmask_weld.webp',
  'public/sprites/horror_cctv_face.webp',
  'public/sprites/horror_hero_warden.webp',
  'public/sprites/horror_hero_warden_f2.webp',
  'public/sprites/horror_hero_mechanic.webp',
  'public/sprites/horror_hero_mechanic_f2.webp',
  'public/sprites/horror_hero_captive.webp',
  'public/sprites/horror_hero_captive_f2.webp',
  'public/sprites/hero_boy_live.webp',
  'public/sprites/cinema_ticket_barrel.webp',
  'public/sprites/cinema_ticket_card.webp',
  'public/sprites/ocean_sea_real.webp',
  'public/sprites/ocean_barrel_til_hand.webp',
  'public/sprites/til_avatar.webp',
  'public/sprites/fighter_1.webp',
  'public/sprites/fighter_2.webp',
  'public/sprites/fighter_3.webp',
  'public/sprites/fighter_4.webp',
  'public/sprites/fighter_5.webp',
  'public/sprites/fighter_6.webp',
  'public/sprites/points_token_barrel.webp',
  'public/sprites/empty_barrel_interior.webp',
  'public/sprites/empty_barrel_hearts.webp',
];

function stripStaticImportMapAndCopyAssets() {
  let outDir = 'dist';
  return {
    name: 'bochka-hybrid-build',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || req.url === '/' || req.url.endsWith('.html') || req.url.includes('/?')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
        }
        next();
      });
    },
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

      // v16.0: Рекурсивно копируем public/fonts/* и public/vendor/* (0 внешних CDN для РФ/РБ)
      for (const staticDir of ['fonts', 'vendor']) {
        const srcStatic = path.join(root, 'public', staticDir);
        if (!fs.existsSync(srcStatic)) continue;
        for (const ent of fs.readdirSync(srcStatic, { withFileTypes: true })) {
          if (ent.isDirectory()) continue;
          const s = path.join(srcStatic, ent.name);
          for (const dst of [
            path.join(root, outDir, 'public', staticDir, ent.name),
            path.join(root, outDir, staticDir, ent.name),
          ]) {
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(s, dst);
          }
        }
      }

      // Рекурсивно копируем public/textures/* (Patch CC0 PBR-ржавчина + HDRI цеха v8.1)
      const texRoot = path.join(root, 'public', 'textures');
      const copyTexRec = (srcDir, relSub) => {
        if (!fs.existsSync(srcDir)) return;
        for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
          const s = path.join(srcDir, ent.name);
          const r = path.join(relSub, ent.name);
          if (ent.isDirectory()) {
            copyTexRec(s, r);
          } else {
            for (const dst of [path.join(root, outDir, 'public', 'textures', r), path.join(root, outDir, 'textures', r)]) {
              fs.mkdirSync(path.dirname(dst), { recursive: true });
              fs.copyFileSync(s, dst);
            }
          }
        }
      };
      copyTexRec(texRoot, '');

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
