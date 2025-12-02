import axios from "axios";
import * as cheerio from "cheerio";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

const jar = new CookieJar();
const client = wrapper(
  axios.create({
    jar,
    withCredentials: true,
  })
);

const BASE_URL = "https://haftometir.modabberonline.com";

// لیست گروه‌ها (از مرورگر گرفتیم)
const GROUP_IDS = [
  12482, 12339, 10331, 11566, 11811, 11852, 11974, 11970, 11792, 11459, 11336,
  11319, 10364, 10900, 9158, 10346,
];

const sentToday = new Set();
let lastDate = "";

// تبدیل میلادی به شمسی
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

// لاگین
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

// گرفتن پیام‌های گروه
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

// ارسال پیام
async function sendMessage(conversationId, messageText) {
  try {
    const response = await client.post(
      `${BASE_URL}/api/Messenger/SendMessage`,
      {
        ConversationId: conversationId,
        MessageText: messageText,
        MessageType: 0,
        ParentMessageId: 0,
      },
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

// پردازش یک گروه
async function processGroup(groupId, todayJalali) {
  const groupKey = `${todayJalali}_${groupId}`;

  // قبلاً فرستادم؟
  if (sentToday.has(groupKey)) {
    console.log(`   ⏭️ Already sent (cached)`);
    return;
  }

  // گرفتن پیام‌ها
  const messages = await getMessages(groupId);

  if (messages.length === 0) {
    console.log(`   ⏭️ No messages`);
    return;
  }

  // فیلتر پیام‌های امروز
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

  // کسی "حاضر" زده؟
  const hasHazer = todayMsgs.some((m) => m.MessageText?.includes("حاضر"));
  if (!hasHazer) {
    console.log(`   ⏭️ No "حاضر" today`);
    return;
  }

  // من پیام دادم؟
  const iSentToday = todayMsgs.some((m) => m.IsSendMessage === true);
  if (iSentToday) {
    console.log(`   ⏭️ I already sent`);
    sentToday.add(groupKey);
    return;
  }

  // ✅ ارسال!
  console.log(`   🎯 Sending "سلام، حاضر"...`);
  const sent = await sendMessage(groupId, "سلام، حاضر");

  if (sent) {
    console.log(`   ✅ SENT!`);
    sentToday.add(groupKey);
  } else {
    console.log(`   ❌ Failed`);
  }
}

// چک روز جدید
function checkNewDay() {
  const today = getTodayJalali();
  if (lastDate !== today) {
    console.log(`\n🌅 New day: ${today}`);
    sentToday.clear();
    lastDate = today;
  }
  return today;
}

// لوپ اصلی
async function mainLoop() {
  console.log("🤖 Modabber Attendance Bot\n");
  console.log(`📋 Groups: ${GROUP_IDS.length}\n`);

  await login();

  let loopCount = 0;

  while (true) {
    loopCount++;
    const todayJalali = checkNewDay();

    console.log("═".repeat(50));
    console.log(
      `🔄 Loop #${loopCount} | ${todayJalali} | ${new Date().toLocaleTimeString(
        "fa-IR"
      )}`
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

mainLoop().catch(console.error);
