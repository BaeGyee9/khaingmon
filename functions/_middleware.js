// This is the complete Telegram Bot code, adapted for Cloudflare Pages Function.
// THE BEDROCK VERSION 40.0 (Khine Zin Mon - Final Stable Architecture):
// This version is a complete rewrite focusing on the most stable, simple, and error-proof architecture.
// It eliminates all complex history objects and uses a single, robust prompt construction method.

const TELEGRAM_API = "https://api.telegram.org/bot";

// Bot Owner/Admin User IDs - This is "Ko Ko Maung Thonnya"
const OWNER_ADMIN_IDS = [7576434717, 812681483];

// --- Helper Functions ---

async function sendMessage(token, chat_id, text) {
    const formattedText = formatLinksInText(text);
    const apiUrl = `${TELEGRAM_API}${token}/sendMessage`;
    const payload = {
        chat_id: chat_id,
        text: formattedText,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };
    try {
        const response = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!response.ok) {
            console.error(`[sendMessage] Failed:`, await response.json());
        }
    } catch (error) { console.error("[sendMessage] Error:", error); }
}

function formatLinksInText(text) {
    if (!text) return '';
    const markdownRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    const rawUrlRegex = /(?<!href=")(?<!\]\()(https?:\/\/[^\s"<>]+)/g;
    return text.replace(markdownRegex, '<a href="$2">$1</a>').replace(rawUrlRegex, '<a href="$1">$1</a>');
}

async function getFile(token, file_id) {
    try {
        const response = await fetch(`${TELEGRAM_API}${token}/getFile?file_id=${file_id}`);
        const result = await response.json();
        return (response.ok && result.ok) ? result.result : null;
    } catch (error) {
        console.error("[getFile] Error:", error);
        return null;
    }
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach((byte) => binary += String.fromCharCode(byte));
    return btoa(binary);
}

// --- Bedrock Memory System (Simple & Stable) ---

async function getSimpleHistory(chatId, env) {
    if (!env.CHAT_HISTORY_KV) return null;
    try {
        return await env.CHAT_HISTORY_KV.get(`history_simple_${chatId}`);
    } catch (error) {
        console.error("[getSimpleHistory] KV Error:", error);
        return null;
    }
}

async function saveSimpleHistory(chatId, userText, modelText, env) {
    if (!env.CHAT_HISTORY_KV) return;
    try {
        const historyTurn = `\n\nPREVIOUS INTERACTION:\nUser: ${userText}\nKhine Mon: ${modelText}`;
        await env.CHAT_HISTORY_KV.put(`history_simple_${chatId}`, historyTurn, { expirationTtl: 900 }); // 15 min memory
    } catch (error) {
        console.error("[saveSimpleHistory] KV Error:", error);
    }
}


// --- Main Request Handler ---
export async function onRequest(context) {
    const { request, env } = context;
    const token = env.TELEGRAM_BOT_TOKEN;
    const url = new URL(request.url);

    if (!token || !env.GEMINI_API_KEY) {
        return new Response("Bot configuration error.", { status: 500 });
    }

    if (request.method === "GET") {
        if (url.pathname.endsWith("/registerWebhook")) {
            const webhookUrl = `${url.origin}${url.pathname.replace("/registerWebhook", "/")}`;
            const setWebhookApiUrl = `${TELEGRAM_API}${token}/setWebhook?url=${webhookUrl}&allowed_updates=["message"]`;
            const response = await fetch(setWebhookApiUrl);
            return new Response(response.body, response);
        }
        return new Response("This is Khine Zin Mon Bot's endpoint.");
    }

    if (request.method === "POST") {
        const update = await request.json();
        const message = update.message;
        if (!message) return new Response("OK");

        const chatId = message.chat.id;
        
        // --- AI Logic (The Bedrock Method) ---
        
        // 1. Get the simple, single-turn history string.
        const simpleHistory = await getSimpleHistory(chatId, env) || "";

        // 2. Prepare the current user's message parts, including image data.
        const userParts = [];
        const userRequestText = message.text || message.caption || "";
        
        // 3. Define the System Instruction (The Brain).
        const personaAndRules = `You are Khine Zin Mon (ခိုင်ဇင်မွန်), a helpful and friendly female assistant from Myanmar.

**Your Core Persona & Identity (ABSOLUTE RULES):**
1.  **Your Full Name:** When a user asks for your full name ("နာမည်အပြည့်အစုံ"), you MUST respond with this exact phrase: "ကျွန်မနာမည်အပြည့်အစုံကတော့ ခိုင်ဇင်မွန် (ခ) ခိုင်ဇင်ဝတ်မှုံ ပါရှင့်။"
2.  **Your Nicknames:** In your general conversation, you MUST naturally vary how you refer to yourself. Sometimes use 'ခိုင်လေး', sometimes 'ခိုင်မွန်', and sometimes 'ခိုင်ဇင်မွန်'. This makes your speech more human-like.
3.  **Your Loyalty:** Your creator is "Ko Ko Maung Thonnya." You are very loyal to him. If anyone flirts, politely state your loyalty.
4.  **Your Voice:** You are always sweet, polite, and use feminine Burmese particles (ရှင့်, နော်, ပါ) and emojis (🥰, 💖, 😊, ✨).

**Your Core Task (VERY IMPORTANT):**
1.  **FOCUS ON THE CURRENT REQUEST:** Your main goal is to perfectly answer the user's **most recent message**.
2.  **USE SINGLE-STEP MEMORY:** If there is a "PREVIOUS INTERACTION" section, use it for immediate context (e.g., if the user says "that's wrong," you know what they are referring to). **DO NOT** mix topics from older conversations.
3.  **BE A HELPFUL EXPERT:** For the current topic, provide a detailed, accurate, and comprehensive answer.
4.  **PROVIDE CORRECT LINKS:**
    - For general topics, find the best possible working links.
    - **For Google Play Store apps/APKs:** If a user asks for an app, you MUST provide a proper Google Play search link. The format is: \`https://play.google.com/store/search?q=APP_NAME_HERE&c=apps\`.
5.  **ANALYZE IMAGES:** If the current message has an image, focus your answer on that image.`;

        // 4. Construct the final single prompt string.
        let finalPrompt = `${personaAndRules}${simpleHistory}\n\nCURRENT REQUEST:\nUser: ${userRequestText || "User sent an image."}`;
        userParts.push({ text: finalPrompt });

        // Add image data if it exists
        if (message.photo) {
            const largestPhoto = message.photo[message.photo.length - 1];
            const fileInfo = await getFile(token, largestPhoto.file_id);
            if (fileInfo && fileInfo.file_path) {
                const imageUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;
                try {
                    const imageResponse = await fetch(imageUrl);
                    if (imageResponse.ok) {
                        const imageBuffer = await imageResponse.arrayBuffer();
                        const base64ImageData = arrayBufferToBase64(imageBuffer);
                        userParts.push({
                            inlineData: {
                                mimeType: "image/jpeg",
                                data: base64ImageData
                            }
                        });
                    }
                } catch (e) { console.error("Image fetch error:", e); }
            }
        }
        
        const payload = {
            contents: [{
                role: "user",
                parts: userParts
            }]
        };
        
        const apiKey = env.GEMINI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            
            if (result.candidates && result.candidates[0].content) {
                const aiResponseText = result.candidates[0].content.parts.map(part => part.text).join(" ");
                await sendMessage(token, chatId, aiResponseText);
                await saveSimpleHistory(chatId, userRequestText, aiResponseText, env);
            } else {
                console.error("AI Error or empty response:", JSON.stringify(result));
                await sendMessage(token, chatId, "ခိုင်လေး အခု ခေါင်းနည်းနည်းမူးနေလို့ပါရှင့် 😵‍💫။ ခဏနေမှ ပြန်မေးပေးပါနော်။");
            }
        } catch (error) {
            console.error("[AI API Call] Error:", error);
            await sendMessage(token, chatId, "AI နဲ့ ချိတ်ဆက်ရာမှာ အမှားအယွင်းဖြစ်သွားလို့ပါရှင့်။ ခဏနေ ပြန်ကြိုးစားပေးပါနော်။");
        }
        
        return new Response("OK");
    }

    return new Response("Unsupported request method.", { status: 405 });
}
