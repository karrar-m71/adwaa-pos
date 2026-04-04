const fs = require('fs');
const path = require('path');

function nowIso() {
  return new Date().toISOString();
}

function safeBaseName(filePath) {
  return path.basename(filePath || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function listUserTables(db) {
  const rows = db
    .prepare(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
      `,
    )
    .all();
  return rows.map((r) => r.name);
}

function exportBackupToFile({ db, dbPath, outputPath }) {
  const tables = listUserTables(db);
  const payload = {
    meta: {
      version: '2.0',
      source: 'adwaa-pos-local-sqlite',
      created_at: nowIso(),
      db_file: safeBaseName(dbPath),
    },
    data: {},
  };

  let totalRows = 0;
  for (const table of tables) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    payload.data[table] = rows;
    totalRows += rows.length;
  }

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  return {
    ok: true,
    outputPath,
    tableCount: tables.length,
    totalRows,
    tables,
    createdAt: payload.meta.created_at,
  };
}

function restoreBackupFromFile({ db, inputPath, mode = 'replace' }) {
  const raw = fs.readFileSync(inputPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || typeof parsed.data !== 'object') {
    throw new Error('صيغة ملف النسخة الاحتياطية غير صحيحة');
  }

  const tables = listUserTables(db);
  const tablesInBackup = Object.keys(parsed.data).filter((name) => tables.includes(name));
  if (!tablesInBackup.length) {
    throw new Error('لا توجد جداول قابلة للاستعادة في الملف');
  }

  const restoreTx = db.transaction(() => {
    db.pragma('foreign_keys = OFF');
    try {
      if (mode === 'replace') {
        for (const table of tablesInBackup) {
          db.prepare(`DELETE FROM ${table}`).run();
        }
      }

      let restoredRows = 0;
      const details = [];
      for (const table of tablesInBackup) {
        const rows = Array.isArray(parsed.data[table]) ? parsed.data[table] : [];
        if (!rows.length) {
          details.push({ table, rows: 0 });
          continue;
        }

        const columns = Object.keys(rows[0]);
        if (!columns.length) {
          details.push({ table, rows: 0 });
          continue;
        }

        const placeholders = columns.map(() => '?').join(', ');
        const colSql = columns.join(', ');
        const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${colSql}) VALUES (${placeholders})`);
        for (const row of rows) {
          stmt.run(columns.map((c) => (Object.prototype.hasOwnProperty.call(row, c) ? row[c] : null)));
          restoredRows += 1;
        }
        details.push({ table, rows: rows.length });
      }

      return {
        restoredRows,
        restoredTables: tablesInBackup.length,
        details,
      };
    } finally {
      db.pragma('foreign_keys = ON');
    }
  });

  const result = restoreTx();
  return {
    ok: true,
    inputPath,
    ...result,
    restoredAt: nowIso(),
  };
}

module.exports = {
  exportBackupToFile,
  restoreBackupFromFile,
};

