/**
 * DEV-ONLY: Vite module glob for page discovery.
 *
 * import.meta.glob is a compile-time macro — the pattern must be a literal
 * string. If you change PAGES_DIR via environment, you must update this
 * pattern to match. Production uses the pre-built route manifest instead.
 */
export const pageModules = import.meta.glob('/src/pages/**/*.{js,jsx,ts,tsx}');
