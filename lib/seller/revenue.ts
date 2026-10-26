import { dateRange, paidWhere } from "./data";

const DAY = 86_400_000;
const localDate = (time: number) => new Date(time + 7 * 3_600_000).toISOString().slice(0, 10);
export function revenueRange(params: URLSearchParams, now = Date.now()) {
  const normalized = new URLSearchParams(params);
  if (params.has("start") || params.has("end")) {
    normalized.set("range", "custom");
    normalized.set("from", params.get("start") || "");
    normalized.set("to", params.get("end") || "");
  } else if (params.has("preset")) {
    const preset = params.get("preset")!;
    normalized.set("range", ({ "7d": "7", "30d": "30" } as Record<string, string>)[preset] || preset);
  }
  const { from, to } = dateRange(normalized, now);
  return { from, to, start: localDate(from), end: localDate(to - DAY), preset: normalized.get("range") || "today", previousFrom: from - (to - from), previousTo: from };
}
export function percentageChange(current: number, previous: number) {
  return previous === 0 ? (current === 0 ? 0 : null) : (current - previous) / previous * 100;
}

// Normalize validated Vietnamese numbers and legacy formatting. Never return identities.
const cleanPhone = "replace(replace(replace(replace(replace(replace(trim(o.phone),' ',''),'-',''),'.',''),'(',''),')',''),'+','')";
const identity = `CASE WHEN NULLIF(trim(o.user_id),'') IS NOT NULL THEN 'user:'||o.user_id WHEN NULLIF(${cleanPhone},'') IS NOT NULL THEN 'phone:'||CASE WHEN substr(${cleanPhone},1,2)='84' THEN '0'||substr(${cleanPhone},3) ELSE ${cleanPhone} END END`;
const successful = `${paidWhere} AND o.status IN ('PAID','PREPARING','SHIPPING','COMPLETED')`;
type Summary = { revenue: number; count: number; aov: number; customers: number; returning: number; apf: number; repurchaseDays: number | null };

export async function revenueDashboard(db: D1Database, params: URLSearchParams, now = Date.now()) {
  const range = revenueRange(params, now);
  const where = `${successful} AND o.paid_at>=? AND o.paid_at<?`;
  const summarySql = `WITH purchases AS (
    SELECT o.total,o.paid_at,${identity} customer FROM orders o WHERE ${where}
  ), customers AS (
    SELECT customer,COUNT(*) n FROM purchases WHERE customer IS NOT NULL GROUP BY customer
  ), intervals AS (
    SELECT paid_at-LAG(paid_at) OVER (PARTITION BY customer ORDER BY paid_at) gap FROM purchases WHERE customer IS NOT NULL
  ) SELECT COALESCE(SUM(total),0) revenue,COUNT(*) count,COALESCE(AVG(total),0) aov,
    (SELECT COUNT(*) FROM customers) customers,
    (SELECT COUNT(*) FROM customers WHERE n>=2) "returning",
    COALESCE(COUNT(*)*1.0/NULLIF((SELECT COUNT(*) FROM customers),0),0) apf,
    (SELECT AVG(gap)/86400000.0 FROM intervals WHERE gap IS NOT NULL) repurchaseDays FROM purchases`;
  // Fixed query count; large aggregations stay in D1. Batch gives a consistent snapshot.
  const results = await db.batch([
    db.prepare(summarySql).bind(range.from, range.to),
    db.prepare(summarySql).bind(range.previousFrom, range.previousTo),
    db.prepare(`SELECT date(o.paid_at/1000,'unixepoch','+7 hours') day,SUM(o.total) revenue,COUNT(*) count FROM orders o WHERE ${where} GROUP BY day ORDER BY day`).bind(range.from, range.to),
    db.prepare(`SELECT i.product_id,MAX(i.product_name_snapshot) name,MAX(p.image_url) image_url,SUM(i.quantity) packs,SUM(i.quantity*i.price_snapshot) revenue FROM order_items i JOIN orders o ON o.id=i.order_id LEFT JOIN products p ON p.id=i.product_id WHERE ${where} GROUP BY i.product_id ORDER BY revenue DESC,i.product_id`).bind(range.from, range.to),
    db.prepare(`WITH recent AS (SELECT o.id,o.order_code,o.customer_name,o.total,o.paid_at FROM orders o WHERE ${where} ORDER BY o.paid_at DESC,o.id DESC LIMIT 5) SELECT r.*,GROUP_CONCAT(i.product_name_snapshot||' ('||i.quantity||')', ', ') products FROM recent r LEFT JOIN order_items i ON i.order_id=r.id GROUP BY r.id ORDER BY r.paid_at DESC,r.id DESC`).bind(range.from, range.to),
    db.prepare(`SELECT p.provider,SUM(p.amount) amount,COUNT(*) count FROM orders o JOIN payments p ON p.id=o.paid_payment_id AND p.order_id=o.id WHERE ${where} AND p.resolution='MATCHED' GROUP BY p.provider ORDER BY amount DESC,p.provider`).bind(range.from, range.to),
    db.prepare(`SELECT CAST(CAST(strftime('%H',o.paid_at/1000,'unixepoch','+7 hours') AS INTEGER)/3 AS INTEGER) slot,SUM(o.total) revenue,COUNT(*) count FROM orders o WHERE ${where} GROUP BY slot ORDER BY slot`).bind(range.from, range.to),
    // Same created-in-period cohort for numerator and denominator.
    db.prepare(`SELECT COUNT(*) eligible,COALESCE(SUM(CASE WHEN ${successful} AND o.paid_at<? THEN 1 ELSE 0 END),0) successful FROM orders o WHERE o.created_at>=? AND o.created_at<?`).bind(range.to, range.from, range.to),
  ]);
  const current = results[0].results[0] as unknown as Summary;
  const previous = results[1].results[0] as unknown as Summary;
  const returningRate = (s: Summary) => s.customers ? s.returning / s.customers * 100 : 0;
  const rawDaily = results[2].results as unknown as { day: string; revenue: number; count: number }[];
  const byDay = new Map(rawDaily.map(row => [row.day, row]));
  const daily = [];
  for (let day = range.from; day < range.to; day += DAY) {
    const key = localDate(day);
    daily.push(byDay.get(key) || { day: key, revenue: 0, count: 0 });
  }
  const hours = results[6].results as unknown as { slot: number; revenue: number; count: number }[];
  const cohort = results[7].results[0] as unknown as { eligible: number; successful: number };
  return {
    range,
    summary: { ...current, returningRate: returningRate(current) },
    comparisons: {
      revenue: percentageChange(current.revenue, previous.revenue),
      count: percentageChange(current.count, previous.count),
      aov: percentageChange(current.aov, previous.aov),
      returningRate: percentageChange(returningRate(current), returningRate(previous)),
    },
    daily,
    products: results[3].results as unknown as { product_id: string; name: string; image_url: string | null; packs: number; revenue: number }[],
    recent: results[4].results as unknown as { id: string; order_code: string; customer_name: string; total: number; paid_at: number; products: string | null }[],
    payments: results[5].results as unknown as { provider: string; amount: number; count: number }[],
    hours: Array.from({ length: 8 }, (_, slot) => ({ slot, label: `${slot * 3}–${slot * 3 + 3}h`, revenue: 0, count: 0, ...hours.find(row => row.slot === slot) })),
    paymentSuccess: { ...cohort, rate: cohort.eligible ? cohort.successful / cohort.eligible * 100 : 0 },
  };
}
export type RevenueDashboardData = Awaited<ReturnType<typeof revenueDashboard>>;
