import { connectDB } from './config/db.js';
import { loadEnv } from './config/env.js';
import { createApp } from './app.js';
import { expireReservations } from './services/orderService.js';

async function main() {
  const env = loadEnv();
  await connectDB(env.MONGO_URI);
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT} (NODE_ENV=${env.NODE_ENV})`);
  });
  // Reservation expiry job (ADR 2.3): every 15 minutes, cancel PENDING
  // orders past reservationExpiresAt and release their holds exactly
  // once. This runs only in the real server entrypoint, not in tests
  // (tests call expireReservations directly).
  const timer = setInterval(() => {
    expireReservations().catch((error) => {
      console.error('Reservation expiry job failed:', error instanceof Error ? error.message : error);
    });
  }, 15 * 60 * 1000);
  timer.unref();
}

main().catch((error) => {
  console.error('Server failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
