---
name: Discord Bot Development
description: Complete guide for developing Discord.js slash commands and bot features
---

# Discord Bot Development Skill

This skill provides comprehensive guidance for developing Discord bot features.

## Command Creation Workflow

### 1. Create Command File
Create a new file in `src/commands/`:

```typescript
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('command-name')
  .setDescription('What this command does');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  
  try {
    // Command logic here
    await interaction.editReply('Success!');
  } catch (error) {
    console.error('Command error:', error);
    await interaction.editReply('An error occurred.');
  }
}
```

### 2. Register in Index
Add to `src/commands/index.ts`:

```typescript
import * as commandName from './command-name';
export const commands = [
  // ...existing commands
  commandName,
];
```

### 3. Deploy Commands
```bash
bun run deploy
```

## Common Patterns

### Subcommands
```typescript
.addSubcommand(sub => sub
  .setName('action')
  .setDescription('Action description')
  .addStringOption(opt => opt
    .setName('input')
    .setDescription('Input value')
    .setRequired(true)))
```

### Options
```typescript
.addStringOption(opt => opt.setName('name').setDescription('desc').setRequired(true))
.addIntegerOption(opt => opt.setName('count').setDescription('desc'))
.addUserOption(opt => opt.setName('target').setDescription('desc'))
.addBooleanOption(opt => opt.setName('flag').setDescription('desc'))
```

### Getting Option Values
```typescript
const name = interaction.options.getString('name', true);
const count = interaction.options.getInteger('count') ?? 10;
const user = interaction.options.getUser('target');
```

### Embeds
```typescript
import { EmbedBuilder } from 'discord.js';

const embed = new EmbedBuilder()
  .setTitle('Title')
  .setDescription('Description')
  .setColor(0x5865F2)
  .addFields(
    { name: 'Field 1', value: 'Value 1', inline: true },
    { name: 'Field 2', value: 'Value 2', inline: true }
  )
  .setFooter({ text: 'Footer text' })
  .setTimestamp();
```

### Modals
```typescript
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

const modal = new ModalBuilder()
  .setCustomId('modal-id')
  .setTitle('Modal Title');

const input = new TextInputBuilder()
  .setCustomId('input-id')
  .setLabel('Label')
  .setStyle(TextInputStyle.Short)
  .setRequired(true);

modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
await interaction.showModal(modal);
```

### Buttons
```typescript
import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

const button = new ButtonBuilder()
  .setCustomId('button-id')
  .setLabel('Click Me')
  .setStyle(ButtonStyle.Primary);

const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
await interaction.reply({ content: 'Click:', components: [row] });
```

## Error Handling Best Practices
- Always wrap command logic in try/catch
- Use `deferReply()` for operations > 3 seconds
- Provide user-friendly error messages
- Log detailed errors for debugging
