// Orbit Content Script — injected into LinkedIn pages

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-1.5-flash-latest"
];

// ── State ─────────────────────────────────────────────────────────────────────
let sidebarEl = null;
let currentProfile = null;
let contacts = [];
let activeView = "profile";
let isGenerating = false;
let sidebarVisible = true;

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  loadContacts();
  watchNavigation();
  tryInject();
}

function watchNavigation() {
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      sidebarVisible = true;
      setTimeout(tryInject, 1200);
    }
  }).observe(document.body, { subtree: true, childList: true });
}

function tryInject() {
  if (isProfilePage()) {
    currentProfile = scrapeProfile();
    if (!sidebarEl) injectSidebar();
    else renderSidebar();
  }
}

function isProfilePage() {
  return /linkedin\.com\/in\/[^/]+/.test(location.href);
}

// ── Scrape profile from LinkedIn DOM ─────────────────────────────────────────
function scrapeProfile() {
  const getText = (sel) => document.querySelector(sel)?.innerText?.trim() || "";
  const profileUrl = location.href.split("?")[0];
  const linkedinHandle = profileUrl.split("/in/")[1]?.replace(/\/$/, "") || "";
  const name = getProfileName(getText, linkedinHandle);
  const title = getText(".text-body-medium.break-words") || getText("[data-field='headline']");
  const company = getText(".inline-show-more-text--is-collapsed") || "";
  const avatar = document.querySelector(".profile-photo-edit__preview, .pv-top-card-profile-picture__image")?.src || "";
  return { name, title, company, profileUrl, avatar, linkedinHandle };
}

function getProfileName(getText, linkedinHandle) {
  const selectors = [
    "h1.text-heading-xlarge",
    ".pv-text-details__left-panel h1",
    "h1",
    ".text-heading-xlarge"
  ];
  for (const sel of selectors) {
    const text = getText(sel);
    if (text) return text;
  }
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content?.trim() || "";
  if (ogTitle) {
    const cleaned = ogTitle.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();
    if (cleaned) return cleaned;
  }
  return formatHandleAsName(linkedinHandle) || "LinkedIn User";
}

function formatHandleAsName(handle = "") {
  if (!handle) return "";
  const core = handle.replace(/[-_]+/g, " ").replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  if (!core) return "";
  return core.split(" ").map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");
}

// ── Storage ───────────────────────────────────────────────────────────────────
function loadContacts() {
  chrome.storage.local.get(["orbit_contacts"], (res) => {
    contacts = res.orbit_contacts || getDemoContacts();
    if (sidebarEl) renderSidebar();
  });
}

function saveContacts() {
  chrome.storage.local.set({ orbit_contacts: contacts });
}

function getDemoContacts() {
  return [
    { id: 1, name: "Sarah Chen", title: "ML Engineer", company: "DeepMind", linkedinHandle: "sarahchen-ml", profileUrl: "https://linkedin.com/in/sarahchen-ml", notes: "Met at NeurIPS. Interpretability research. Wants to collaborate.", date: new Date(Date.now() - 2 * 86400000).toISOString(), followUp: "Hey Sarah! Great connecting at NeurIPS — would love to continue our chat about interpretability. Free for a call next week?", avatar: "" },
    { id: 2, name: "Marcus Reyes", title: "Product Lead", company: "Stripe", linkedinHandle: "marcusreyes", profileUrl: "https://linkedin.com/in/marcusreyes", notes: "API design philosophy. He's hiring senior PMs.", date: new Date(Date.now() - 14 * 86400000).toISOString(), followUp: null, avatar: "" },
    { id: 3, name: "Priya Nair", title: "Founder & CEO", company: "Luminate AI", linkedinHandle: "priyanair", profileUrl: "https://linkedin.com/in/priyanair", notes: "AI for climate modeling. Looking for engineering co-founder.", date: new Date(Date.now() - 48 * 86400000).toISOString(), followUp: null, avatar: "" },
  ];
}

function findContact(handle) {
  return contacts.find(c => c.linkedinHandle && handle && c.linkedinHandle.toLowerCase() === handle.toLowerCase());
}

function daysSince(d) { return d ? Math.floor((Date.now() - new Date(d)) / 86400000) : 999; }
function heat(days) { return days <= 7 ? "hot" : days <= 30 ? "warm" : "cold"; }
function initials(name = "") { return name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?"; }

// ── Gemini API ────────────────────────────────────────────────────────────────
async function generateMessage(contact, type = "followup") {
  if (isGenerating) return "";
  isGenerating = true;

  try {
    const days = daysSince(contact.date);
    const prompt = type === "followup"
      ? `Write a warm, professional LinkedIn follow-up message to ${contact.name || "this person"}${contact.title ? `, ${contact.title}` : ""}${contact.company ? ` at ${contact.company}` : ""}. My notes from our conversation: "${contact.notes || "Just connected"}". Write 3-4 sentences, reference something specific from the notes, and suggest a concrete next step. Sound human and genuine, not templated. Return only the message text.`
      : `Write a warm LinkedIn re-engagement message to ${contact.name || "this person"}${contact.company ? ` at ${contact.company}` : ""}. We last connected ${days} days ago. My notes: "${contact.notes || "No notes"}". Write 3-4 sentences that naturally reconnect, reference our original conversation, and suggest catching up. Return only the message text.`;

    const GEMINI_KEY = "AIzaSyCaifxaKIgxem4MM4-_B9fioseik64idCg";

    for (const model of GEMINI_MODELS) {
      const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${GEMINI_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      const data = await res.json();

      if (res.ok) {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        if (text) return text;
        throw new Error("Gemini returned empty. Add more notes and try again.");
      }

      const apiError = data?.error?.message || `Request failed (${res.status})`;
      const modelUnavailable = /no longer available|not found|unsupported|not supported/i.test(apiError);
      if (modelUnavailable) continue;

      throw new Error(apiError);
    }

    throw new Error("No supported Gemini model available.");
  } finally {
    isGenerating = false;
  }
}

// ── Sidebar HTML ──────────────────────────────────────────────────────────────
function injectSidebar() {
  sidebarEl = document.createElement("div");
  sidebarEl.id = "orbit-sidebar";
  document.body.appendChild(sidebarEl);
  renderSidebar();
}

function renderSidebar() {
  if (!sidebarEl) return;
  if (!sidebarVisible) {
    sidebarEl.style.display = "none";
    return;
  }
  sidebarEl.style.display = "flex";
  const handle = currentProfile?.linkedinHandle;
  const saved = findContact(handle);
  sidebarEl.innerHTML = buildSidebarHTML(saved);
  attachEvents(saved);
}

function buildSidebarHTML(saved) {
  const p = currentProfile || {};
  const days = saved ? daysSince(saved.date) : null;
  const h = days !== null ? heat(days) : null;
  const isOnList = !!saved;

  return `
    <div class="orb-header">
      <div class="orb-logo">◉ Orbit</div>
      <div class="orb-nav">
        <button class="orb-nav-btn ${activeView === 'profile' ? 'active' : ''}" data-view="profile">Profile</button>
        <button class="orb-nav-btn ${activeView === 'list' ? 'active' : ''}" data-view="list">All Contacts</button>
      </div>
      <button class="orb-close-btn" id="orb-close">✕</button>
    </div>
    ${activeView === 'profile' ? buildProfileView(p, saved, days, h, isOnList) : buildListView()}
  `;
}

function buildProfileView(p, saved, days, h, isOnList) {
  return `
    <div class="orb-body">
      <div class="orb-person-card">
        <div class="orb-avatar">${p.avatar ? `<img src="${p.avatar}" />` : `<span>${initials(p.name)}</span>`}</div>
        <div class="orb-person-info">
          <div class="orb-person-name">${p.name || "LinkedIn User"}</div>
          <div class="orb-person-title">${p.title || ""}</div>
          <div class="orb-person-company">${p.company || ""}</div>
        </div>
      </div>

      ${isOnList ? `
        <div class="orb-status-bar heat-${h}">
          <span class="orb-heat-dot"></span>
          <span>${days === 0 ? "Connected today" : `Last contact ${days} day${days !== 1 ? "s" : ""} ago`}</span>
          ${days > 30 ? `<span class="orb-cold-warning">Going cold!</span>` : ""}
        </div>

        <div class="orb-section-label">Notes</div>
        <textarea class="orb-notes" id="orb-notes" placeholder="Add notes about this person...">${saved.notes || ""}</textarea>
        <button class="orb-btn-ghost orb-save-notes" id="orb-save-notes">Save Notes</button>

        <div class="orb-section-label">Message</div>
        ${saved.followUp ? `
          <div class="orb-message-box" id="orb-message-box">${saved.followUp}</div>
        ` : `
          <div class="orb-message-placeholder" id="orb-message-box">No message yet — generate one below.</div>
        `}
        <div class="orb-btn-row">
          <button class="orb-btn-ai" id="orb-gen-msg">${days > 30 ? "✦ Re-engage" : "✦ Generate"}</button>
          <button class="orb-btn-linkedin" id="orb-send-linkedin" ${!saved.followUp ? "disabled" : ""}>Copy & Open LinkedIn ↗</button>
        </div>
        <div class="orb-loading" id="orb-loading" style="display:none"></div>
        <button class="orb-btn-remove" id="orb-remove">Remove from Orbit</button>
      ` : `
        <div class="orb-not-saved">
          <div class="orb-not-saved-icon">◈</div>
          <div class="orb-not-saved-text">Not in your Orbit yet</div>
          <div class="orb-not-saved-sub">Add this person to track your relationship and get AI-powered follow-ups.</div>
        </div>
        <textarea class="orb-notes" id="orb-notes" placeholder="Add a note from your conversation..."></textarea>
        <button class="orb-btn-primary" id="orb-add-contact">+ Add to Orbit</button>
      `}
    </div>
  `;
}

function buildListView() {
  const sorted = [...contacts].sort((a, b) => daysSince(a.date) - daysSince(b.date));
  if (sorted.length === 0) {
    return `<div class="orb-body"><div class="orb-not-saved" style="margin-top:32px"><div class="orb-not-saved-icon">◈</div><div class="orb-not-saved-text">No contacts yet</div><div class="orb-not-saved-sub">Visit a LinkedIn profile and add them to Orbit.</div></div></div>`;
  }
  return `
    <div class="orb-body orb-list-body">
      <div class="orb-legend">
        <span><span style="color:#6affd4">●</span> ≤7d</span>
        <span><span style="color:#ffd96a">●</span> ≤30d</span>
        <span><span style="color:#ff6a9b">●</span> Cold</span>
      </div>
      ${sorted.map(c => {
        const d = daysSince(c.date); const h = heat(d);
        return `
          <a class="orb-contact-row" href="${c.profileUrl}" target="_blank">
            <div class="orb-row-avatar heat-border-${h}">${initials(c.name)}</div>
            <div class="orb-row-info">
              <div class="orb-row-name">${c.name}</div>
              <div class="orb-row-meta">${c.title || ""}${c.company ? ` · ${c.company}` : ""}</div>
            </div>
            <div class="orb-row-days heat-${h}">${d}d</div>
          </a>
        `;
      }).join("")}
    </div>
  `;
}

// ── Events ────────────────────────────────────────────────────────────────────
function attachEvents(saved) {
  // Close button
  const closeBtn = sidebarEl.querySelector("#orb-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      sidebarVisible = false;
      sidebarEl.style.display = "none";
    });
  }

  sidebarEl.querySelectorAll(".orb-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activeView = btn.dataset.view;
      renderSidebar();
    });
  });

  const addBtn = sidebarEl.querySelector("#orb-add-contact");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const notes = sidebarEl.querySelector("#orb-notes")?.value || "";
      const newContact = {
        id: Date.now(),
        ...currentProfile,
        notes,
        date: new Date().toISOString(),
        followUp: null,
      };
      contacts.unshift(newContact);
      saveContacts();
      renderSidebar();
    });
  }

  const saveNotesBtn = sidebarEl.querySelector("#orb-save-notes");
  if (saveNotesBtn && saved) {
    saveNotesBtn.addEventListener("click", () => {
      const notes = sidebarEl.querySelector("#orb-notes")?.value || "";
      saved.notes = notes;
      saveContacts();
      saveNotesBtn.textContent = "✓ Saved!";
      setTimeout(() => { saveNotesBtn.textContent = "Save Notes"; }, 1500);
    });
  }

  const genBtn = sidebarEl.querySelector("#orb-gen-msg");
  if (genBtn && saved) {
    genBtn.addEventListener("click", async () => {
      if (isGenerating) return;
      const loading = sidebarEl.querySelector("#orb-loading");
      const msgBox = sidebarEl.querySelector("#orb-message-box");
      const sendBtn = sidebarEl.querySelector("#orb-send-linkedin");
      const notesInput = sidebarEl.querySelector("#orb-notes");
      genBtn.disabled = true;
      genBtn.textContent = "⟳ Generating...";
      if (loading) loading.style.display = "block";
      try {
        if (notesInput) saved.notes = notesInput.value || "";
        const type = daysSince(saved.date) > 30 ? "reengage" : "followup";
        const msg = await generateMessage(saved, type);
        if (msg) {
          saved.followUp = msg.trim();
          saveContacts();
          if (msgBox) { msgBox.textContent = msg.trim(); msgBox.className = "orb-message-box"; }
          if (sendBtn) sendBtn.disabled = false;
        }
      } catch (e) {
        if (msgBox) {
          msgBox.textContent = `Error: ${e?.message || "Unknown error"}`;
          msgBox.className = "orb-message-placeholder";
        }
      }
      genBtn.disabled = false;
      genBtn.textContent = "↺ Regenerate";
      if (loading) loading.style.display = "none";
    });
  }

  const sendBtn = sidebarEl.querySelector("#orb-send-linkedin");
  if (sendBtn && saved) {
    sendBtn.addEventListener("click", () => {
      if (!saved.followUp) return;
      navigator.clipboard.writeText(saved.followUp).then(() => {
        const msgUrl = `https://www.linkedin.com/messaging/compose/?recipient=${saved.linkedinHandle}`;
        window.open(msgUrl, "_blank");
        sendBtn.textContent = "✓ Copied & Opened!";
        setTimeout(() => { sendBtn.textContent = "Copy & Open LinkedIn ↗"; }, 2000);
      });
    });
  }

  const removeBtn = sidebarEl.querySelector("#orb-remove");
  if (removeBtn && saved) {
    removeBtn.addEventListener("click", () => {
      contacts = contacts.filter(c => c.id !== saved.id);
      saveContacts();
      renderSidebar();
    });
  }
}

// ── Go ────────────────────────────────────────────────────────────────────────
init();

