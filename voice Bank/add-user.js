const sqlite3 = require("sqlite3").verbose();
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const db = new sqlite3.Database("./bank.db", (err) => {
  if (err) {
    console.error("❌ Database error:", err.message);
    process.exit(1);
  } else {
    console.log("✅ Connected to SQLite database\n");
    askUserDetails();
  }
});

function askUserDetails() {
  rl.question("Full Name: ", (full_name) => {
    rl.question("Branch Name: ", (branch_name) => {
      rl.question("Initial Balance (₹): ", (balance) => {
        rl.question("PIN (4 digits): ", (pin) => {
          rl.question("Email (optional, press Enter to skip): ", (email) => {
            rl.question("Phone (optional, press Enter to skip): ", (phone) => {
              addUser(full_name, branch_name, balance, pin, email, phone);
            });
          });
        });
      });
    });
  });
}

function addUser(full_name, branch_name, balance, pin, email, phone) {
  // Validate PIN
  if (pin.length !== 4 || !/^\d+$/.test(pin)) {
    console.log("\n❌ PIN must be exactly 4 digits!");
    db.close();
    rl.close();
    return;
  }

  // Get next 12-digit account number
  db.get("SELECT MAX(account_number) as max_acc FROM accounts", (err, row) => {
    if (err) {
      console.error("❌ Error:", err.message);
      db.close();
      rl.close();
      return;
    }

    // Start from 100000000000 (12 digits) or increment from max
    const baseAccount = 100000000000; // 12-digit starting number
    const maxAcc = row.max_acc || (baseAccount - 1);
    const newAccountNumber = maxAcc >= baseAccount ? maxAcc + 1 : baseAccount;
    const balanceAmount = parseFloat(balance) || 0;

    db.run(
      `INSERT INTO accounts (account_number, full_name, branch_name, balance, pin, email, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newAccountNumber, full_name, branch_name, balanceAmount, pin, email || null, phone || null],
      (err2) => {
        if (err2) {
          console.error("❌ Error adding user:", err2.message);
        } else {
          console.log("\n✅ User added successfully!");
          console.log(`   Account Number: ${newAccountNumber}`);
          console.log(`   Name: ${full_name}`);
          console.log(`   Branch: ${branch_name}`);
          console.log(`   Balance: ₹${balanceAmount}`);
          console.log(`   PIN: ${pin}`);
        }
        db.close();
        rl.close();
      }
    );
  });
}

