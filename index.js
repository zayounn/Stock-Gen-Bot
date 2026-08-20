const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  ActivityType
} = require('discord.js');
const config = require('./config');

const stockDir = path.join(__dirname, 'stock');
const app = express();

app.get('/', (_req, res) => {
  res.status(200).send('Bot is online');
});

app.listen(config.httpPort, () => {
  // Express server started for health checks.
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const slashCommands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show help and available commands'),
  new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Display the current inventory stock'),
  new SlashCommandBuilder()
    .setName('gen')
    .setDescription('Generate an item from the inventory stock')
    .addStringOption((option) =>
      option
        .setName('item')
        .setDescription('Inventory category to generate from')
        .setRequired(true)
        .setAutocomplete(true)
    )
];

function ensureStockDirectory() {
  if (!fs.existsSync(stockDir)) {
    fs.mkdirSync(stockDir, { recursive: true });
  }
}

function getInventoryFiles() {
  ensureStockDirectory();

  return fs
    .readdirSync(stockDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.txt'))
    .map((entry) => ({
      name: path.basename(entry.name, '.txt'),
      filePath: path.join(stockDir, entry.name)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getInventoryCategories() {
  return getInventoryFiles().map((file) => file.name);
}

function readInventoryFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    throw new Error(`Failed to read inventory file: ${error.message}`);
  }
}

function writeInventoryFile(filePath, lines) {
  try {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  } catch (error) {
    throw new Error(`Failed to write inventory file: ${error.message}`);
  }
}

function createEmbed({ title, description, icon = '📦', color = config.embedColor, authorName }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${icon} ${title}`)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: config.footer || client.user?.username || 'Bot' });

  if (client.user) {
    embed.setAuthor({
      name: authorName || client.user.username,
      iconURL: client.user.displayAvatarURL()
    });
  }

  return embed;
}

function getCategoryCount(category) {
  const inventoryFile = getInventoryFiles().find((file) => file.name.toLowerCase() === category.toLowerCase());
  if (!inventoryFile) {
    return 0;
  }

  return readInventoryFile(inventoryFile.filePath).length;
}

function getInventoryOverviewEmbed() {
  const categories = getInventoryFiles();

  if (categories.length === 0) {
    return createEmbed({
      title: 'Inventory Empty',
      description: 'No inventory files were found in the stock folder.',
      icon: '📭',
      color: 0xf9a826
    });
  }

  const lines = categories.map((category) => {
    const count = readInventoryFile(category.filePath).length;
    return `• ${category.name} • ${count}`;
  });

  return createEmbed({
    title: 'Available Inventory',
    description: lines.join('\n'),
    icon: '📦',
    color: config.embedColor
  });
}

function getHelpEmbed() {
  return createEmbed({
    title: 'Help Center',
    description: [
      '**Slash Commands**',
      '/help',
      '/stock',
      '/gen <item>',
      '',
      '**Prefix Commands**',
      `${config.prefix}help`,
      `${config.prefix}stock`,
      `${config.prefix}gen <item>`
    ].join('\n'),
    icon: '❓',
    color: 0x2ecc71
  });
}

async function sendEmbed(target, embed) {
  if (!target) {
    return;
  }

  if (target.reply) {
    await target.reply({ embeds: [embed], ephemeral: config.ephemeralReplies });
    return;
  }

  await target.send({ embeds: [embed] });
}

async function trySendDm(user, embed) {
  if (!config.dmResults) {
    return { sent: false, reason: 'DM disabled' };
  }

  try {
    await user.send({ embeds: [embed] });
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error.message };
  }
}

async function handleGenCommand(target, user, category, source) {
  const inventoryFiles = getInventoryFiles();
  const selectedFile = inventoryFiles.find((file) => file.name.toLowerCase() === category.toLowerCase());

  if (!selectedFile) {
    await sendEmbed(target, createEmbed({
      title: 'Invalid Category',
      description: `The inventory category \`${category}\` was not found.`,
      icon: '⚠️',
      color: 0xe74c3c
    }));
    return;
  }

  const lines = readInventoryFile(selectedFile.filePath);
  if (lines.length === 0) {
    await sendEmbed(target, createEmbed({
      title: 'Out of Stock',
      description: `The category \`${category}\` is currently out of stock.`,
      icon: '🛒',
      color: 0xf1c40f
    }));
    return;
  }

  const generatedItem = lines.shift();
  writeInventoryFile(selectedFile.filePath, lines);
  const remaining = lines.length;

  const itemEmbed = createEmbed({
    title: 'Cuenta Generada',
    description: `You received: \`${generatedItem}\`\n\nRemaining stock for \`${category}\`: ${remaining}`,
    icon: '✅',
    color: 0x2ecc71
  });

  const dmResult = await trySendDm(user, itemEmbed);
  if (config.dmResults && !dmResult.sent) {
    await sendEmbed(target, createEmbed({
      title: 'DM Failed',
      description: `The item was generated, but the DM could not be delivered.\nReason: \`${dmResult.reason}\``,
      icon: '📬',
      color: 0xe67e22
    }));
    console.log(`[GEN] ${user.tag} -> ${category} | remaining: ${remaining} | dmFailed: ${dmResult.reason}`);
    return;
  }

  if (config.dmResults) {
    await sendEmbed(target, createEmbed({
      title: 'Revisa Tu DMs',
      description: `Tu cuenta se ha generado revisa tu DM.`,
      icon: '📬',
      color: 0x2ecc71
    }));
  } else {
    await sendEmbed(target, itemEmbed);
  }

  console.log(`[GEN] ${user.tag} -> ${category} | remaining: ${remaining}`);
}

async function handleSlashCommand(interaction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const { commandName, options, user, channel } = interaction;

  if (commandName === 'help') {
    await interaction.reply({ embeds: [getHelpEmbed()], ephemeral: config.ephemeralReplies });
    return;
  }

  if (commandName === 'stock') {
    await interaction.reply({ embeds: [getInventoryOverviewEmbed()], ephemeral: config.ephemeralReplies });
    return;
  }

  if (commandName === 'gen') {
    const category = options.getString('item', true);

    if (channel && channel.id !== config.genChannelId) {
      await interaction.reply({
        embeds: [createEmbed({
          title: 'Wrong Channel',
          description: `Generation commands can only be used in <#${config.genChannelId}>.`,
          icon: '🚫',
          color: 0xe74c3c
        })],
        ephemeral: config.ephemeralReplies
      });
      return;
    }

    await handleGenCommand(interaction, user, category, 'slash');
    return;
  }

  await interaction.reply({
    embeds: [createEmbed({
      title: 'Unknown Command',
      description: 'That command is not supported.',
      icon: '❓',
      color: 0xe74c3c
    })],
    ephemeral: config.ephemeralReplies
  });
}

async function handlePrefixCommand(message) {
  const content = message.content.trim();
  if (!content.startsWith(config.prefix)) {
    return;
  }

  const args = content.slice(config.prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (config.deleteCommandMessages && message.deletable) {
    await message.delete().catch(() => {});
  }

  if (!command) {
    await message.channel.send({ embeds: [createEmbed({
      title: 'Missing Arguments',
      description: 'Please provide a valid command.',
      icon: '⚠️',
      color: 0xe74c3c
    })] });
    return;
  }

  if (command === 'help') {
    await message.channel.send({ embeds: [getHelpEmbed()] });
    return;
  }

  if (command === 'stock') {
    await message.channel.send({ embeds: [getInventoryOverviewEmbed()] });
    return;
  }

  if (command === 'gen') {
    const category = args[0];
    if (!category) {
      await message.channel.send({ embeds: [createEmbed({
        title: 'Missing Arguments',
        description: `Usage: ${config.prefix}gen <item>`,
        icon: '⚠️',
        color: 0xe74c3c
      })] });
      return;
    }

    if (message.channel.id !== config.genChannelId) {
      await message.channel.send({ embeds: [createEmbed({
        title: 'Wrong Channel',
        description: `Generation commands can only be used in <#${config.genChannelId}>.`,
        icon: '🚫',
        color: 0xe74c3c
      })] });
      return;
    }

    await handleGenCommand(message.channel, message.author, category, 'prefix');
    return;
  }

  await message.channel.send({ embeds: [createEmbed({
    title: 'Unknown Command',
    description: `The command \`${command}\` is not recognized.`,
    icon: '❓',
    color: 0xe74c3c
  })] });
}

async function registerSlashCommands() {
  if (!config.autoRegisterSlashCommands) {
    return;
  }

  if (!config.token || !config.clientId || !config.guildId) {
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body: slashCommands.map((command) => command.toJSON())
    });
    console.log('Registered slash commands.');
  } catch (error) {
    console.error('Failed to register slash commands:', error.message);
  }
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error.message);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error.message);
});

client.once('ready', async () => {
  ensureStockDirectory();
  const categories = getInventoryCategories();
  console.log(`Loaded ${categories.length} inventory categories.`);
  await registerSlashCommands();
  await client.user.setActivity(config.activity, { type: ActivityType.Watching });
  console.log(`Bot online as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isAutocomplete()) {
    const focusedValue = interaction.options.getFocused();
    const choices = getInventoryCategories()
      .filter((category) => category.toLowerCase().includes(focusedValue.toLowerCase()))
      .slice(0, 25)
      .map((category) => ({ name: category, value: category }));

    await interaction.respond(choices);
    return;
  }

  if (interaction.isChatInputCommand()) {
    await handleSlashCommand(interaction).catch(async () => {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [createEmbed({
            title: 'Command Error',
            description: 'An unexpected error occurred while processing the command.',
            icon: '❌',
            color: 0xe74c3c
          })],
          ephemeral: config.ephemeralReplies
        });
      }
    });
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) {
    return;
  }

  try {
    await handlePrefixCommand(message);
  } catch (error) {
    await message.channel.send({ embeds: [createEmbed({
      title: 'Command Error',
      description: 'An unexpected error occurred while processing the command.',
      icon: '❌',
      color: 0xe74c3c
    })] });
  }
});

client.login(config.token).catch((error) => {
  console.error('Failed to connect to Discord:', error.message);
  process.exit(1);
});
