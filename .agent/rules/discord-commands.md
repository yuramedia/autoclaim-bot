---
description: Guidelines for creating Discord slash commands
activation: model_decision
model_trigger: When working on Discord bot commands, slash commands, or command handlers
---

# Discord Commands Rules

## Command Structure
Every command file should export:
```typescript
export const data = new SlashCommandBuilder()
  .setName('command-name')
  .setDescription('Command description');

export async function execute(interaction: ChatInputCommandInteraction) {
  // Command logic
}
```

## Best Practices

### Defer Replies
For long-running operations, defer the reply immediately:
```typescript
await interaction.deferReply();
// ... long operation
await interaction.editReply({ content: 'Done!' });
```

### Error Handling
Always wrap command execution in try/catch:
```typescript
try {
  await interaction.deferReply();
  // Command logic
} catch (error) {
  console.error('Command failed:', error);
  const reply = interaction.deferred 
    ? interaction.editReply 
    : interaction.reply;
  await reply.call(interaction, { 
    content: 'An error occurred!', 
    ephemeral: true 
  });
}
```

### Embeds
Use embeds for rich responses:
```typescript
const embed = new EmbedBuilder()
  .setTitle('Title')
  .setDescription('Description')
  .setColor(0x00FF00);
await interaction.reply({ embeds: [embed] });
```

### Ephemeral Messages
Use ephemeral for sensitive data or error messages:
```typescript
await interaction.reply({ content: 'Private message', ephemeral: true });
```

## Subcommands
Use subcommand groups for related functionality:
```typescript
.addSubcommand(sub => 
  sub.setName('action')
     .setDescription('Perform action'))
```
