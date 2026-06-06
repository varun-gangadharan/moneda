// Stripe server SDK (TEST MODE). Server only. See PLAN.md Phases 3 & 5.
//
// Lazily constructed: building the client at module load would require
// STRIPE_SECRET_KEY at build time (Next.js evaluates route modules during
// "Collecting page data"), and throw without it. The Proxy defers construction
// to first real use (request time), keeping `import { stripe }` ergonomic.
import Stripe from "stripe";

let client: Stripe | null = null;

function getStripe(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return client;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const instance = getStripe();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
