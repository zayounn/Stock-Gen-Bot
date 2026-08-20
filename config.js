require('dotenv').config();

const config = {
  prefix: '!',
  embedColor: 0x6C3483,
  footer: 'Developed by Jacob',
  activity: 'Make It By Jacob',
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
