import puppeteer from "puppeteer";

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

// پارس XML
function parseMessagesFromXML(xmlText) {
  const messages = [];
  const regex = /<ConversationMessageDTO>([\s\S]*?)<\/ConversationMessageDTO>/g;
  let match;

  while ((match = regex.exec(xmlText)) !== null) {
    const msgXml = match[1];

    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
      const m = msgXml.match(r);
      return m ? m[1] : "";
    };

    messages.push({
      MessageText: get("MessageText"),
      MessageCreateDateTime: get("MessageCreateDateTime"),
      SenderUserName: get("SenderUserName"),
      IsSendMessage: get("IsSendMessage").toLowerCase() === "true",
    });
  }

  return messages;
}

async function runBot() {
  console.log("🤖 Modabber Attendance Bot\n");
  console.log(`📅 Today: ${getTodayJalali()}\n`);

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 900 },
    args: ["--lang=fa-IR", "--no-sandbox"],
  });

  const page = await browser.newPage();

  try {
    // ============ Login ============
    console.log("🔐 Logging in...");
    await page.goto(
      "https://haftometir.modabberonline.com/Login.aspx?ReturnUrl=%2f",
      { waitUntil: "networkidle2", timeout: 30000 }
    );
    await delay(2000);

    await page.type("#txtUserName", "0201211971", { delay: 80 });
    await page.type("#txtPassword", "132375", { delay: 80 });
    await page.click("#btnLogin");
    await delay(5000);
    console.log("✅ Logged in!\n");

    // ============ Messenger ============
    console.log("📨 Opening Messenger...");
    await page.goto(
      "https://haftometir.modabberonline.com/Modules/Messenger/Messenger.aspx",
      { waitUntil: "networkidle2", timeout: 30000 }
    );
    await delay(4000);

    await page.waitForSelector(
      '[ng-repeat="conversation in vm.conversations.data"]',
      { timeout: 15000 }
    );
    await delay(2000);

    const count = await page.$$eval(
      '[ng-repeat="conversation in vm.conversations.data"]',
      (els) => els.length
    );
    console.log(`✅ Found ${count} groups\n`);

    const results = [];
    const todayJalali = getTodayJalali();

    // ============ Loop through groups ============
    for (let i = 0; i < count; i++) {
      console.log(`\n${"─".repeat(50)}`);
      console.log(`[${i + 1}/${count}]`);

      const convs = await page.$$(
        '[ng-repeat="conversation in vm.conversations.data"]'
      );

      if (!convs[i]) continue;

      const groupName = await convs[i]
        .$eval(".css-l8l8b8", (el) => el.textContent.trim())
        .catch(() => "?");
      console.log(`📝 ${groupName}`);

      // Get API response
      let apiResponse = null;

      const handler = async (response) => {
        if (
          response.url().includes("/api/Messenger/GetMessageByConversationId/")
        ) {
          try {
            apiResponse = await response.text();
          } catch (e) {}
        }
      };

      page.on("response", handler);
      await convs[i].click();
      await delay(3000);
      page.off("response", handler);

      if (!apiResponse) {
        console.log("   ⚠️ No response");
        results.push({ group: groupName, status: "⚠️ Error" });
        continue;
      }

      const messages = parseMessagesFromXML(apiResponse);

      // فیلتر پیام‌های امروز شمسی
      const todayMsgs = messages.filter(
        (m) => gregorianToJalali(m.MessageCreateDateTime) === todayJalali
      );

      console.log(`   📬 Today: ${todayMsgs.length} messages`);

      // آیا امروز کسی "حاضر" زده؟
      const hasAttendance = todayMsgs.some((m) =>
        m.MessageText.includes("حاضر")
      );

      if (!hasAttendance) {
        console.log("   💤 No attendance yet");
        results.push({ group: groupName, status: "💤 No attendance" });
        continue;
      }

      // آیا من امروز پیام دادم؟ (IsSendMessage = true)
      const iSentToday = todayMsgs.some((m) => m.IsSendMessage === true);

      if (iSentToday) {
        console.log("   ✅ Already sent today");
        results.push({ group: groupName, status: "✅ Done" });
        continue;
      }

      // ============ Send! ============
      console.log("   🚀 Sending...");

      const textarea = await page.$("#message-text");
      if (!textarea) {
        console.log("   ⚠️ Can't send");
        results.push({ group: groupName, status: "⚠️ Can't send" });
        continue;
      }

      await textarea.click();
      await delay(200);
      await textarea.type("سلام، حاضر", { delay: 40 });
      await delay(500);

      const sendBtn = await page.$('img[data-testid="send-button"]');
      if (sendBtn) {
        await sendBtn.click();
        console.log("   ✅ SENT!");
        results.push({ group: groupName, status: "✅ SENT!" });
      } else {
        console.log("   ⚠️ No send button");
        results.push({ group: groupName, status: "⚠️ No button" });
      }

      await delay(2000);
    }

    // ============ Summary ============
    console.log("\n" + "═".repeat(50));
    console.log("📊 SUMMARY");
    console.log("═".repeat(50));

    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.status.padEnd(20)} ${r.group}`);
    });

    const sent = results.filter((r) => r.status.includes("SENT")).length;
    console.log(`\n🎯 Sent: ${sent} groups`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    await page.screenshot({ path: "error.png" });
  }
}

runBot();
