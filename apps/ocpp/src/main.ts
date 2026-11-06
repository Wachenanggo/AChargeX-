/** AChargeX OCPP service entrypoint — configuration comes from environment variables. */
import { createOcppServer } from './app';

const env = process.env;
const supabase =
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_JWT_SECRET
    ? { url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, jwtSecret: env.SUPABASE_JWT_SECRET }
    : undefined;
const demoMode = env.DEMO_MODE ? env.DEMO_MODE === 'true' : !supabase;

const app = createOcppServer({
  port: Number(env.PORT ?? 8080),
  demoMode,
  simulator: env.SIMULATOR ? env.SIMULATOR === 'true' : demoMode,
  simSpeed: Number(env.SIM_SPEED ?? 20),
  simSecret: env.SIM_SECRET,
  allowUnregistered: env.ALLOW_UNREGISTERED_CHARGERS ? env.ALLOW_UNREGISTERED_CHARGERS === 'true' : demoMode,
  publicOcppUrl: env.PUBLIC_OCPP_URL,
  publicAppUrl: env.PUBLIC_APP_URL ?? 'http://localhost:5173',
  heartbeatS: Number(env.HEARTBEAT_INTERVAL ?? 60),
  corsOrigin: env.CORS_ORIGIN ?? '*',
  allowDemoPaymentOnReal: env.ALLOW_DEMO_PAYMENT_ON_REAL === 'true',
  supabase,
});

app.start().catch((e) => {
  console.error(e);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void app.stop().finally(() => process.exit(0));
  });
}
