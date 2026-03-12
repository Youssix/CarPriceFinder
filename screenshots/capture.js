const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const slides = ['store-1', 'store-2', 'store-3'];

  for (const slide of slides) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
    await page.goto(`http://localhost:5555/${slide}.html`, { waitUntil: 'networkidle0' });
    await page.screenshot({
      path: path.join(__dirname, `${slide}.png`),
      clip: { x: 0, y: 0, width: 1280, height: 800 }
    });
    console.log(`✅ ${slide}.png généré`);
    await page.close();
  }

  await browser.close();
  console.log('🎉 Tous les screenshots sont prêts dans /screenshots/');
})();
