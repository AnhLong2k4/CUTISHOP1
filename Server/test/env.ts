// Test-only environment. Values are synthetic and never used outside tests.
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/cutishop1_placeholder';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-value-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-value-0123456789';
process.env.BCRYPT_COST = '10';
process.env.APP_URL = 'http://127.0.0.1:5173';
process.env.CORS_ORIGINS =
  'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174';
