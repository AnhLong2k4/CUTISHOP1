import { connectDB } from './config/db.js';
import { loadEnv } from './config/env.js';
import { createApp } from './app.js';

async function main() {
  const env = loadEnv();
  await connectDB(env.MONGO_URI);
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT} (NODE_ENV=${env.NODE_ENV})`);
  });
}

main().catch((error) => {
  console.error('Server failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
