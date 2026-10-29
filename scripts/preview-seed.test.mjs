import test from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/db.js";
import { seedIsolatedPreview } from "../src/preview-seed.js";
test("isolated preview only seeds synthetic users, is repeatable and rejects production storage/provider credentials", () => {
  const db = createDb(":memory:");
  try {
    seedIsolatedPreview(db, {});
    assert.equal(db.prepare("SELECT COUNT(*) n FROM organisations").get().n, 0);
    const env = {
      SUPERPRO_ISOLATED_PREVIEW: "1",
      PREVIEW_BUSINESS_PASSWORD: "Synthetic-preview-password-only-123!",
    };
    seedIsolatedPreview(db, env);
    seedIsolatedPreview(db, env);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM organisations").get().n, 2);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get().n, 3);
    assert.ok(
      db
        .prepare("SELECT email FROM users")
        .all()
        .every((u) => u.email.endsWith("@preview.invalid")),
    );
    for (const extra of [
      { REQUIRE_PERSISTENT_DISK: "1" },
      { BACKUP_S3_BUCKET: "real-bucket" },
      { DATABASE_PATH: "/var/data/production.sqlite" },
      { RESEND_API_KEY: "not-a-real-key" },
    ])
      assert.throws(() => seedIsolatedPreview(db, { ...env, ...extra }));
  } finally {
    db.close();
  }
});
