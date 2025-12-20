# AI Voice Banking System

A multi-language voice banking application with PIN-protected withdrawals, built with Node.js, Express, and SQLite.

## Features

- 🌐 **Multi-language Support**: English, Hindi (हिंदी), and Kannada (ಕನ್ನಡ)
- 🎤 **Voice Commands**: Full voice interaction in all 3 languages
- 💰 **Deposit Money**: Add funds to your account
- 📉 **Withdraw Money**: Withdraw funds with PIN verification
- 📊 **Check Balance**: View your account balance
- 🔐 **PIN Security**: PIN required for all withdrawals
- 📱 **Responsive Design**: Modern UI with smooth animations
- 🔊 **Voice Prompts**: Automatic voice guidance on every page

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Installation

1. **Navigate to the project directory:**
   ```bash
   cd "voice Bank"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Initialize the database:**
   ```bash
   node init-db.js
   ```

   This will:
   - Create the SQLite database (`bank.db`)
   - Create the accounts table
   - Add sample accounts with PINs

## Running the Project

1. **Start the server:**
   ```bash
   node servar.js
   ```

   The server will start on `http://localhost:5000`

2. **Open the application:**
   - Open `index.html` in your web browser, or
   - Navigate to `http://localhost:5000/index.html`

## Adding Users

You have three options to add users:

### Option 1: Interactive Script (Recommended)
```bash
node add-user.js
```
Follow the prompts to enter user details.

### Option 2: Quick Script
1. Edit `add-user-quick.js` and modify the user details
2. Run:
   ```bash
   node add-user-quick.js
   ```

### Option 3: API Endpoint
Use the registration API:
```bash
curl -X POST http://localhost:5000/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Doe",
    "branch_name": "Delhi Branch",
    "initial_balance": 10000,
    "pin": "9999",
    "email": "john@example.com",
    "phone": "9876543212"
  }'
```

## Test Accounts

The database comes with two sample accounts:

| Account Number | Name | Branch | Balance | PIN |
|---------------|------|--------|---------|-----|
| 1001 | Manju Kumar | Bangalore Main | ₹5000 | 1234 |
| 1002 | Ravi Singh | Mysore Branch | ₹3000 | 5678 |

## API Endpoints

### Deposit Money
```http
POST /deposit
Content-Type: application/json

{
  "account_number": "1001",
  "deposit_amount": 1000
}
```

### Withdraw Money (Requires PIN)
```http
POST /withdraw
Content-Type: application/json

{
  "account_number": "1001",
  "withdraw_amount": 500,
  "pin": "1234"
}
```

### Check Balance
```http
GET /api/balance/:accountNumber
```

Example: `GET /api/balance/1001`

### Get Account Info
```http
GET /account/:accountNumber
```

### Register New Account
```http
POST /register
Content-Type: application/json

{
  "full_name": "John Doe",
  "branch_name": "Delhi Branch",
  "initial_balance": 10000,
  "pin": "9999",
  "email": "john@example.com",
  "phone": "9876543212"
}
```

### Verify PIN
```http
POST /verify-pin
Content-Type: application/json

{
  "account_number": "1001",
  "pin": "1234"
}
```

## Project Structure

```
voice Bank/
├── index.html              # Main entry point
├── deposit.html             # Deposit page (English)
├── withdraw.html           # Withdraw page (English)
├── balence.html            # Balance page (English)
├── deposit.hi.html          # Deposit page (Hindi)
├── withdraw.hi.html         # Withdraw page (Hindi)
├── balence_hi.html          # Balance page (Hindi)
├── deposit_kn.html          # Deposit page (Kannada)
├── withdraw_kn.html         # Withdraw page (Kannada)
├── balance_kn.html          # Balance page (Kannada)
├── servar.js               # Main server file
├── init-db.js              # Database initialization
├── add-user.js             # Interactive user addition script
├── add-user-quick.js       # Quick user addition script
├── update-pins.js          # Update PINs for existing accounts
├── bank.db                 # SQLite database (created on init)
├── style2.css              # Stylesheet
└── package.json            # Dependencies
```

## Database Schema

```sql
CREATE TABLE accounts (
  account_number INTEGER PRIMARY KEY,
  full_name VARCHAR(50),
  branch_name VARCHAR(50),
  balance INTEGER,
  pin VARCHAR(10),
  email VARCHAR(100),
  phone VARCHAR(20)
);
```

## Voice Commands

The application supports full voice interaction in all three languages:

### Language Selection Page
- **Say**: "English", "Hindi", or "Kannada" to select language
- The system will automatically prompt you to choose a language on page load

### Main Menu
- **Say**: "Deposit", "Withdraw", "Balance", or "Exit"
- Voice prompts will guide you in the selected language

### Deposit Page
- **Say**: "Account number [number]" or just the account number
- **Say**: The amount (e.g., "one thousand rupees" or "1000")
- **Say**: Quick amounts like "five hundred", "one thousand", "two thousand", or "five thousand"

### Withdraw Page
- **Say**: Account number first
- **Say**: Withdrawal amount
- **Say**: Your 4-digit PIN when prompted

### Balance Page
- **Say**: Your account number
- The system will speak your balance and account details

### Microphone Button
- Click the 🎤 button on any page to activate voice recognition
- The system will listen for your commands

## Usage Flow

1. **Select Language**: Choose from English, Hindi, or Kannada (or say it)
2. **Choose Operation**: 
   - Deposit: Add money to account (say "deposit")
   - Withdraw: Remove money (requires PIN) (say "withdraw")
   - Balance: Check account balance (say "balance")
3. **Enter Details**: 
   - Use voice commands to enter account number, amount, and PIN
   - Or fill in manually using the form fields

## Security Features

- ✅ PIN verification required for withdrawals
- ✅ PIN must be exactly 4 digits
- ✅ Balance validation before withdrawal
- ✅ Account existence verification

## Stopping the Server

Press `Ctrl + C` in the terminal where the server is running, or:

**Windows PowerShell:**
```powershell
Get-Process -Name node | Stop-Process -Force
```

## Troubleshooting

### Port Already in Use
If port 5000 is already in use:
- Stop the existing process
- Or change the PORT in `servar.js`

### Database Errors
If you encounter database errors:
```bash
# Reinitialize the database
node init-db.js
```

### Dependencies Not Found
```bash
# Reinstall dependencies
npm install
```

## Technologies Used

- **Backend**: Node.js, Express.js
- **Database**: SQLite3
- **Frontend**: HTML, CSS, JavaScript
- **Styling**: Custom CSS with animations

## License

ISC

## Author

Voice Banking System

---

**Note**: This is a demo project. For production use, implement additional security measures like password hashing, encryption, and proper authentication.


