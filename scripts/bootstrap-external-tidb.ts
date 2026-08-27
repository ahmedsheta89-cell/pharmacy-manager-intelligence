import { readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { EXTERNAL_TIDB_APPLY_CONFIRMATION, EXTERNAL_TIDB_SCHEMA, EXTERNAL_TIDB_TABLES, parseReviewedTidbStatements, pendingExternalTidbStatements, summarizeExternalTidbStatements, validateExternalTidbConnection } from "../shared/externalTidbBootstrap";

type CountRow = { count: number | string };
type NameRow = { name: string };
type TableRow = { tableName: string };
type ColumnRow = { tableName: string; columnName: string };

const action = process.argv.includes("--apply") ? "apply" : "verify";
const expectedSchema = process.env.EXTERNAL_DB_EXPECTED_SCHEMA;
const databaseUrl = process.env.DATABASE_URL_TIDB_TEST;
const connectionValidation = validateExternalTidbConnection(databaseUrl, expectedSchema);

if (!connectionValidation.valid) throw new Error(connectionValidation.errors.join(" "));
if (action === "apply" && process.env.EXTERNAL_DB_APPLY_CONFIRMATION !== EXTERNAL_TIDB_APPLY_CONFIRMATION) {
  throw new Error("لم يُمنح تأكيد صريح لتطبيق قيود TiDB على قاعدة الاختبار.");
}

const sqlPath = path.resolve(import.meta.dirname, "external-tidb-constraints-and-indexes.sql");
const sql = await readFile(sqlPath, "utf8");
const statements = parseReviewedTidbStatements(sql);
const summary = summarizeExternalTidbStatements(statements);
const connection = await mysql.createConnection({ uri: databaseUrl!, ssl: { rejectUnauthorized: true, minVersion: "TLSv1.2" } });

try {
  const [tables] = await connection.query<TableRow[]>("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = ?", [EXTERNAL_TIDB_SCHEMA]);
  const actualTables = new Set(tables.map((table) => table.tableName));
  const missingTables = EXTERNAL_TIDB_TABLES.filter((table) => !actualTables.has(table));
  const unexpectedTables = [...actualTables].filter((table) => !EXTERNAL_TIDB_TABLES.includes(table as (typeof EXTERNAL_TIDB_TABLES)[number]));
  if (missingTables.length || unexpectedTables.length) throw new Error("مخطط TiDB لا يطابق قائمة جداول الاختبار المعتمدة.");

  const [columns] = await connection.query<ColumnRow[]>("SELECT table_name AS tableName, column_name AS columnName FROM information_schema.columns WHERE table_schema = ? AND table_name = 'customer_requests' AND column_name = 'recordedByUserId'", [EXTERNAL_TIDB_SCHEMA]);
  if (columns.length !== 1) throw new Error("حقل recordedByUserId غير موجود كما هو متوقع في قاعدة الاختبار.");

  const nonEmptyTables: string[] = [];
  for (const table of EXTERNAL_TIDB_TABLES) {
    const [rows] = await connection.query<CountRow[]>(`SELECT COUNT(*) AS count FROM \`${EXTERNAL_TIDB_SCHEMA}\`.\`${table}\``);
    if (Number(rows[0]?.count ?? 0) > 0) nonEmptyTables.push(table);
  }
  if (action === "apply" && nonEmptyTables.length) throw new Error("يرفض المنفذ تطبيق تغييرات المخطط عندما تحتوي قاعدة الاختبار على بيانات.");

  const [foreignKeys] = await connection.query<NameRow[]>("SELECT constraint_name AS name FROM information_schema.referential_constraints WHERE constraint_schema = ?", [EXTERNAL_TIDB_SCHEMA]);
  const [indexes] = await connection.query<NameRow[]>("SELECT DISTINCT index_name AS name FROM information_schema.statistics WHERE table_schema = ? AND index_name <> 'PRIMARY'", [EXTERNAL_TIDB_SCHEMA]);
  const pendingBefore = pendingExternalTidbStatements(statements, foreignKeys.map((row) => row.name), indexes.map((row) => row.name));

  if (action === "apply") {
    for (const statement of pendingBefore) await connection.query(statement.sql);
  }

  const [foreignKeysAfter] = await connection.query<NameRow[]>("SELECT constraint_name AS name FROM information_schema.referential_constraints WHERE constraint_schema = ?", [EXTERNAL_TIDB_SCHEMA]);
  const [indexesAfter] = await connection.query<NameRow[]>("SELECT DISTINCT index_name AS name FROM information_schema.statistics WHERE table_schema = ? AND index_name <> 'PRIMARY'", [EXTERNAL_TIDB_SCHEMA]);
  const pendingAfter = pendingExternalTidbStatements(statements, foreignKeysAfter.map((row) => row.name), indexesAfter.map((row) => row.name));

  console.log(JSON.stringify({ action, schema: EXTERNAL_TIDB_SCHEMA, tables: actualTables.size, nonEmptyTables: nonEmptyTables.length, expectedForeignKeys: summary.foreignKeys, expectedIndexes: summary.indexes, pendingBefore: pendingBefore.length, applied: action === "apply" ? pendingBefore.length : 0, pendingAfter: pendingAfter.length, recordedByUserId: true }, null, 2));
  if (action === "apply" && pendingAfter.length) throw new Error("لم تكتمل كل قيود وفهارس TiDB بعد التطبيق.");
} finally {
  await connection.end();
}
