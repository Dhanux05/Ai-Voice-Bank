const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./bank.db", (err) => {
  if (err) {
    console.error("❌ Database error:", err.message);
    process.exit(1);
  } else {
    console.log("✅ Connected to SQLite database");
    
    // Update existing accounts with PINs (supporting both old 4-digit and new 12-digit account numbers)
    db.run("UPDATE accounts SET pin = '1234' WHERE account_number IN (1001, 100000000001)", (err) => {
      if (err) {
        console.error("❌ Error updating account:", err.message);
      } else {
        console.log("✅ Updated account with PIN: 1234");
      }
    });
    
    db.run("UPDATE accounts SET pin = '5678' WHERE account_number IN (1002, 100000000002)", (err) => {
      if (err) {
        console.error("❌ Error updating account:", err.message);
      } else {
        console.log("✅ Updated account with PIN: 5678");
      }
    });
    
    // Verify updates
    setTimeout(() => {
      db.all("SELECT account_number, full_name, pin FROM accounts", (err, rows) => {
        if (err) {
          console.error("❌ Error reading accounts:", err.message);
        } else {
          console.log("\n📋 Current accounts:");
          rows.forEach(row => {
            console.log(`   Account: ${row.account_number}, Name: ${row.full_name}, PIN: ${row.pin || 'Not set'}`);
          });
        }
        db.close();
        console.log("\n✅ PIN update complete!");
      });
    }, 500);
  }
});


