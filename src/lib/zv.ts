import { zValidator } from '@hono/zod-validator';
import type { ZodSchema } from 'zod';

type Target = Parameters<typeof zValidator>[0];

export function zv<T extends ZodSchema>(target: Target, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const msg = result.error.issues
        .map(i => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
        .join('; ');
      return c.json({ error: msg }, 400);
    }
  });
}
