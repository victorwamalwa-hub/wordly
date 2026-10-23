/* ============================================================
   WORDLY — INTERACTIVE DICTIONARY SPA
   Uses Free Dictionary API: https://api.dictionaryapi.dev/
   ============================================================ */

const API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const STORAGE_KEY = "wordly_saved_words";

/* Safe DOM lookups — never crash if an element is missing */
function safeGet(id) {
    const el = document.getElementById(id);
    if (!el) console.warn(`[wordly] element #${id} not found in HTML`);
    return el;
}

const form = safeGet("word-form");
const input = safeGet("word-input");
const statusEl = safeGet("status");
const resultEl = safeGet("result");
const savedSection = safeGet("saved-section");
const savedList = safeGet("saved-list");
const searchBtn = safeGet("search-btn");

/* If core elements are missing, log and stop cleanly instead of crashing */
if (!form || !input || !resultEl || !statusEl) {
    console.error("[wordly] Required DOM elements missing — quiz will not run.");
}

/* ---------- SAVED WORDS ---------- */
function getSavedWords() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveWords(list) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn("Could not save words:", e);
    }
}

function isSaved(word) {
    return getSavedWords().includes(word.toLowerCase());
}

function toggleSaved(word) {
    const w = word.toLowerCase();
    const list = getSavedWords();
    const index = list.indexOf(w);
    if (index === -1) list.push(w);
    else list.splice(index, 1);
    saveWords(list);
    renderSavedWords();
    updateSaveButtons();
}

/* ---------- RENDER SAVED WORDS ---------- */
function renderSavedWords() {
    const words = getSavedWords();
    if (words.length === 0) {
        savedSection.style.display = "none";
        return;
    }
    savedSection.style.display = "block";
    savedList.innerHTML = words
        .map(w => `
            <li data-word="${w}">
                ${w}
                <button type="button" aria-label="Remove ${w}" data-remove="${w}">×</button>
            </li>
        `)
        .join("");

    // Clicking the word searches for it
    savedList.querySelectorAll("li").forEach(li => {
        li.addEventListener("click", (e) => {
            if (e.target.dataset.remove) return; // ignore × button clicks
            input.value = li.dataset.word;
            form.dispatchEvent(new Event("submit"));
        });
    });

    // Clicking × removes the word
    savedList.querySelectorAll("[data-remove]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleSaved(btn.dataset.remove);
        });
    });
}

/* ---------- UPDATE SAVE BUTTONS ---------- */
function updateSaveButtons() {
    document.querySelectorAll(".save-btn").forEach(btn => {
        const word = btn.dataset.word;
        if (isSaved(word)) {
            btn.textContent = "★ Saved";
            btn.classList.add("saved");
        } else {
            btn.textContent = "☆ Save";
            btn.classList.remove("saved");
        }
    });
}

/* ---------- STATUS ---------- */
function setStatus(text, type = "info") {
    statusEl.textContent = text;
    statusEl.className = `status-message ${type}`;
}

function clearStatus() {
    statusEl.textContent = "";
    statusEl.className = "status-message";
}

/* ---------- FETCH FROM DICTIONARY API ---------- */
async function fetchWord(word) {
    const cleanWord = word.trim().toLowerCase();
    if (!cleanWord) {
        setStatus("Please enter a word.", "error");
        return null;
    }

    setStatus("Searching...", "info");
    searchBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}${encodeURIComponent(cleanWord)}`);

        if (response.status === 404) {
            setStatus(`"${cleanWord}" was not found. Try a different spelling.`, "error");
            return null;
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return Array.isArray(data) && data.length > 0 ? data : null;

    } catch (err) {
        setStatus(`Network error: ${err.message}. Check your connection.`, "error");
        return null;
    } finally {
        searchBtn.disabled = false;
    }
}

/* ---------- RENDER RESULT ---------- */
function renderResult(data) {
    resultEl.innerHTML = "";

    if (!data || data.length === 0) return;

    const entry = data[0]; // API returns an array; use first entry
    const word = entry.word;
    const phonetic = entry.phonetic || (entry.phonetics.find(p => p.text)?.text) || "";
    const audioSrc = (entry.phonetics.find(p => p.audio)?.audio) || "";
    const meanings = entry.meanings || [];

    // Header card
    const headerCard = document.createElement("div");
    headerCard.className = "card";
    headerCard.innerHTML = `
        <h2>${escapeHtml(word)}</h2>
        ${phonetic ? `<p class="phonetic">${escapeHtml(phonetic)}</p>` : ""}
        ${audioSrc ? `<button class="audio-btn" id="play-audio">🔊 Play pronunciation</button>` : ""}
        <div>
            <button class="save-btn" data-word="${escapeHtml(word)}" id="save-current">☆ Save</button>
        </div>
    `;
    resultEl.appendChild(headerCard);

    // Meanings
    meanings.forEach((meaning, i) => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
            <span class="part-of-speech">${escapeHtml(meaning.partOfSpeech || "—")}</span>
            ${meaning.definitions.slice(0, 5).map((def, j) => `
                <div class="definition">
                    <p class="definition-text"><strong>${i + 1}.${j + 1}</strong> ${escapeHtml(def.definition || "")}</p>
                    ${def.example ? `<p class="example">"${escapeHtml(def.example)}"</p>` : ""}
                </div>
            `).join("")}
            ${meaning.synonyms && meaning.synonyms.length ? `
                <div class="synonyms">
                    <strong>Synonyms:</strong>
                    ${meaning.synonyms.slice(0, 8).map(s => `<span class="syn-tag">${escapeHtml(s)}</span>`).join("")}
                </div>
            ` : ""}
        `;
        resultEl.appendChild(card);
    });

    // Wire audio button
    const audioBtn = document.getElementById("play-audio");
    if (audioBtn && audioSrc) {
        audioBtn.addEventListener("click", () => {
            new Audio(audioSrc).play().catch(() =>
                setStatus("Could not play audio for this word.", "error")
            );
        });
    }

    // Wire save button
    document.getElementById("save-current")?.addEventListener("click", (e) => {
        toggleSaved(e.target.dataset.word);
    });

    updateSaveButtons();
    setStatus(`Found "${word}".`, "success");
}

/* ---------- UTILS ---------- */
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

/* ---------- FORM SUBMIT ---------- */
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearStatus();
    resultEl.innerHTML = "";

    const word = input.value.trim();
    if (!word) {
        setStatus("Please type a word first.", "error");
        input.focus();
        return;
    }

    const data = await fetchWord(word);
    if (data) {
        renderResult(data);
        input.value = "";
    }
});

/* ---------- THEME TOGGLE ---------- */
function createThemeToggle() {
    const btn = document.createElement("button");
    btn.className = "theme-toggle";
    btn.textContent = "🌙 Dark Mode";
    btn.addEventListener("click", () => {
        const isDark = document.body.classList.toggle("dark-theme");
        btn.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
        localStorage.setItem("wordly_theme", isDark ? "dark" : "light");
    });
    document.body.appendChild(btn);

    // Restore saved theme
    if (localStorage.getItem("wordly_theme") === "dark") {
        document.body.classList.add("dark-theme");
        btn.textContent = "☀️ Light Mode";
    }
}

/* ---------- INIT ---------- */
function initWordly() {
    renderSavedWords();
    createThemeToggle();
}

document.addEventListener("DOMContentLoaded", initWordly);