import { ItemClaim, ReceiptForSession, SessionParticipant } from './sessionService';

export function computeUserTotal(
  userId: string,
  participants: SessionParticipant[],
  receipt: ReceiptForSession,
  claims: ItemClaim[]
): number {
  const claimsByItem = new Map<number, { userId: string; units: number }[]>();
  for (const c of claims) {
    const units = c.units ?? 1;
    if (units <= 0) continue;
    if (!claimsByItem.has(c.item_index)) claimsByItem.set(c.item_index, []);
    claimsByItem.get(c.item_index)!.push({ userId: c.user_id, units });
  }

  let itemSubtotal = 0;

  receipt.items.forEach((item, index) => {
    const lineTotal = item.lineTotal ?? 0;
    const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
    const perUnit = qty > 0 ? lineTotal / qty : lineTotal;
    const itemClaims = claimsByItem.get(index) ?? [];
    const totalClaimedUnits = itemClaims.reduce((s, c) => s + c.units, 0);
    const myUnits = itemClaims
      .filter((c) => c.userId === userId)
      .reduce((s, c) => s + c.units, 0);

    if (totalClaimedUnits <= 0) {
      const share = participants.length > 0 ? lineTotal / participants.length : lineTotal;
      itemSubtotal += share;
      return;
    }

    if (myUnits > 0) itemSubtotal += myUnits * perUnit;

    const remainingUnits = Math.max(0, qty - totalClaimedUnits);
    if (remainingUnits > 0 && participants.length > 0) {
      const remainderCost = remainingUnits * perUnit;
      itemSubtotal += remainderCost / participants.length;
    }
  });

  const subtotal = receipt.subtotal ?? 0;
  const proportion =
    subtotal > 0
      ? itemSubtotal / subtotal
      : participants.length > 0
        ? 1 / participants.length
        : 1;
  const tax = (receipt.tax ?? 0) * proportion;
  const tip = (receipt.tip ?? 0) * proportion;

  return itemSubtotal + tax + tip;
}
