export function pLimit(concurrency = 1) {
  const limit = Math.max(1, Number(concurrency) || 1);
  const queue = [];
  let activeCount = 0;

  const next = () => {
    if (activeCount >= limit) return;
    const item = queue.shift();
    if (!item) return;

    activeCount += 1;
    Promise.resolve()
      .then(item.fn)
      .then(item.resolve, item.reject)
      .finally(() => {
        activeCount -= 1;
        next();
      });
  };

  return function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}
