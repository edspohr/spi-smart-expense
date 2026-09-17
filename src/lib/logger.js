// Central logging wrapper. Keep it minimal — the point is a single seam
// where we can wire Sentry/Datadog later without touching every call site.

const isDev = import.meta.env.DEV;

function fmt(level, context, err, extra) {
  const parts = [`[${level}]`];
  if (context) parts.push(context);
  if (err instanceof Error) parts.push(err.message);
  else if (err !== undefined) parts.push(err);
  return { prefix: parts.join(' '), err, extra };
}

export const logger = {
  debug(context, err, extra) {
    if (!isDev) return;
    const { prefix } = fmt('debug', context, err, extra);
    console.debug(prefix, err, extra ?? '');
  },
  info(context, err, extra) {
    const { prefix } = fmt('info', context, err, extra);
    console.info(prefix, err, extra ?? '');
  },
  warn(context, err, extra) {
    const { prefix } = fmt('warn', context, err, extra);
    console.warn(prefix, err, extra ?? '');
  },
  error(context, err, extra) {
    const { prefix } = fmt('error', context, err, extra);
    console.error(prefix, err, extra ?? '');
  },
};

export default logger;
