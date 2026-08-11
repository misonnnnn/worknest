import 'dotenv/config';
import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

app.listen(env.API_PORT, () => {
  console.log(`WorkNest API listening on http://localhost:${env.API_PORT}`);
  console.log(`Swagger docs: http://localhost:${env.API_PORT}/api/docs`);
});
