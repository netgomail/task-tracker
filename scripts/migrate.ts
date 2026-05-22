import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { db } from "@/db/client";

migrate(db, { migrationsFolder: "./db/migrations" });
console.log("✔ migrations applied");
