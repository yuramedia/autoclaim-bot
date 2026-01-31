import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { User } from '../database/models/User';
import { HoyolabService, type GameAccount } from '../services/hoyolab';
import { CodeSourceService, type RedeemCode } from '../services/code-source';

export const data = new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Redeem gift codes for your HoYoverse accounts')
    .addSubcommand(subcommand =>
        subcommand
            .setName('manual')
            .setDescription('Redeem a specific code manually')
            .addStringOption(option =>
                option.setName('game')
                    .setDescription('The game to redeem for')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Genshin Impact', value: 'genshin' },
                        { name: 'Honkai: Star Rail', value: 'starRail' },
                        { name: 'Zenless Zone Zero', value: 'zenlessZoneZero' },
                        { name: 'Honkai Impact 3rd', value: 'honkai3' },
                        { name: 'Tears of Themis', value: 'tearsOfThemis' }
                    ))
            .addStringOption(option =>
                option.setName('code')
                    .setDescription('The redemption code')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('auto')
            .setDescription('Automatically check and redeem available codes from community DB'));

async function redeemForUser(
    hoyolab: HoyolabService,
    gameKey: string,
    codes: string[],
    accounts?: GameAccount[]
): Promise<string[]> {
    if (!accounts) {
        accounts = await hoyolab.getGameAccounts(gameKey);
    }

    if (accounts.length === 0) return [`No accounts found for ${gameKey}`];

    const results: string[] = [];

    for (const account of accounts) {
        const accInfo = `${gameKey} [${account.region_name} - ${account.nickname}]`;
        for (const code of codes) {
            // Rate limit delay
            await new Promise(r => setTimeout(r, 1000));
            const result = await hoyolab.redeemCode(gameKey, account, code);
            const icon = result.success ? '✅' : '❌';
            results.push(`${icon} **${accInfo}** (${code}): ${result.message}`);
        }
    }
    return results;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const user = await User.findOne({ discordId: interaction.user.id });
    if (!user || !user.hoyolab?.token) {
        await interaction.editReply({
            content: '❌ You need to setup your Hoyolab account first using `/setup-hoyolab`.'
        });
        return;
    }

    const hoyolab = new HoyolabService(user.hoyolab.token);
    const subcommand = interaction.options.getSubcommand();

    try {
        if (subcommand === 'manual') {
            const game = interaction.options.getString('game', true);
            const code = interaction.options.getString('code', true).trim();

            const results = await redeemForUser(hoyolab, game, [code]);

            const embed = new EmbedBuilder()
                .setTitle('Manual Redemption Result')
                .setColor(0x00FF00) // Green
                .setDescription(results.join('\n') || 'No actions taken.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'auto') {
            await interaction.editReply('⏳ Fetching codes and redeeming... This may take a moment.');

            const sourceCodes = await CodeSourceService.getCodes();
            if (!sourceCodes) {
                await interaction.editReply('❌ Failed to fetch active codes from the database.');
                return;
            }

            const messages: string[] = [];

            // Map our game keys to Hashblen keys
            // Hashblen keys: hsr, genshin, zzz
            // Our keys: starRail, genshin, zenlessZoneZero

            // 1. Genshin
            if (sourceCodes.genshin?.length) {
                const codes = sourceCodes.genshin.map(c => c.code);
                messages.push(...await redeemForUser(hoyolab, 'genshin', codes));
            }

            // 2. Star Rail
            if (sourceCodes.hsr?.length) {
                const codes = sourceCodes.hsr.map(c => c.code);
                messages.push(...await redeemForUser(hoyolab, 'starRail', codes));
            }

            // 3. ZZZ
            if (sourceCodes.zzz?.length) {
                const codes = sourceCodes.zzz.map(c => c.code);
                messages.push(...await redeemForUser(hoyolab, 'zenlessZoneZero', codes));
            }

            // Split message if too long (Discord limit is 4096 for description, but let's be safe)
            const fullLog = messages.join('\n');
            if (fullLog.length > 4000) {
                // Simple truncation for now, or send as file
                const buffer = Buffer.from(fullLog, 'utf-8');
                await interaction.editReply({
                    content: '✅ Auto-redemption complete! Logic too long to display, see attachment.',
                    files: [{ attachment: buffer, name: 'redemption-log.txt' }]
                });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('Auto Redemption Result')
                    .setColor(0x0099FF)
                    .setDescription(fullLog || 'No codes found or no matching games enabled.')
                    .setTimestamp();
                await interaction.editReply({ content: null, embeds: [embed] });
            }
        }
    } catch (error: any) {
        console.error('Redeem command error:', error);
        await interaction.editReply({
            content: `❌ An error occurred: ${error.message}`
        });
    }
}
