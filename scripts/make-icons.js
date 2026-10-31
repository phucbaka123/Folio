// Renders build/icon.svg into the PNG and ICO files used by the app window and the installer.
// Run with: npm run icons
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

const build = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(build, 'icon.svg'));

async function png(size) {
  return sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
}

(async () => {
  fs.writeFileSync(path.join(build, 'icon.png'), await png(1024));

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const ico = await pngToIco(await Promise.all(sizes.map(png)));
  fs.writeFileSync(path.join(build, 'icon.ico'), ico);

  console.log('Wrote build/icon.png and build/icon.ico');
})().catch((err) => { console.error(err); process.exit(1); });
