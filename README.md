# MonGang Discord Bot

A Discord bot for tracking gang activity and managing points in a server with 4 gangs.

## Features

- Tracks messages in gang channels and awards points
- Awards daily rewards to NFT holders
- Multiple leaderboard systems
- Trophy system for gangs
- Export data to Google Sheets
- Weekly stats tracking and reset
- Monad NFT integration for automatic rewards

## Requirements

- Node.js v16.9.0 or higher
- MongoDB database
- Discord Bot Token
- Google Sheets API credentials
- Monad Testnet API access

## Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in your credentials
4. Create a Google Sheets spreadsheet and set the spreadsheet ID in the `.env` file
5. Update the Monad NFT contract addresses in the `.env` file
6. Start the bot: `npm start`

## Environment Variables

Fill the following variables in your `.env` file:

```
# Discord Bot Token
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# MongoDB Connection String
MONGODB_URI=your_mongodb_connection_string

# Google Sheets API
GOOGLE_SHEETS_CLIENT_EMAIL=your_service_account_email
GOOGLE_SHEETS_PRIVATE_KEY=your_service_account_private_key
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id

# Discord Server Information
DISCORD_GUILD_ID=your_discord_server_id
MOD_ROLE_ID=your_moderator_role_id

# Monad NFT Integration
MONAD_API_URL=https://api-testnet.monad.xyz
NFT_COLLECTION1_ADDRESS=0x1234567890123456789012345678901234567890
NFT_COLLECTION2_ADDRESS=0x0987654321098765432109876543210987654321
```

## Commands

### User Commands

- `/leaderboard type:[Members/Gangs/Specific Gang] weekly:[true/false]` - Show leaderboards
- `/registerwallet address:0x...` - Register your Monad wallet for NFT verification
- `/give user:@user amount:50` - Give some of your $CASH to another user

### Moderator Commands

- `/award user:@user source:[Games/Memes & Art/Chat Activity/Others] amount:100` - Award $CASH to a user
- `/remove user:@user amount:50` - Remove $CASH from a user
- `/awardtrophy gang:[Gang Name]` - Award a trophy to a gang
- `/removetrophy gang:[Gang Name]` - Remove a trophy from a gang
- `/export-leaderboards weekly:[true/false]` - Export leaderboards to Google Sheets
- `/reset` - Reset weekly stats and export data
- `/updatenft user:@user collection1:2 collection2:5` - Manually update a user's NFT holdings
- `/syncnfts user:@user` - Sync NFT holdings from the blockchain for all users or a specific user

## Points System

- Members earn 10 $CASH per message in their gang channel (20-second cooldown)
- NFT Collection 1: 100 $CASH daily per NFT
- NFT Collection 2: 10 $CASH daily per NFT
- Moderators can award or remove points manually

## Gangs

The bot tracks 4 gangs:
- Sea Kings
- Thunder Birds
- Fluffy Ninjas
- Chunky Cats

## NFT Integration

The bot automatically:
1. Syncs NFT holdings daily from the Monad testnet
2. Awards daily rewards based on NFT holdings
3. Allows users to register their wallet address with `/registerwallet`

## Development

To run the bot in development mode with auto-restart on file changes:

```
npm run dev
``` 