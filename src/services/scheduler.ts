import cron from 'node-cron';
import { Client, TextChannel } from 'discord.js';
import { User } from '../database/models/User';
import { HoyolabService, formatHoyolabResults } from './hoyolab';
import { EndfieldService, formatEndfieldResult } from './endfield';
import { config } from '../config';

export function startScheduler(client: Client): void {
    const { hour, minute } = config.scheduler;
    const cronExpression = `${minute} ${hour} * * *`;

    console.log(`📅 Scheduler set for ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} every day`);

    cron.schedule(cronExpression, async () => {
        console.log('🔄 Running scheduled daily claims...');
        await runDailyClaims(client);
    }, {
        timezone: 'Asia/Singapore', // UTC+8
    });
}

export async function runDailyClaims(client: Client): Promise<void> {
    try {
        const users = await User.find({
            $or: [
                { 'hoyolab.token': { $exists: true, $ne: '' } },
                { 'endfield.token': { $exists: true, $ne: '' } },
            ],
        });

        console.log(`📊 Processing ${users.length} users...`);

        for (const user of users) {
            const results: string[] = [];

            // Claim Hoyolab
            if (user.hoyolab?.token) {
                try {
                    const hoyolab = new HoyolabService(user.hoyolab.token);
                    const hoyolabResults = await hoyolab.claimAll(user.hoyolab.games);
                    const resultText = formatHoyolabResults(hoyolabResults);
                    results.push('**Hoyolab**\n' + resultText);

                    // Update last claim
                    user.hoyolab.lastClaim = new Date();
                    user.hoyolab.lastClaimResult = resultText;
                } catch (error: any) {
                    console.error(`Hoyolab claim error for ${user.discordId}:`, error.message);
                    results.push('**Hoyolab**\n❌ Error: ' + error.message);
                }
            }

            // Claim Endfield
            if (user.endfield?.token) {
                try {
                    const endfield = new EndfieldService(user.endfield.token);
                    const endfieldResult = await endfield.claim();
                    const resultText = formatEndfieldResult(endfieldResult);
                    results.push('**SKPORT/Endfield**\n' + resultText);

                    // Update last claim
                    user.endfield.lastClaim = new Date();
                    user.endfield.lastClaimResult = resultText;
                } catch (error: any) {
                    console.error(`Endfield claim error for ${user.discordId}:`, error.message);
                    results.push('**SKPORT/Endfield**\n❌ Error: ' + error.message);
                }
            }

            // Save updates
            await user.save();

            // Send DM if enabled
            if (user.settings.notifyOnClaim && results.length > 0) {
                try {
                    const discordUser = await client.users.fetch(user.discordId);
                    await discordUser.send({
                        embeds: [{
                            title: '📋 Daily Claim Results',
                            description: results.join('\n\n'),
                            color: 0x00ff00,
                            timestamp: new Date().toISOString(),
                        }],
                    });
                } catch (error) {
                    // User might have DMs disabled
                    console.warn(`Could not DM user ${user.discordId}`);
                }
            }

            // Add delay between users
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log('✅ Daily claims completed');
    } catch (error) {
        console.error('Scheduler error:', error);
    }
}
