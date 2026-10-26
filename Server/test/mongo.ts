import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Brand } from '../src/models/Brand.js';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { User } from '../src/models/User.js';

let server: MongoMemoryServer | null = null;

/** Start one in-memory MongoDB for the test file and connect Mongoose. */
export async function connectTestDb(): Promise<void> {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri('cutishop1_test'));
  // Wait until unique indexes really exist; otherwise constraint
  // tests race the asynchronous index build and become flaky.
  await Promise.all([
    User.init(),
    RefreshSession.init(),
    Category.init(),
    Brand.init(),
    Product.init(),
  ]);
}

export async function clearTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

export async function closeTestDb(): Promise<void> {
  await mongoose.disconnect();
  if (server) await server.stop();
  server = null;
}
