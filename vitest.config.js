import { defineConfig } from 'vitest/config';

// Vitest config — pure-Node ESM tests, no browser globals required.
// The few client modules we test pull React imports indirectly; we don't
// instantiate them, so jsdom isn't needed.
export default defineConfig({
  test: {
    environment: 'node',
    include:     ['src/**/*.test.js', 'src/**/*.test.jsx'],
    // Single-threaded by default — the LP solver does big internal
    // arrays; parallel workers don't buy much for ~25ms tests.
    pool:        'threads',
    testTimeout: 5000,
  },
});
