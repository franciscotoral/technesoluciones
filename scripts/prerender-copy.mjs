import { readFileSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const distDir = 'dist';
const indexHtml = join(distDir, 'index.html');
const routesFile = 'prerender-routes.txt';

const routes = readFileSync(routesFile, 'utf-8')
  .split('\n')
  .map(r => r.trim())
  .filter(r => r && r !== '/');

for (const route of routes) {
  const segments = route.replace(/^\//, '').split('/');
  const targetDir = join(distDir, ...segments);
  const targetFile = join(targetDir, 'index.html');

  mkdirSync(targetDir, { recursive: true });
  copyFileSync(indexHtml, targetFile);
  console.log(`✔ ${route}  →  ${targetFile}`);
}

// Write prerendered-routes.json
const allRoutes = [
  '/',
  ...routes,
];
writeFileSync(
  join(distDir, 'prerendered-routes.json'),
  JSON.stringify(allRoutes, null, 2),
);
console.log(`\n✔ dist/prerendered-routes.json generado con ${allRoutes.length} rutas.`);
