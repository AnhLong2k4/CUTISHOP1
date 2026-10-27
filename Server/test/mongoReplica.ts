import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Brand } from '../src/models/Brand.js';
import { Category } from '../src/models/Category.js';
import { Coupon } from '../src/models/Coupon.js';
import { CouponRedemption } from '../src/models/CouponRedemption.js';
import { Cart } from '../src/models/Cart.js';
import { InventoryMovement } from '../src/models/InventoryMovement.js';
import { Order } from '../src/models/Order.js';
import { Product } from '../src/models/Product.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { User } from '../src/models/User.js';

let replSet: MongoMemoryReplSet | null = null;

/**
 * Start an in-memory MongoDB replica set for order tests. Transactions
 * (used by every order lifecycle change) are only valid on a replica
 * set, so the standalone helper in mongo.ts must NOT be used here.
 */
export async function connectTestReplicaDb(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(replSet.getUri('cutishop1_test'));
  await Promise.all([
    User.init(),
    RefreshSession.init(),
    Category.init(),
    Brand.init(),
    Product.init(),
    Order.init(),
    Coupon.init(),
    CouponRedemption.init(),
    InventoryMovement.init(),
    Cart.init(),
  ]);
}

export async function clearTestReplicaDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

export async function closeTestReplicaDb(): Promise<void> {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
  replSet = null;
}
