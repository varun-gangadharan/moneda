// Stripe server SDK (TEST MODE). Server only. See PLAN.md Phases 3 & 5.
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
  typescript: true,
});
