// Re-export the Convex generated API so it can be imported via @/lib/convex-api
// This bridges the path resolution between src/ and convex/ directories.
export { api, internal } from '../../convex/_generated/api';
