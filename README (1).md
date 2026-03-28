# ◉ Orbit — Chrome Extension

AI-powered relationship intelligence built into LinkedIn.

## Install in Chrome (30 seconds)

1. Open Chrome → go to `chrome://extensions`
2. Toggle **Developer mode** ON (top right)
3. Click **Load unpacked**
4. Select this `orbit-extension` folder
5. Go to any LinkedIn profile — the Orbit sidebar appears on the right

## Features

- **Sidebar on every LinkedIn profile** — see if they're in your Orbit
- **Add contacts** with conversation notes directly from their profile
- **Relationship heat map** — green (active), yellow (warm), red (going cold)
- **AI-generated follow-up messages** powered by Claude
- **Send on LinkedIn** — message is copied to clipboard + LinkedIn messaging opens
- **Full contact list** — all your Orbit contacts in one panel

## Setup

To enable AI message generation, add your Anthropic API key in `content.js`:

```js
// Replace the fetch call headers with:
headers: {
  "Content-Type": "application/json",
  "x-api-key": "YOUR_API_KEY_HERE",
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true"
}
```

Get a free API key at: https://console.anthropic.com

## File Structure

```
orbit-extension/
├── manifest.json     — Extension config
├── content.js        — LinkedIn sidebar logic + AI
├── sidebar.css       — Sidebar styles
├── popup.html        — Toolbar popup
├── popup.js          — Popup stats
└── icons/            — Extension icons
```
