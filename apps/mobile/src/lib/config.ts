/**
 * API base URL for the mobile app.
 *
 * Expo public env vars are inlined at bundle time (EXPO_PUBLIC_*), so this
 * is configuration, not a secret. There is no API key in this app.
 *
 * Defaults:
 * - Android emulator: 10.0.2.2 is the emulator's alias for the host's
 *   loopback, so the backend on the dev machine at 127.0.0.1:8081 is
 *   reachable as http://10.0.2.2:8081.
 * - Physical device (Expo Go / dev build): 10.0.2.2 does NOT work. Start
 *   Expo with EXPO_PUBLIC_API_BASE_URL=http://<your LAN IP>:8081/api/v1
 *   and make sure the backend's CORS_ORIGINS allows the device origin
 *   (mobile apps send no Origin, which the backend already allows).
 * - Web (expo start --web, local only): use http://127.0.0.1:8081/api/v1.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:8081/api/v1';
