// No-op stub for `react-devtools-core`.
//
// Ink dynamically imports react-devtools-core only when its in-terminal
// React DevTools integration is enabled (a development-only feature that
// SpearCode never turns on). The real package is a heavy optional dependency;
// aliasing it to this stub keeps the dead code path satisfied at bundle time
// so the portable binary has zero unresolved imports.
const noop = () => {};
export default { connectToDevTools: noop, connectWithCustomMessagingProtocol: noop };
export const connectToDevTools = noop;
export const connectWithCustomMessagingProtocol = noop;
