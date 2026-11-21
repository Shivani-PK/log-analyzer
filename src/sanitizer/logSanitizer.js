function sanitizeLog(text) {
  return text
    .replace(
      /(\bauthorization["']?[ \t]*[:=][ \t]*["']?(?:(?:bearer|basic)[ \t]+)?|\bbearer[ \t]+)(?!bearer\b|basic\b)[^\s"',;{}\[\]]+/gi,
      '$1[REDACTED]'
    )
    .replace(
      /(\b(?:password|pwd|api[_-]?key)["']?[ \t]*[:=][ \t]*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&{}\[\]"']+)/gi,
      (match, prefix, value) => {
        const quote = value[0] === '"' || value[0] === "'" ? value[0] : '';
        return `${prefix}${quote}[REDACTED]${quote}`;
      }
    )
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?![A-Za-z0-9_-])/g, '[REDACTED]');
}

module.exports = { sanitizeLog };