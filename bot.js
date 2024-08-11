const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js'); // Updated import
const util = require('minecraft-server-util');
const fs = require('fs').promises;
const path = require('path');
const schedule = require('node-schedule');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

let prefix = '!';
const serverListFile = path.join(__dirname, 'serverList.json');
const playerDataFile = path.join(__dirname, 'playerData.json');
let serverList = {};
let playerData = {};
let languages = {
  'en': require('./locales/en.json'),
  'es': require('./locales/es.json'),
  // Add more languages as needed
};
let guildLanguages = {};

client.once('ready', async () => {
  console.log(`🚀 Logged in as ${client.user.tag}!`);
  try {
    await loadServerList();
    await loadPlayerData();
    startPeriodicChecks();
  } catch (error) {
    console.error('Error during initialization:', error);
  }
});

async function loadServerList() {
  try {
    const data = await fs.readFile(serverListFile, 'utf8');
    serverList = JSON.parse(data);
  } catch (error) {
    console.error('Error loading server list:', error);
    serverList = {};
  }
}

async function saveServerList() {
  try {
    await fs.writeFile(serverListFile, JSON.stringify(serverList, null, 2));
  } catch (error) {
    console.error('Error saving server list:', error);
  }
}

async function loadPlayerData() {
  try {
    const data = await fs.readFile(playerDataFile, 'utf8');
    playerData = JSON.parse(data);
  } catch (error) {
    console.error('Error loading player data:', error);
    playerData = {};
  }
}

async function savePlayerData() {
  try {
    await fs.writeFile(playerDataFile, JSON.stringify(playerData, null, 2));
  } catch (error) {
    console.error('Error saving player data:', error);
  }
}

function startPeriodicChecks() {
  schedule.scheduleJob('*/5 * * * *', async () => {
    for (const [guildId, guildServers] of Object.entries(serverList)) {
      for (const [nickname, ip] of Object.entries(guildServers)) {
        try {
          const result = await util.status(ip);
          updatePlayerData(guildId, nickname, result.players.online);
          checkServerStatus(guildId, nickname, true, result);
        } catch (error) {
          checkServerStatus(guildId, nickname, false);
        }
      }
    }
    await savePlayerData();
  });
}

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    const guildId = message.guild.id;
    if (!guildLanguages[guildId]) {
      guildLanguages[guildId] = 'en'; // Default to English
    }
    const lang = languages[guildLanguages[guildId]];
  
    if (!message.content.startsWith(prefix)) return;
  
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
  
    switch (command) {
      case 'status':
        await handleStatus(message, args, lang);
        break;
      case 'addserver':
        await handleAddServer(message, args, lang);
        break;
      case 'players':
        await handlePlayers(message, args, lang);
        break;
      case 'multistatus':
        await handleMultiStatus(message, args, lang);
        break;
      case 'serverinfo':
        await handleServerInfo(message, args, lang);
        break;
      case 'help':
        await handleHelp(message, lang);
        break;
      case 'setlang':
        await handleSetLang(message, args);
        break;
      case 'setprefix':
        await handleSetPrefix(message, args, lang);
        break;
      case 'graph':
        await handleGraph(message, args, lang);
        break;
    }
  });
  
  async function handleStatus(message, args, lang) {
    if (args.length === 0) {
      return message.reply(lang.provideServerError);
    }
  
    const serverIP = args[0];
    const guildId = message.guild.id;
    const actualIP = serverList[guildId] && serverList[guildId][serverIP] ? serverList[guildId][serverIP] : serverIP;
  
    try {
      const result = await util.status(actualIP);
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`${lang.mcServerStatus} ${serverIP}`)
        .addFields(
          { name: `${lang.online} 🟢`, value: lang.yes, inline: true },
          { name: `${lang.players} 👥`, value: `${result.players.online}/${result.players.max}`, inline: true },
          { name: `${lang.version} 🔢`, value: result.version.name, inline: true },
          { name: `${lang.latency} ⏱️`, value: `${result.roundTripLatency}ms`, inline: true }
        )
        .setTimestamp();
      
      if (result.favicon) {
        embed.setThumbnail(`attachment://favicon.png`);
        const attachment = new AttachmentBuilder(Buffer.from(result.favicon.split(',')[1], 'base64'), { name: 'favicon.png' }); // Updated line
        message.channel.send({ embeds: [embed], files: [attachment] });
      } else {
        message.channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error:', error);
      message.channel.send(`${lang.errorCheckingStatus} ${serverIP}: ${error.message}`);
    }
  }
  
  async function handleAddServer(message, args, lang) {
    if (args.length < 2) {
      return message.reply(lang.addServerUsage);
    }
  
    const nickname = args[0];
    const ip = args[1];
    const guildId = message.guild.id;
  
    if (!serverList[guildId]) {
      serverList[guildId] = {};
    }
  
    serverList[guildId][nickname] = ip;
    await saveServerList();
  
    message.reply(`${lang.serverAdded} ${nickname} (${ip})`);
  }
  
  async function handlePlayers(message, args, lang) {
    if (args.length === 0) {
      return message.reply(lang.provideServerError);
    }
  
    const serverIP = args[0];
    const guildId = message.guild.id;
    const actualIP = serverList[guildId] && serverList[guildId][serverIP] ? serverList[guildId][serverIP] : serverIP;
  
    try {
      const result = await util.status(actualIP);
      if (result.players.sample) {
        const playerList = result.players.sample.map(player => player.name).join(', ');
        message.channel.send(`${lang.onlinePlayers} ${serverIP}: ${playerList}`);
      } else {
        message.channel.send(`${lang.noPlayerInfo} ${serverIP}`);
      }
    } catch (error) {
      console.error('Error:', error);
      message.channel.send(`${lang.errorCheckingPlayers} ${serverIP}: ${error.message}`);
    }
  }
  
  async function handleMultiStatus(message, args, lang) {
    if (args.length === 0) {
      return message.reply(lang.provideServersError);
    }
  
    const guildId = message.guild.id;
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle(lang.multiServerStatus)
      .setTimestamp();
  
    for (const serverIP of args) {
      const actualIP = serverList[guildId] && serverList[guildId][serverIP] ? serverList[guildId][serverIP] : serverIP;
      try {
        const result = await util.status(actualIP);
        embed.addFields({ name: serverIP, value: `${lang.online}: ✅ | ${lang.players}: ${result.players.online}/${result.players.max}` });
      } catch (error) {
        embed.addFields({ name: serverIP, value: `${lang.online}: ❌ | ${lang.error}: ${error.message}` });
      }
    }
  
    message.channel.send({ embeds: [embed] });
  }
  
  async function handleServerInfo(message, args, lang) {
    if (args.length === 0) {
      return message.reply(lang.provideServerError);
    }
  
    const serverIP = args[0];
    const guildId = message.guild.id;
    const actualIP = serverList[guildId] && serverList[guildId][serverIP] ? serverList[guildId][serverIP] : serverIP;
  
    try {
      const result = await util.status(actualIP);
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`${lang.serverInfo} ${serverIP}`)
        .addFields(
          { name: `${lang.motd} 📝`, value: result.motd.clean, inline: false },
          { name: `${lang.version} 🔢`, value: result.version.name, inline: true },
          { name: `${lang.players} 👥`, value: `${result.players.online}/${result.players.max}`, inline: true },
          { name: `${lang.latency} ⏱️`, value: `${result.roundTripLatency}ms`, inline: true }
        )
        .setTimestamp();
  
      if (result.favicon) {
        embed.setThumbnail(`attachment://favicon.png`);
        const attachment = new AttachmentBuilder(Buffer.from(result.favicon.split(',')[1], 'base64'), { name: 'favicon.png' });
        message.channel.send({ embeds: [embed], files: [attachment] });
      } else {
        message.channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error:', error);
      message.channel.send(`${lang.errorCheckingInfo} ${serverIP}: ${error.message}`);
    }
  }
  
  async function handleHelp(message, lang) {
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle(lang.helpTitle)
      .setDescription(lang.helpDescription)
      .addFields(
        { name: `\`${prefix}status <ip>\``, value: lang.statusCommand, inline: false },
        { name: `\`${prefix}addserver <nickname> <ip>\``, value: lang.addServerCommand, inline: false },
        { name: `\`${prefix}players <ip>\``, value: lang.playersCommand, inline: false },
        { name: `\`${prefix}multistatus <ip1> <ip2> ...\``, value: lang.multiStatusCommand, inline: false },
        { name: `\`${prefix}serverinfo <ip>\``, value: lang.serverInfoCommand, inline: false },
        { name: `\`${prefix}help\``, value: lang.helpCommand, inline: false },
        { name: `\`${prefix}setlang <lang>\``, value: lang.setLangCommand, inline: false },
        { name: `\`${prefix}setprefix <prefix>\``, value: lang.setPrefixCommand, inline: false },
        { name: `\`${prefix}graph <nickname> <days>\``, value: lang.graphCommand, inline: false }
      )
      .setTimestamp();
  
    message.channel.send({ embeds: [embed] });
  }
  
  async function handleSetLang(message, args) {
    if (args.length === 0) {
      return message.reply('Please provide a language code.');
    }
  
    const guildId = message.guild.id;
    const langCode = args[0];
  
    if (!languages[langCode]) {
      return message.reply('Invalid language code.');
    }
  
    guildLanguages[guildId] = langCode;
    message.reply(`Language set to ${languages[langCode].languageName}.`);
  }
  
  async function handleSetPrefix(message, args, lang) {
    if (args.length === 0) {
      return message.reply(lang.providePrefixError);
    }
  
    prefix = args[0];
    message.reply(`${lang.prefixSetTo} ${prefix}`);
  }
  
  async function handleGraph(message, args, lang) {
    if (args.length < 2) {
      return message.reply(lang.provideGraphArgsError);
    }
  
    const nickname = args[0];
    const days = parseInt(args[1]);
    const guildId = message.guild.id;
  
    if (!playerData[guildId] || !playerData[guildId][nickname]) {
      return message.reply(lang.noPlayerData);
    }
  
    const data = playerData[guildId][nickname];
    const labels = [];
    const playerCounts = [];
  
    const now = Date.now();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateString = date.toISOString().split('T')[0];
      labels.push(dateString);
      playerCounts.push(data[dateString] || 0);
    }
  
    const width = 800;
    const height = 400;
    const chartCallback = (ChartJS) => {};
  
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, chartCallback });
    const configuration = {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: lang.playersOverTime,
          data: playerCounts,
          fill: false,
          borderColor: 'rgba(75,192,192,1)',
          tension: 0.1
        }]
      }
    };
  
    const image = await chartJSNodeCanvas.renderToBuffer(configuration);
    const attachment = new AttachmentBuilder(image, { name: 'chart.png' });
  
    message.channel.send({ files: [attachment] });
  }
  
  function updatePlayerData(guildId, nickname, onlinePlayers) {
    if (!playerData[guildId]) {
      playerData[guildId] = {};
    }
  
    if (!playerData[guildId][nickname]) {
      playerData[guildId][nickname] = {};
    }
  
    const date = new Date().toISOString().split('T')[0];
    playerData[guildId][nickname][date] = onlinePlayers;
  }
  
  function checkServerStatus(guildId, nickname, isOnline, result) {
    // Implement your logic to check server status and send notifications
  }
  
  client.login('YOUR BOT TOKEN');
