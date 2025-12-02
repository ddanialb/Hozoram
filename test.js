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

// لاگین
async function login() {
  console.log("🔐 Logging in...");

  const loginPageUrl = `${BASE_URL}/Login.aspx?ReturnUrl=%2f&AspxAutoDetectCookieSupport=1`;

  // گرفتن صفحه لاگین
  const loginPageResponse = await client.get(loginPageUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

  // ارسال لاگین
  await client.post(loginPageUrl, formData, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: loginPageUrl,
    },
    maxRedirects: 5,
    validateStatus: () => true,
  });

  console.log("✅ Logged in!\n");
  return true;
}

// تست API ها
async function debugAPI() {
  console.log("🔍 Testing APIs...\n");

  const endpoints = [
    "/api/Messenger/GetUserConversations",
    "/api/Messenger/GetMessageByConversationId/12482/0/30/0",
  ];

  for (const ep of endpoints) {
    try {
      const response = await client.get(`${BASE_URL}${ep}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json, text/plain, */*",
          Referer: `${BASE_URL}/`,
        },
      });

      console.log(`📡 GET ${ep}`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Type: ${typeof response.data}`);

      if (response.data === null) {
        console.log(`   Data: null`);
      } else if (Array.isArray(response.data)) {
        console.log(`   Array length: ${response.data.length}`);
        if (response.data.length > 0) {
          console.log(
            `   First item:`,
            JSON.stringify(response.data[0], null, 2).substring(0, 500)
          );
        }
      } else if (typeof response.data === "object") {
        console.log(
          `   Object:`,
          JSON.stringify(response.data, null, 2).substring(0, 500)
        );
      } else {
        console.log(`   Data: ${String(response.data).substring(0, 200)}`);
      }
      console.log();
    } catch (error) {
      console.log(`❌ GET ${ep}: ${error.message}\n`);
    }
  }
}

// اجرا
async function main() {
  console.log("🤖 Modabber Bot - Debug Mode\n");

  await login();
  await debugAPI();
}

main().catch(console.error);
