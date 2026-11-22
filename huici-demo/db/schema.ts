import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AttentionState } from "../app/lib/session";

export const attentionStates = sqliteTable("attention_states", {
  userId: text("user_id").primaryKey(),
  state: text("state", { mode: "json" }).$type<AttentionState>().notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});
