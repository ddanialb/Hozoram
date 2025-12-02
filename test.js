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

// ارسال پیام - دقیقاً مثل مرورگر
async function sendMessage(conversationId, messageText) {
  try {
    // 🔴 نکته مهم: Body باید string باشه با quotes دورش
    // مثل: "." نه { message: "." }

    const response = await client.post(
      `${BASE_URL}/api/Messenger/StartConversationAndSendAllMessage/${conversationId}/0/2/0/0/0/0`,
      JSON.stringify(messageText), // این میشه "."
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    console.log("📤 Status:", response.status);
    console.log("📥 Response:", JSON.stringify(response.data));

    return response.status === 200;
  } catch (error) {
    console.log("❌ Error:", error.message);
    if (error.response) {
      console.log("   Status:", error.response.status);
      console.log("   Data:", error.response.data);
    }
    return false;
  }
}

// تست
async function test() {
  console.log("🧪 Test: Send '.' to group 12339\n");

  await login();

  console.log("📤 Sending message...\n");
  const success = await sendMessage(12339, ".");

  if (success) {
    console.log("\n✅ SUCCESS! Message sent.");
  } else {
    console.log("\n❌ FAILED!");
  }
}

test().catch(console.error);
