const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./bank.db", (err) => {
  if (err) {
    console.error("❌ Database error:", err.message);
    process.exit(1);
  } else {
    console.log("✅ Connected to SQLite database\n");
    
    // Get all accounts with 4-digit account numbers
    db.all("SELECT * FROM accounts WHERE account_number < 100000000000", (err, rows) => {
      if (err) {
        console.error("❌ Error reading accounts:", err.message);
        db.close();
        return;
      }
      
      if (rows.length === 0) {
        console.log("✅ No accounts to migrate. All accounts already have 12-digit numbers.");
        db.close();
        return;
      }
      
      console.log(`📋 Found ${rows.length} account(s) to migrate:\n`);
      rows.forEach(row => {
        console.log(`   Account: ${row.account_number} -> ${String(row.account_number).padStart(12, '0')}`);
        console.log(`   Name: ${row.full_name}`);
      });
      
      console.log("\n🔄 Starting migration...\n");
      
      // Migrate each account
      let migrated = 0;
      const baseAccount = 100000000000; // 12-digit base
      
      rows.forEach((row, index) => {
        const oldAccNum = row.account_number;
        // Map old account to 12-digit: 1001 -> 100000000001, 1002 -> 100000000002
        const newAccNum = baseAccount + oldAccNum;
        
        console.log(`🔄 Migrating: ${oldAccNum} -> ${newAccNum} (${row.full_name})`);
        
        // Update account number directly (SQLite allows this)
        db.run("UPDATE accounts SET account_number = ? WHERE account_number = ?", 
          [newAccNum, oldAccNum], 
          (err2) => {
            if (err2) {
              console.error(`❌ Error migrating account ${oldAccNum}:`, err2.message);
            } else {
              migrated++;
              console.log(`✅ Successfully migrated: ${oldAccNum} -> ${newAccNum}`);
            }
            
            // Close database after last account
            if (index === rows.length - 1) {
              console.log(`\n✅ Migration complete! ${migrated} account(s) migrated.`);
              
              // Show final account list
              setTimeout(() => {
                db.all("SELECT account_number, full_name, balance FROM accounts ORDER BY account_number", (err, finalRows) => {
                  if (!err && finalRows.length > 0) {
                    console.log("\n📋 Final account list:");
                    console.log("=".repeat(70));
                    finalRows.forEach(r => {
                      const accStr = String(r.account_number).padStart(12, '0');
                      console.log(`   ${accStr} | ${r.full_name} | Balance: ₹${r.balance}`);
                    });
                    console.log("=".repeat(70));
                  }
                  db.close();
                });
              }, 500);
            }
          }
        );
      });
    });
  }
});

