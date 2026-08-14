import 'dotenv/config';
import { createApp } from './app';
import { env } from './config/env';
import { syncPermissions } from './lib/sync-permissions';
import { ensureProjectCatalog } from './modules/projects/catalog';
import { prisma } from './lib/prisma';

async function main() {
  await syncPermissions();
  await ensureProjectCatalog(prisma);
  const app = createApp();
  app.listen(env.API_PORT, () => {
    console.log(`WorkNest API listening on http://localhost:${env.API_PORT}`);
    console.log(`Swagger docs: http://localhost:${env.API_PORT}/api/docs`);
  });
}

main().catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});

