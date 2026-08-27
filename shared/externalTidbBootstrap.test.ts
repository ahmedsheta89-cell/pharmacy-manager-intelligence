import { describe, expect, it } from "vitest";
import { EXTERNAL_TIDB_APPLY_CONFIRMATION, EXTERNAL_TIDB_SCHEMA, parseReviewedTidbStatements, pendingExternalTidbStatements, summarizeExternalTidbStatements, validateExternalTidbConnection } from "./externalTidbBootstrap";

const validConnection = "mysql://user:password@gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/test?ssl=true";

describe("حارس تهيئة TiDB الخارجية", () => {
  it("يقبل TiDB Cloud وقاعدة test فقط", () => {
    expect(validateExternalTidbConnection(validConnection, EXTERNAL_TIDB_SCHEMA)).toEqual({ valid: true, errors: [] });
  });

  it("يرفض عنوانًا ناقصًا أو قاعدة غير اختبارية أو مضيفًا غير TiDB", () => {
    expect(validateExternalTidbConnection(undefined, EXTERNAL_TIDB_SCHEMA).valid).toBe(false);
    expect(validateExternalTidbConnection(validConnection.replace("/test", "/production"), EXTERNAL_TIDB_SCHEMA).valid).toBe(false);
    expect(validateExternalTidbConnection("mysql://user:password@example.com:3306/test", EXTERNAL_TIDB_SCHEMA).valid).toBe(false);
    expect(validateExternalTidbConnection(validConnection, "production").valid).toBe(false);
  });

  it("يفصل العبارات القائمة عن العبارات الناقصة بدقة", () => {
    const statements = [
      { kind: "foreignKey" as const, name: "orders_user_fk", sql: "ALTER TABLE `orders` ADD CONSTRAINT `orders_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`);" },
      { kind: "index" as const, name: "orders_user_idx", sql: "CREATE INDEX `orders_user_idx` ON `orders` (`userId`);" },
    ];
    expect(pendingExternalTidbStatements(statements, ["orders_user_fk"], [])).toEqual([statements[1]]);
    expect(summarizeExternalTidbStatements(statements)).toEqual({ foreignKeys: 1, indexes: 1 });
    expect(EXTERNAL_TIDB_APPLY_CONFIRMATION).toBe("APPLY_TIDB_TEST_SCHEMA_V1");
  });

  it("يرفض أي محتوى SQL يتجاوز القيود والفهارس", () => {
    expect(() => parseReviewedTidbStatements("DROP TABLE `users`;\n")).toThrow("غير مسموح");
  });
});
