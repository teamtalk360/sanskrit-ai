# Sanskrit AI Workspace

A simple app for keeping your Sanskrit and Telugu chats and source texts. It runs in your web browser and you can install it like a regular app.

## Open the app

Open this link on any phone or computer:

**https://teamtalk360.github.io/sanskrit-ai/**

After you have opened it once, it also works **without internet**.

## Install it like an app

**iPhone or iPad (Safari)**
1. Open the link in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then tap **Add**.
4. The app icon (ॐ) now appears on your Home Screen.

**Android phone (Chrome)**
1. Open the link in **Chrome**.
2. Tap **Install** if the app shows an Install button, or tap the **⋮** menu and choose **Install app** (or **Add to Home screen**).

**Computer (Chrome or Edge)**
1. Open the link.
2. Click the small **install icon** at the right end of the address bar (a screen with a down arrow), or open the browser menu and choose **Install Sanskrit AI Workspace** / **Apps → Install this site as an app**.

## How to use it

- **+ New chat in Sanskrit** starts a new chat. Type a message and tap the **↑** button. Use **←** to go back to the list.
- **Chats** shows all your chats. Use the search box to find one.
- **Sources** is where you can paste verses, passages, or notes and keep them.
- Each AI reply has a **Copy** button. It copies the reply as plain text, so you can paste it into WhatsApp, email, or Word.
- The **⤓** button at the top of a chat saves the whole chat as a **Word document** (.doc). It keeps Telugu and Devanagari text.
- The **⋯** menu has **Settings – Connect AI**, **Download my data (backup)**, **Install app**, and **Reset to sample data**.

## Connect the AI (your own OpenAI key)

The app gets its answers from OpenAI (the company that makes ChatGPT). To use it you need an **OpenAI API key**, a long secret code that starts with `sk-`.

**Important:** this key is **separate from a ChatGPT Plus subscription**. Paying for ChatGPT does not include API use, and you cannot use your ChatGPT login here. API use is **pay-per-use**: you add some credit and each answer costs a small amount, usually a fraction of a US cent to a few cents. You can set a monthly spending limit on the OpenAI website.

### Step 1 – Get a key (one time, about 5 minutes, best done on a computer)
1. Go to **https://platform.openai.com** and **sign in**. You can use the same email as ChatGPT.
2. Open **Settings → Billing**. Add a payment method and buy some credit (for example $5–$10).
3. Open **API keys** (https://platform.openai.com/api-keys) and click **Create new secret key**. Any name is fine, for example "Sanskrit app".
4. Click **Copy**. The key is shown only once, so keep it somewhere safe and do not share it.

### Step 2 – Put the key in the app
1. Open the app and tap **⋯ → Settings – Connect AI**. You can also tap the **Connect AI** button under any reply.
2. **Paste** the key into the **OpenAI API key** box.
3. Leave the **Model** as `gpt-4o`. You can change it later (for example to `gpt-4o-mini`, which is cheaper).
4. Tap **Save**, then tap **Test connection**. You should see **✓ Connected**.
5. Go back and start a chat. Replies now appear word by word.

If the test shows a problem, the message tells you what to do in plain words. For example, "key was not accepted" means the key was copied wrongly, "no credit left" means you need to add billing, and "no internet" means check Wi-Fi.

To remove the key from this device, open Settings and tap **Remove key**.

### What the AI does
It explains Sanskrit verses with **padaccheda** (word split), **IAST** transliteration, word meanings, and the meaning in **Telugu and English**. It answers in the language you write in (Telugu, Sanskrit, or English).

## Please note

- **Your key stays on this device.** It is saved only in this browser. It is not in the app's code, it is not included in the backup file, and it is sent only to OpenAI (api.openai.com). Do not use the app on a shared computer, and do not give your key to anyone.
- **Do not enter patient information.** Messages in a chat are sent to OpenAI to get an answer.
- **Your chats and sources stay on this device only.** Chats on your phone do not show up on your computer. If you clear your browser data or uninstall the app, the chats are deleted, so use **Download my data (backup)** to keep a copy.
- The app opens **without internet**, and you can read your saved chats offline. **AI replies need internet.**
- When Word opens the downloaded file, it may say the file format "does not match". Click **Yes** to open it.
- AI answers can contain mistakes. Check important readings against a trusted text.
- No real API key was used in testing. The AI parts were tested with simulated OpenAI replies.

## Screenshots

See the `demo/` folder. Screenshots marked **TEST DATA** show simulated AI replies used for testing.
