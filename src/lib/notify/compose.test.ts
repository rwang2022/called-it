import { describe, expect, it } from "vitest";
import { copy, planDeliveries, type Notice } from "./compose";

const bet = { id: "b1", title: "Will Sam do a pull-up?" };
const everyone = () => true;
const n = (over: Partial<Notice> & Pick<Notice, "userId" | "kind">): Notice => ({
  groupId: "g1",
  subject: bet.id,
  payload: { title: over.kind, body: "", url: `/bets/${bet.id}` },
  ...over,
});

describe("planDeliveries", () => {
  it("never notifies the actor about their own action", () => {
    const plan = planDeliveries([n({ userId: "alex", kind: "review", actorId: "alex" }), n({ userId: "jo", kind: "review", actorId: "alex" })], everyone);
    expect([...plan.keys()]).toEqual(["jo"]);
  });

  it("drops people who are no longer in the group", () => {
    const plan = planDeliveries(
      [n({ userId: "jo", kind: "settled" }), n({ userId: "ben", kind: "settled", groupId: "g2" })],
      (g, u) => !(g === "g2" && u === "ben"),
    );
    expect([...plan.keys()]).toEqual(["jo"]);
  });

  it("sends one push per person: the most consequential notice about a bet wins", () => {
    // A dispute that settles the bet in the same action: the vote is moot.
    const plan = planDeliveries([n({ userId: "jo", kind: "vote" }), n({ userId: "jo", kind: "settled" })], everyone);
    expect(plan.size).toBe(1);
    expect(plan.get("jo")?.title).toBe("settled");
  });

  it("collapses notices about different things into one summary", () => {
    const plan = planDeliveries(
      [
        n({ userId: "jo", kind: "reveal", subject: "b1", payload: { title: "Claude's pick is out", body: "", url: "/bets/b1" } }),
        n({ userId: "jo", kind: "judge", subject: "b2", payload: { title: "Time to make the call", body: "", url: "/bets/b2" } }),
      ],
      everyone,
    );
    const p = plan.get("jo")!;
    expect(p.title).toBe("2 updates in Called It");
    expect(p.body).toBe("Time to make the call · Claude's pick is out"); // actionable first
    expect(p.url).toBe("/inbox");
  });

  it("points a summary of pure FYIs at home rather than the inbox", () => {
    const plan = planDeliveries([n({ userId: "jo", kind: "settled", subject: "b1" }), n({ userId: "jo", kind: "settled", subject: "b2" })], everyone);
    expect(plan.get("jo")?.url).toBe("/home");
  });
});

describe("copy", () => {
  it("phrases settlements from the recipient's side", () => {
    const money = { ...bet, money: true };
    expect(copy.settled(money, { result: "win", netCents: 1250 }, "Yes").title).toBe("You won $12.50");
    expect(copy.settled(money, { result: "loss", netCents: -2000 }, "No").title).toBe("You lost $20");
    expect(copy.settled(money, { result: "push", netCents: 0 }, "Yes").title).toBe("It's a wash");
    expect(copy.settled({ ...bet, money: false }, { result: "win", netCents: 0 }, "Yes").title).toBe("You called it");
    expect(copy.settled(money, { result: "push", netCents: 0 }, "void").title).toBe("Bet voided");
  });

  it("names Claude as Claude and clips long titles", () => {
    const long = { id: "b", title: "x".repeat(200) };
    const p = copy.callMade(long, { name: "Claude", isBot: true }, "Yes");
    expect(p.title).toBe("Claude called it: Yes");
    expect(p.body.length).toBeLessThan(120);
    expect(p.url).toBe("/bets/b");
  });

  it("links payments to the group ledger", () => {
    const p = copy.paymentClaimed({ id: "p1", groupId: "g1", amountCents: 500 }, { name: "Jo Park" }, "The Group Chat");
    expect(p.title).toBe("Jo says they paid you $5");
    expect(p.url).toBe("/g/g1/ledger");
  });
});
