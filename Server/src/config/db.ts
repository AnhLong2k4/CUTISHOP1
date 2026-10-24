import mongoose from 'mongoose';

/** Connect to MongoDB. Logs only host and database name, never the URI. */
export async function connectDB(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  const { host, name } = mongoose.connection;
  console.log(`Connected to MongoDB (host: ${host}, database: ${name})`);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
