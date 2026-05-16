export type UserRole = 'admin' | 'staff';

export type Env = {
  DB: D1Database;
  R2: R2Bucket;
  ASSETS: Fetcher;
  JWT_SECRET: string;
};

export type JWTPayload = {
  sub: number;
  email: string;
  role: UserRole;
  name: string;
  exp: number;
};
