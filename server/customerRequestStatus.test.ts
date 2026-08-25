import { describe, expect, it } from "vitest";
import { customerRequests } from "../drizzle/schema";

describe("دورة حالات طلب العميل", () => {
  it("تفصل عدم التوفر عن الإلغاء وحالات التوريد والتواصل", () => {
    expect(customerRequests.status.enumValues).toEqual([
      "requested",
      "awaiting_supply",
      "ready_to_contact",
      "contacted",
      "fulfilled",
      "unavailable",
      "cancelled",
    ]);
  });
});
