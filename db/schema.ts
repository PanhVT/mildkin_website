import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const orderStatuses = [
  "PENDING_PAYMENT",
  "PAID",
  "PREPARING",
  "SHIPPING",
  "COMPLETED",
  "CANCELLED",
] as const;
export const paymentStatuses = [
  "PENDING",
  "PAID",
  "EXPIRED",
  "FAILED",
] as const;
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    price: integer("price").notNull(),
    imageUrl: text("image_url").notNull(),
    flavor: text("flavor").notNull(),
    seasonal: integer("seasonal", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    stock: integer("stock").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("product_price_positive", sql`${t.price} > 0`),
    check("stock_nonnegative", sql`${t.stock} >= 0`),
  ],
);
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at"),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orderCode: text("order_code").notNull().unique(),
    accessTokenHash: text("access_token_hash").notNull().unique(),
    userId: text("user_id").references(() => users.id),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    address: text("address").notNull(),
    ward: text("ward").notNull(),
    district: text("district").notNull(),
    city: text("city").notNull(),
    note: text("note"),
    subtotal: integer("subtotal").notNull(),
    shippingFee: integer("shipping_fee").notNull(),
    shippingMethod: text("shipping_method", { enum: ["DELIVERY", "PICKUP"] }).notNull().default("DELIVERY"),
    deliveryDistanceMeters: integer("delivery_distance_meters"),
    total: integer("total").notNull(),
    status: text("status", { enum: orderStatuses })
      .notNull()
      .default("PENDING_PAYMENT"),
    paymentStatus: text("payment_status", { enum: paymentStatuses })
      .notNull()
      .default("PENDING"),
    bankCode: text("bank_code").notNull(),
    bankAccount: text("bank_account").notNull(),
    accountHolder: text("account_holder").notNull(),
    paidPaymentId: text("paid_payment_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    paidAt: integer("paid_at"),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [
    index("orders_payment_status_idx").on(t.paymentStatus),
    index("orders_created_at_idx").on(t.createdAt),
    index("orders_user_id_idx").on(t.userId),
    check(
      "order_total_valid",
      sql`${t.total} = ${t.subtotal} + ${t.shippingFee} AND ${t.subtotal} > 0 AND ${t.shippingFee} >= 0`,
    ),
  ],
);
export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    productNameSnapshot: text("product_name_snapshot").notNull(),
    priceSnapshot: integer("price_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    index("items_order_idx").on(t.orderId),
    uniqueIndex("items_product_order_idx").on(t.orderId, t.productId),
    check("item_quantity_valid", sql`${t.quantity} BETWEEN 1 AND 20`),
  ],
);
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").references(() => orders.id),
    provider: text("provider").notNull(),
    providerTransactionId: text("provider_transaction_id").notNull().unique(),
    amount: integer("amount").notNull(),
    bank: text("bank").notNull(),
    account: text("account").notNull(),
    content: text("content").notNull(),
    referenceCode: text("reference_code"),
    rawPayload: text("raw_payload").notNull(),
    resolution: text("resolution").notNull().default("REVIEW"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("payments_order_id_idx").on(t.orderId)],
);
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export const requestLimits = sqliteTable(
  "request_limits",
  {
    id: text("id").primaryKey(),
    attempts: integer("attempts").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("request_limits_expiry_idx").on(t.expiresAt)],
);
