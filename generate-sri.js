const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JSDOM } = require('jsdom');

// 配置
const DIST_DIR = path.join(__dirname, '../dist');
const HASH_ALGORITHM = 'sha384'; // 推荐使用 sha384 或 sha512
const publicPathList = [
  'https://statics.stg.dlive.tv',
  'https://staticspre.prd.dlive.tv',
  'https://statics.prd.dlive.tv'
];

/**
 * 计算文件的 SRI 哈希值
 */
function calculateIntegrity(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const hash = crypto
    .createHash(HASH_ALGORITHM)
    .update(fileContent)
    .digest('base64');
  return `${HASH_ALGORITHM}-${hash}`;
}

/**
 * 为 HTML 中的资源添加 integrity 属性
 */
function addSriToHtml(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html);
  const { document } = dom.window;

  // 处理 JS 文件
  document.querySelectorAll('script[src]').forEach(script => {
    const src = script.getAttribute('src');
    let isPublicPath = false;
    let originUrl = '';
    for (const path of publicPathList) {
      if (src.startsWith(path)) {
        isPublicPath = true;
        originUrl = path;
      }
    }

    if (!src.startsWith('http') || isPublicPath) {
      let fileSrc = src;
      if (isPublicPath) {
        fileSrc = src.replace(originUrl, '');
      }
      let filePath = path.join(DIST_DIR, fileSrc);

      // console.log(filePath);
      if (fs.existsSync(filePath)) {
        script.setAttribute('integrity', calculateIntegrity(filePath));
        script.setAttribute('crossorigin', 'anonymous');
      }
    }
  });

  // 处理 CSS 文件
  document.querySelectorAll('link[rel="stylesheet"][href]').forEach(link => {
    const href = link.getAttribute('href');
    let isPublicPath = false;
    let originUrl = '';
    for (const path of publicPathList) {
      if (href.startsWith(path)) {
        isPublicPath = true;
        originUrl = path;
      }
    }

    if (!href.startsWith('http') || isPublicPath) {
      let fileSrc = href;
      if (isPublicPath) {
        fileSrc = href.replace(originUrl, '');
      }
      let filePath = path.join(DIST_DIR, fileSrc);
      // console.log(filePath);
      if (fs.existsSync(filePath)) {
        link.setAttribute('integrity', calculateIntegrity(filePath));
        link.setAttribute('crossorigin', 'anonymous');
      }
    }
  });

  // 保存修改后的 HTML
  fs.writeFileSync(htmlPath, dom.serialize());
  console.log(`SRI 已添加到 ${path.relative(DIST_DIR, htmlPath)}`);
}
/**
 * 生成动态加载chunk的sriMap
 */
function generateChunkSri() {
  const jsPath = path.join(DIST_DIR, '/js');
  // 1. 生成所有JS文件的SRI哈希
  const sriMapJS = fs
    .readdirSync(jsPath)
    .filter(file => file.endsWith('.js'))
    .reduce((map, file) => {
      const content = fs.readFileSync(path.join(jsPath, file), 'utf8');
      map[`/js/${file}`] = `sha384-${crypto
        .createHash('sha384')
        .update(content)
        .digest('base64')}`;
      return map;
    }, {});
  console.log(sriMapJS);
  const cssPath = path.join(DIST_DIR, '/css');
  const sriMapCss = fs
    .readdirSync(cssPath)
    .filter(file => file.endsWith('.css'))
    .reduce((map, file) => {
      const content = fs.readFileSync(path.join(cssPath, file), 'utf8');
      map[`/css/${file}`] = `sha384-${crypto
        .createHash('sha384')
        .update(content)
        .digest('base64')}`;
      return map;
    }, {});
  console.log(sriMapCss);

  // 2. 直接生成完整的sw.js文件
  const swContent = `// 自动生成的Service Worker
const SRI_MAP = ${JSON.stringify({ ...sriMapJS, ...sriMapCss }, null, 2)};

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('fetch', event => {
const url = new URL(event.request.url);
if (SRI_MAP[url.pathname] && url.pathname.endsWith('.js')) {
  event.respondWith(
    fetch(new Request(event.request, {
      integrity: SRI_MAP[url.pathname],
      credentials: 'omit'
    }))
  );
}
});
`;

  fs.writeFileSync(path.join(DIST_DIR, 'sri-sw.js'), swContent);
}

/**
 * 主函数：遍历 dist 目录处理所有 HTML
 */
function main() {
  fs.readdirSync(DIST_DIR).forEach(file => {
    if (file.endsWith('index.html')) {
      generateChunkSri();
      addSriToHtml(path.join(DIST_DIR, file));
    }
  });
  console.log('所有文件 SRI 生成完成');
}

main();
