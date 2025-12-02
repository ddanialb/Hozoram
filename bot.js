import axios from "axios";
import * as cheerio from "cheerio";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import express from "express";

const jar = new CookieJar();
const client = wrapper(
  axios.create({
    jar,
    withCredentials: true,
  })
);

const BASE_URL = "https://haftometir.modabberonline.com";
const PORT = process.env.PORT || 3000;

// لیست گروه‌ها
const GROUP_IDS = [
  12482, 12339, 10331, 11566, 11811, 11852, 11974, 11970, 11792, 11459, 11336,
  11319, 10364, 10900, 9158, 10346,
];

const sentToday = new Set();
let lastDate = "";
let stats = {
  startTime: new Date(),
  loopCount: 0,
  messagesSent: 0,
  lastCheck: null,
};

// ═══════════════════════════════════════════════════════════
// Express Server
// ═══════════════════════════════════════════════════════════

const app = express();

app.get("/", (req, res) => {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000 / 60);
  res.send(`
    <html dir="rtl">
    <head><title>Modabber Bot</title></head>
    <body style="font-family: Tahoma; padding: 20px;">
      <h1>🤖 Begoo Agha Dani On Top Pesar</h1>
      <hr>
      <p>✅ Status: <strong>Running</strong></p>
      <p>⏱️ Uptime: <strong>${uptime} minutes</strong></p>
      <p>🔄 Loops: <strong>${stats.loopCount}</strong></p>
      <p>📤 Messages Sent: <strong>${stats.messagesSent}</strong></p>
      <p>🕐 Last Check: <strong>${stats.lastCheck || "Not yet"}</strong></p>
      <p>📋 Groups: <strong>${GROUP_IDS.length}</strong></p>
      <p>📅 Today Sent: <strong>${sentToday.size}</strong></p>
    </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.send("OK");
});

app.get("/ping", (req, res) => {
  res.send("pong");
});

// ═══════════════════════════════════════════════════════════
// Self-Ping (Keep Alive)
// ═══════════════════════════════════════════════════════════

function startSelfPing() {
  const APP_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

  setInterval(async () => {
    try {
      await axios.get(`${APP_URL}/ping`);
      console.log("🏓 Self-ping OK");
    } catch (e) {
      console.log("🏓 Self-ping failed (normal on startup)");
    }
  }, 60000); // هر 1 دقیقه
}

// ═══════════════════════════════════════════════════════════
// Bot Functions
// ═══════════════════════════════════════════════════════════

function gregorianToJalali(gDate) {
  const date = new Date(gDate);
  let gy = date.getFullYear();
  let gm = date.getMonth() + 1;
  const gd = date.getDate();

  let jy;
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

  if (gy > 1600) {
    jy = 979;
    gy -= 1600;
  } else {
    jy = 0;
    gy -= 621;
  }

  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];

  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  let jm, jd;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }

  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

function getTodayJalali() {
  return gregorianToJalali(new Date());
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login() {
  console.log("🔐 Logging in...");

  const loginPageUrl = `${BASE_URL}/Login.aspx?ReturnUrl=%2f&AspxAutoDetectCookieSupport=1`;

  const loginPageResponse = await client.get(loginPageUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  const $ = cheerio.load(loginPageResponse.data);
  const formData = new URLSearchParams();

  $('input[type="hidden"]').each((i, elem) => {
    const name = $(elem).attr("name");
    const value = $(elem).attr("value");
    if (name && value) formData.append(name, value);
  });

  formData.append("txtUserName", "0201211971");
  formData.append("txtPassword", "132375");
  formData.append("LoginButton", "ورود به سیستم");

  await client.post(loginPageUrl, formData, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    maxRedirects: 5,
    validateStatus: () => true,
  });

  console.log("✅ Logged in!\n");
}

async function getMessages(conversationId) {
  try {
    const response = await client.get(
      `${BASE_URL}/api/Messenger/GetMessageByConversationId/${conversationId}/0/30/0`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
      }
    );

    if (response.data?.ConversationMessageDTO) {
      return response.data.ConversationMessageDTO;
    }
    return [];
  } catch (error) {
    console.log(`   ❌ Error getting messages: ${error.message}`);
    return [];
  }
}

async function sendMessage(conversationId, messageText) {
  try {
    const response = await client.post(
      `${BASE_URL}/api/Messenger/StartConversationAndSendAllMessage/${conversationId}/0/2/0/0/0/0`,
      JSON.stringify(messageText),
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    return response.status === 200;
  } catch (error) {
    console.log(`   ❌ Error sending: ${error.message}`);
    return false;
  }
}

async function processGroup(groupId, todayJalali) {
  const groupKey = `${todayJalali}_${groupId}`;

  if (sentToday.has(groupKey)) {
    console.log(`   ⏭️ Already sent (cached)`);
    return;
  }

  const messages = await getMessages(groupId);

  if (messages.length === 0) {
    console.log(`   ⏭️ No messages`);
    return;
  }

  const todayMsgs = messages.filter((m) => {
    try {
      return gregorianToJalali(m.MessageCreateDateTime) === todayJalali;
    } catch {
      return false;
    }
  });

  if (todayMsgs.length === 0) {
    console.log(`   ⏭️ No messages today`);
    return;
  }

  const hasHazer = todayMsgs.some((m) => m.MessageText?.includes("سلام"));
  if (!hasHazer) {
    console.log(`   ⏭️ No "سلام" today`);
    return;
  }

  const iSentToday = todayMsgs.some((m) => m.IsSendMessage === true);
  if (iSentToday) {
    console.log(`   ⏭️ I already sent`);
    sentToday.add(groupKey);
    return;
  }

  console.log(`   🎯 Sending "سلام، حاضر"...`);
  const sent = await sendMessage(groupId, "سلام، حاضر");

  if (sent) {
    console.log(`   ✅ SENT!`);
    sentToday.add(groupKey);
    stats.messagesSent++;
  } else {
    console.log(`   ❌ Failed`);
  }
}

function checkNewDay() {
  const today = getTodayJalali();
  if (lastDate !== today) {
    console.log(`\n🌅 New day: ${today}`);
    sentToday.clear();
    lastDate = today;
  }
  return today;
}

async function mainLoop() {
  console.log("🤖 Modabber Attendance Bot\n");
  console.log(`📋 Groups: ${GROUP_IDS.length}\n`);

  await login();

  while (true) {
    stats.loopCount++;
    const todayJalali = checkNewDay();
    stats.lastCheck = new Date().toLocaleString("fa-IR");

    console.log("═".repeat(50));
    console.log(
      `🔄 Loop #${
        stats.loopCount
      } | ${todayJalali} | ${new Date().toLocaleTimeString("fa-IR")}`
    );
    console.log("═".repeat(50));

    try {
      for (let i = 0; i < GROUP_IDS.length; i++) {
        const groupId = GROUP_IDS[i];
        console.log(`\n[${i + 1}/${GROUP_IDS.length}] Group ${groupId}`);
        await processGroup(groupId, todayJalali);
        await delay(500);
      }

      console.log("\n✅ All groups checked!");
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      console.log("🔄 Re-logging in...");
      await login();
    }

    console.log("\n⏳ Waiting 2 minutes...");
    await delay(120000);
  }
}

// ═══════════════════════════════════════════════════════════
// Start Everything
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}\n`);

  // شروع self-ping
  startSelfPing();

  // شروع بات
  mainLoop().catch(console.error);
});
