import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Only pure logic modules are unit-tested. Screens import
    // react-native / expo-router and are verified by typecheck and
    // by running the app, not by node tests.
    include: ['src/lib/**/*.test.ts'],
  },
});
