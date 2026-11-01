// Postgres LISTEN/NOTIFY channels. The worker sends (pg_notify) and the web
// server listens (apps/web/src/lib/realtime/escrow-bridge.ts). Keep one copy here.
export const PROJECTION_CHANGED_CHANNEL = "projection_changed";
export const NOTIFICATION_CREATED_CHANNEL = "notification_created";
