const sqlite3 = require("sqlite3");
const db = new sqlite3.Database("/home/node/.n8n/database.sqlite");
const targets = [
  "webhook_entity",
  "workflow_entity",
  "shared_workflow",
  "workflows_tags",
  "workflow_tag",
  "workflow_statistics",
  "workflow_history",
  "workflow_tag_entity"
];

db.serialize(() => {
  db.all("select name from sqlite_master where type='table'", (err, rows) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    const existing = new Set(rows.map((r) => r.name));
    const toDelete = targets.filter((t) => existing.has(t));
    const sql = "PRAGMA foreign_keys=OFF;" + toDelete.map((t) => "DELETE FROM " + t + ";").join("");
    db.exec(sql, (err2) => {
      if (err2) {
        console.error(err2);
        process.exit(1);
      }
      console.log("deleted tables: " + toDelete.join(", "));
      db.close();
    });
  });
});
