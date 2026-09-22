export async function verifyTurnstileToken(
  token: unknown,
  secret: string,
  expectedAction: string,
  expectedHostnames: Set<string>,
  remoteIp?: string,
): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048 || expectedHostnames.size === 0) {
    return false;
  }

  let result: { success?: boolean; action?: string; hostname?: string };
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    });
    if (!r.ok) throw new Error(`siteverify ${r.status}`);
    result = await r.json();
  } catch {
    return false;
  }

  return result.success === true && result.action === expectedAction && expectedHostnames.has(result.hostname ?? '');
}
