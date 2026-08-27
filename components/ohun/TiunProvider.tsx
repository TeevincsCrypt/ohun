"use client";

import { useEffect } from "react";
import { tiun } from "@tiun/sdk";
import { activateSubscription } from "@/lib/billing/actions";

/**
 * The tiun SDK integration. Mounted once, app-wide, in the root layout —
 * see app/layout.tsx.
 *
 * This is deliberately the only place tiun.init() is called. Everywhere
 * else that needs tiun (UpgradeDialog's checkout button) just calls
 * tiun.checkout()/tiun.getUser() against the instance this sets up.
 */
export function TiunProvider() {
  useEffect(() => {
    const snippetId = process.env.NEXT_PUBLIC_TIUN_SNIPPET_ID;
    const productId = process.env.NEXT_PUBLIC_TIUN_PRODUCT_ID;
    if (!snippetId) return;

    tiun.init({
      snippetId,
      sandbox: process.env.NEXT_PUBLIC_TIUN_SANDBOX === "true",
      onUserChange: (event) => {
        // Fires on checkout among other things — this is what actually
        // flips the account over once a purchase completes. See the
        // trust-boundary note on activateSubscription() for the caveat.
        if (event.event === "checkout" && productId && event.user?.productAccess.includes(productId)) {
          void activateSubscription(productId);
        }
      },
    });

    return () => tiun.destroy();
  }, []);

  return null;
}
