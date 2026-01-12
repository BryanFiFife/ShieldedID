import type { Knex } from 'knex';

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'shielded_id',
    },
    migrations: {
      directory: './apps/registry-server/migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './apps/registry-server/seeds',
      extension: 'ts',
    },
  },
  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
    migrations: {
      directory: './apps/registry-server/migrations',
      extension: 'ts',
    },
  },
  test: {
    client: 'sqlite3',
    connection: ':memory:',
    migrations: {
      directory: './apps/registry-server/migrations',
      extension: 'ts',
    },
  },
};

export default config;
