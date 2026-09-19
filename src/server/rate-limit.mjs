// Trava de tentativas de login por origem (IP). Janela deslizante de falhas;
// ao atingir o teto, a origem fica bloqueada por lockoutSeconds. O relogio e
// injetavel para testes (mesmo padrao de `now` usado no resto do servidor).
export function createLoginLimiter({
  maxFailures = 5,
  windowSeconds = 300,
  lockoutSeconds = 300,
  now = () => Date.now() / 1000,
} = {}) {
  const failures = new Map(); // key -> timestamps de falhas na janela
  const lockedUntil = new Map(); // key -> expiracao da trava

  function prune(key) {
    const cutoff = now() - windowSeconds;
    const list = (failures.get(key) || []).filter((stamp) => stamp > cutoff);
    if (list.length) failures.set(key, list);
    else failures.delete(key);
  }

  return {
    check(key) {
      const lock = lockedUntil.get(key);
      if (lock && lock > now()) return { allowed: false, retryAfter: Math.ceil(lock - now()) };
      if (lock) lockedUntil.delete(key);
      prune(key);
      return { allowed: true, failures: failures.get(key)?.length || 0 };
    },
    registerFailure(key) {
      prune(key);
      const list = failures.get(key) || [];
      list.push(now());
      if (list.length >= maxFailures) {
        lockedUntil.set(key, now() + lockoutSeconds);
        failures.delete(key);
      } else {
        failures.set(key, list);
      }
    },
    reset(key) {
      failures.delete(key);
      lockedUntil.delete(key);
    },
  };
}