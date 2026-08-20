require('dotenv').config();

const config = {
  prefix: '!',
  embedColor: 0x5865f2,
  footer: 'Developed by Jacob',
  activity: 'stock',
  ownerIds: ['1092773378101882951'],
  dmResults: true,
  deleteCommandMessages: false,
  ephemeralReplies: true,
  autoRegisterSlashCommands: true,
  httpPort: 3000
};

module.exports = {
  ...config,
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  genChannelId: process.env.GEN_CHANNEL_ID
};
