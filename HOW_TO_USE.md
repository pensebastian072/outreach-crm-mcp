# How to Use the Test Emails Feature - Summary

## 📖 You Asked: "Okay how do I use it?"

Here's everything you need to know!

---

## 🎯 Quick Answer

### Start Using It Right Now:

```bash
# Step 1: Start the server
npm start

# Step 2: Open your browser
# Visit: http://localhost:8080

# Step 3: Click the "🧪 Test Emails" tab in the navigation

# Step 4: Generate test emails
# - Enter a number (1-50)
# - Click "▶ Run Test"
# - View your generated emails!
```

---

## 📚 Documentation Available

I've created **3 comprehensive guides** for you:

### 1. 📖 Quick Start Guide
**File**: `QUICKSTART_TEST_EMAILS.md`
- **Purpose**: Get started in under 5 minutes
- **Content**: 3-step quick start, common questions, quick tips
- **Best For**: First-time users who want to jump right in

### 2. 📘 Complete User Guide
**File**: `TEST_EMAILS_GUIDE.md`
- **Purpose**: Comprehensive documentation
- **Content**: Full feature explanations, workflows, troubleshooting, security
- **Best For**: Understanding all features and capabilities in detail

### 3. 📙 Main README
**File**: `README.md` (updated)
- **Purpose**: Complete application documentation
- **Content**: Added Test Emails to Web Application section with usage instructions
- **Best For**: Understanding how Test Emails fits into the overall application

---

## 🚀 What Can You Do With It?

### Generate Test Emails
✅ Create 1-50 test outreach emails at once
✅ Uses real contacts from your database
✅ Same algorithm as production emails
✅ See quality scores (0-100)

### Review Email Quality
✅ View complete email content
✅ See which template was used
✅ Check the approach/angle
✅ Evaluate scores before sending

### Manage Test Data
✅ Delete individual test emails
✅ Bulk delete all test emails
✅ Completely isolated from production
✅ Safe to experiment

---

## 🖼️ What the UI Looks Like

Based on the screenshots taken during implementation:

### Empty State
When you first visit the Test Emails page, you see:
- A clean interface with controls at the top
- Number input (default: 5)
- "Run Test" button (green)
- "Delete All Test Emails" button (red)
- Empty state message: "No test emails yet"

### With Test Emails
After generating emails, you see:
- Grid layout of email cards
- Each card shows:
  - 👤 Contact name, title, company
  - 📧 Subject line
  - 📝 Full email body
  - 🎯 Quality score (e.g., "Score: 85/100")
  - 📋 Template used (e.g., "Template: CEO_FOUNDER")
  - 🎨 Angle used (e.g., "Angle: ROLE_FIRST")
  - 🗑️ Delete button

### Status Messages
Real-time feedback:
- "Generating 5 test emails..." (blue)
- "Successfully generated 5 test emails!" (green)
- Error messages if something goes wrong (red)

---

## ⚙️ Prerequisites

Before you can use it, make sure you have:

1. **Database initialized**:
   ```bash
   sqlite3 ./data/outreach.db < schema.sql
   ```

2. **Contacts in database**:
   - Import contacts via MCP server, OR
   - Manually add test contacts

3. **Dependencies installed**:
   ```bash
   npm install
   npm run build
   ```

---

## 🔍 Common Questions

### Q: Where do the test emails come from?
**A**: They use real contacts from your database and the same email generation system as production.

### Q: Will test emails affect my real campaigns?
**A**: No! Test emails are marked with `is_test = 1` and are completely isolated from production data.

### Q: Can I delete test emails?
**A**: Yes! Delete individual emails or all at once. Only test emails can be deleted (never production).

### Q: What if I get "No eligible contacts"?
**A**: You need to add contacts to your database first. See the Prerequisites section above.

### Q: What's a good score?
**A**: Scores ≥ 7 are considered good quality. Higher scores indicate better emails.

---

## 📁 File Structure

```
hq-outreach-mcp/
├── QUICKSTART_TEST_EMAILS.md      ← Quick start guide (START HERE!)
├── TEST_EMAILS_GUIDE.md           ← Complete user guide
├── README.md                       ← Main documentation (updated)
├── public/
│   ├── index.html                 ← Test Emails page UI
│   ├── app.js                     ← Test Emails functionality
│   └── styles.css                 ← Test Emails styling
├── src/
│   └── web-server.ts              ← Test Emails API endpoints
└── schema.sql                     ← Database schema (with is_test column)
```

---

## 🎓 Learning Path

1. **Start Here**: Read `QUICKSTART_TEST_EMAILS.md` (5 min)
2. **Try It**: Follow the 3-step quick start
3. **Learn More**: Read `TEST_EMAILS_GUIDE.md` when you're ready
4. **Explore**: Check the main `README.md` for other features

---

## 🆘 Need Help?

1. Check the documentation:
   - `QUICKSTART_TEST_EMAILS.md` - Quick answers
   - `TEST_EMAILS_GUIDE.md` - Detailed help

2. Common fixes:
   - Server not starting? Run `npm install` then `npm start`
   - No contacts? Import or add test data
   - Errors? Check browser console (F12)

3. Verify setup:
   ```bash
   # Check if database exists
   ls -la data/outreach.db
   
   # Check if contacts exist
   sqlite3 data/outreach.db "SELECT COUNT(*) FROM contacts;"
   
   # Check if server is running
   curl http://localhost:8080/health
   ```

---

## ✅ You're Ready!

Everything is set up and documented. Just run:
```bash
npm start
```

Then visit: **http://localhost:8080**

And click: **🧪 Test Emails**

Happy testing! 🎉

---

## 📖 Documentation Quick Links

- [Quick Start Guide](QUICKSTART_TEST_EMAILS.md) - Get started in 5 minutes
- [Complete User Guide](TEST_EMAILS_GUIDE.md) - Full documentation
- [Main README](README.md) - Application overview
