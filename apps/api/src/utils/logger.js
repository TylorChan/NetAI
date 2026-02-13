export function createLogger(scope = "api") {
  function base(level, message, meta = undefined) {
    const payload = {
      ts: new Date().toISOString(),
      level,
      scope,
      message,
      ...(meta ? { meta } : {})
    };
    console.log(JSON.stringify(payload));
  }

  return {
    info(message, meta) {
      base("info", message, meta);
    },
    warn(message, meta) {
      base("warn", message, meta);
    },
    error(message, meta) {
      base("error", message, meta);
    }
  };
}
