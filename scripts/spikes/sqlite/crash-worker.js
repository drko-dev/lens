
const Database = require("/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/scripts/spikes/sqlite/node_modules/better-sqlite3");
const db = new Database("/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/scripts/spikes/sqlite/test-dbs/crash-test.db");
db.pragma("journal_mode = WAL");
db.exec("CREATE TABLE IF NOT EXISTS test_items (id INTEGER PRIMARY KEY, val TEXT)");

// Insertar 100 filas confirmadas
const insert100 = db.transaction(() => {
  for (let i = 0; i < 100; i++) {
    db.prepare("INSERT INTO test_items VALUES (?, ?)").run(i, "committed-" + i);
  }
});
insert100();

// Iniciar transacción de 5000 filas y morir a mitad
try {
  const insertFail = db.transaction(() => {
    for (let i = 100; i < 5100; i++) {
      db.prepare("INSERT INTO test_items VALUES (?, ?)").run(i, "uncommitted-" + i);
      if (i === 2500) {
        // Enviar señal de aborto abrupto a sí mismo (SIGKILL)
        process.kill(process.pid, "SIGKILL");
      }
    }
  });
  insertFail();
} catch (e) {}
