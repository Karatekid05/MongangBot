# 🛒 Market System Guide

## Overview
The Market system allows users to purchase exclusive WL (Whitelist) spots and special roles using their $CASH. Each market item gives users a specific Discord role for either a permanent or temporary duration.

## 🎯 Features

### For Users
- **Easy Purchase**: Click buttons in the market channel or use `/market buy`
- **Instant Role Assignment**: Receive roles immediately after purchase
- **Flexible Duration**: Choose between permanent or temporary roles
- **$CASH Payment**: Pay with your total $CASH balance
- **Error Handling**: Clear error messages for insufficient funds or existing roles

### For Moderators
- **Item Management**: Add, remove, and list market items
- **Channel Setup**: Configure market and log channels
- **Purchase Tracking**: All purchases logged in private channel
- **Role Management**: Automatic role assignment and removal

## 📋 Commands

### User Commands
- `/market buy` - Purchase items from the market
- `/help` - Access the market help guide

### Moderator Commands
- `/market setup` - Setup the market message in a channel
- `/market add` - Add new items to the market
- `/market remove` - Remove items from the market
- `/market list` - List all market items

## 🛠️ Setup Instructions

### 1. Setup Market Channel
```bash
/market setup log_channel:CHANNEL_ID
```
- Replace `CHANNEL_ID` with the ID of the channel where purchase logs will be sent
- This creates a market message with interactive buttons
- The message will be automatically updated when items are added/removed

### 2. Add Market Items
```bash
/market add name:"VIP Access" description:"Exclusive VIP role for 24 hours" price:1000 role_id:ROLE_ID duration_hours:24
```

**Parameters:**
- `name`: Item name (required)
- `description`: Item description (required)
- `price`: Price in $CASH (required, minimum 1)
- `role_id`: Discord role ID to assign (required)
- `duration_hours`: Duration in hours, 0 for permanent (optional, default 0)

### 3. Example Items

**Permanent VIP Role:**
```bash
/market add name:"Lifetime VIP" description:"Permanent VIP access to exclusive channels" price:5000 role_id:1234567890123456789 duration_hours:0
```

**Temporary WL Access:**
```bash
/market add name:"24h WL Access" description:"24-hour whitelist access for upcoming project" price:500 role_id:9876543210987654321 duration_hours:24
```

**Event Access:**
```bash
/market add name:"Tournament Entry" description:"Access to weekend tournament" price:200 role_id:1112223334445556667 duration_hours:48
```

## 🔄 How It Works

### Purchase Flow
1. User clicks a button in the market channel or uses `/market buy`
2. System checks if user has sufficient $CASH
3. If successful:
   - $CASH is deducted from user's total balance
   - Role is assigned immediately
   - Purchase is logged in the log channel
   - User receives confirmation message
4. If failed:
   - User receives error message (insufficient funds, already has role, etc.)
   - No $CASH is deducted

### Temporary Roles
- Temporary roles are automatically removed after the specified duration
- Role removal is logged in the log channel
- Users are notified when their temporary role expires

### Logging System
All purchases and role removals are logged in the configured log channel with:
- User information
- Item details
- Price paid
- Duration (if temporary)
- Timestamp

## 💰 Pricing Strategy

### Recommended Pricing
- **Permanent Roles**: 1000-10000 $CASH (depending on exclusivity)
- **Temporary WL (24h)**: 200-1000 $CASH
- **Event Access (48h)**: 100-500 $CASH
- **Special Events**: 500-2000 $CASH

### Factors to Consider
- Role exclusivity and benefits
- Duration (permanent vs temporary)
- User $CASH earning rates
- Market demand

## 🔧 Technical Details

### Database Models
- **MarketItem**: Stores item information (name, price, role, duration)
- **MarketPurchase**: Tracks all purchases and their status
- **MarketMessage**: Stores market channel configuration

### Role Management
- Roles are assigned using Discord.js role management
- Temporary roles use `setTimeout` for automatic removal
- Error handling includes automatic refunds if role assignment fails

### $CASH Integration
- Uses existing `removeCash` function from pointsManager
- Deducts from total $CASH balance (not weekly)
- Automatic refunds if purchase fails

## 🚨 Troubleshooting

### Common Issues

**"Insufficient $CASH"**
- User doesn't have enough $CASH in their total balance
- Check user's balance with `/profile`

**"You already have this role"**
- User already has the role (for permanent roles)
- Consider making it temporary or creating a different role

**"Error assigning role"**
- Bot doesn't have permission to assign the role
- Role ID is incorrect
- Bot's role is lower than the target role

**"Item not found"**
- Item was removed or is inactive
- Check with `/market list`

### Moderator Actions
- Use `/market list` to see all active items
- Use `/market remove` to remove problematic items
- Check bot permissions for role assignment
- Verify role IDs are correct

## 📊 Best Practices

### For Moderators
1. **Test Items**: Create test items with low prices first
2. **Role Hierarchy**: Ensure bot's role is higher than assignable roles
3. **Clear Descriptions**: Write clear, informative descriptions
4. **Reasonable Pricing**: Set prices based on user earning rates
5. **Monitor Logs**: Regularly check the log channel for issues

### For Users
1. **Check Balance**: Use `/profile` before making purchases
2. **Read Descriptions**: Understand what you're buying
3. **Note Duration**: Pay attention to temporary vs permanent roles
4. **Contact Support**: If you encounter issues, contact moderators

## 🔄 Updates and Maintenance

### Regular Tasks
- Monitor purchase logs for unusual activity
- Update item descriptions and prices as needed
- Remove expired or outdated items
- Backup purchase data regularly

### Future Enhancements
- Bulk item management
- Discount codes and promotions
- Purchase history for users
- Advanced role scheduling
- Integration with external payment systems

---

**Note**: The Market system is designed to be simple and reliable. Always test new items with moderators before making them available to users. 