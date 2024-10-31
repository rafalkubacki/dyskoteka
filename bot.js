const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const ytdl = require("ytdl-core-discord");

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const token = process.env.DISCORD_TOKEN;
const queue = new Map(); // Holds the music queue for each guild

bot.once("ready", () => {
  console.log(`Logged in as ${bot.user.tag}`);
});

bot.on("messageCreate", async (message) => {
  if (
    !message.content.startsWith("/playme") ||
    !message.guild ||
    message.author.bot
  )
    return;

  const args = message.content.split(" ");
  const url = args[1];
  if (!ytdl.validateURL(url))
    return message.reply("Please provide a valid YouTube URL.");

  const serverQueue = queue.get(message.guild.id);
  if (serverQueue) {
    serverQueue.songs.push(url);
    return message.reply("Song added to the queue!");
  }

  // Create queue for the server
  const queueContract = {
    textChannel: message.channel,
    voiceChannel: message.member.voice.channel,
    connection: null,
    songs: [url],
    player: createAudioPlayer(),
  };
  queue.set(message.guild.id, queueContract);

  // Try joining the voice channel and playing music
  try {
    queueContract.connection = joinVoiceChannel({
      channelId: queueContract.voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    queueContract.connection.on(VoiceConnectionStatus.Ready, () => {
      console.log("The bot has connected to the channel!");
      playSong(message.guild, queueContract.songs[0]);
    });

    queueContract.connection.on(VoiceConnectionStatus.Disconnected, () => {
      queue.delete(message.guild.id);
    });
  } catch (error) {
    console.error(error);
    queue.delete(message.guild.id);
    return message.reply("There was an error connecting to the voice channel.");
  }
});

async function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.connection.destroy();
    queue.delete(guild.id);
    return;
  }

  const stream = await ytdl(song, {
    filter: "audioonly",
    highWaterMark: 1 << 25,
  });

  const resource = createAudioResource(stream);
  serverQueue.player.play(resource);
  serverQueue.connection.subscribe(serverQueue.player);

  serverQueue.player.on(AudioPlayerStatus.Idle, () => {
    serverQueue.songs.shift(); // Remove the song from the queue
    playSong(guild, serverQueue.songs[0]); // Play the next song in the queue
  });

  serverQueue.textChannel.send(`Now playing: ${song}`);
}

// Stop command to clear the queue
bot.on("messageCreate", async (message) => {
  if (message.content === "/stop") {
    const serverQueue = queue.get(message.guild.id);
    if (serverQueue) {
      serverQueue.songs = [];
      serverQueue.player.stop();
      message.reply("Stopped the music and cleared the queue!");
    } else {
      message.reply("There is no music playing.");
    }
  }
});

// Leave command to disconnect
bot.on("messageCreate", async (message) => {
  if (message.content === "/leave") {
    const serverQueue = queue.get(message.guild.id);
    if (serverQueue) {
      serverQueue.connection.destroy();
      queue.delete(message.guild.id);
      message.reply("Disconnected from the voice channel.");
    } else {
      message.reply("I'm not in a voice channel.");
    }
  }
});

bot.login(token);
