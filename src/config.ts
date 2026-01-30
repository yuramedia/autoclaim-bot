export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
  },
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/autoclaim-bot',
  },
  scheduler: {
    hour: parseInt(process.env.CLAIM_HOUR || '9'),
    minute: parseInt(process.env.CLAIM_MINUTE || '0'),
  },
};
