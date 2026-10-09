const STORAGE_KEY = "notepad-entries";
const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "BR", "DIV", "P", "SPAN"]);

const editor = document.getElementById("editor");
const logButton = document.getElementById("log-button");
const cancelButton = document.getElementById("cancel-button");
const editStatus = document.getElementById("edit-status");
const saveButton = document.getElementById("save-button");
const chronoButton = document.getElementById("chrono-button");
const importButton = document.getElementById("import-button");
const importInput = document.getElementById("import-input");
const clearButton = document.getElementById("clear-button");
const clearWarning = document.getElementById("clear-warning");
const clearCancel = document.getElementById("clear-cancel");
const clearConfirm = document.getElementById("clear-confirm");
const saveStatus = document.getElementById("save-status");
const entryList = document.getElementById("entry-list");
const emptyState = document.getElementById("empty-state");

let editingId = null;
let pendingDeleteId = null;

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function withIds(entries) {
  let changed = false;
  for (const entry of entries) {
    if (!entry.id) {
      entry.id = crypto.randomUUID();
      changed = true;
    }
  }
  if (changed) {
    saveEntries(entries);
  }
  return entries;
}

function sanitizeHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;

  const walk = (node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!ALLOWED_TAGS.has(child.tagName)) {
          child.replaceWith(...child.childNodes);
          walk(node);
          return;
        }
        for (const attr of Array.from(child.attributes)) {
          child.removeAttribute(attr.name);
        }
        walk(child);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.remove();
      }
    }
  };

  walk(template.content);
  return template.innerHTML;
}

function isEditorEmpty() {
  return editor.value.replace(/\u00a0/g, " ").trim().length === 0;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatTimestamp(iso) {
  const date = iso instanceof Date ? iso : new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function byNewest(entries) {
  return [...entries].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function renderEntries(entries) {
  entryList.replaceChildren();

  for (const entry of byNewest(entries)) {
    const item = document.createElement("li");
    item.className = "entry";
    if (entry.id === editingId) {
      item.classList.add("is-editing");
    }
    if (entry.id === pendingDeleteId) {
      item.classList.add("is-confirming");
    }

    const main = document.createElement("div");
    main.className = "entry-main";
    main.tabIndex = 0;
    main.setAttribute("role", "button");
    main.setAttribute("aria-label", `Edit entry from ${formatTimestamp(entry.createdAt)}`);

    const time = document.createElement("time");
    time.dateTime = entry.createdAt;
    time.textContent = formatTimestamp(entry.createdAt);

    const showDelete = entry.id === editingId || entry.id === pendingDeleteId;
    let actions = null;
    if (showDelete) {
      actions = document.createElement("div");
      actions.className = "entry-actions";

      if (entry.id === pendingDeleteId) {
        const note = document.createElement("p");
        note.className = "entry-confirm-note";
        note.textContent = "Delete this entry?";

        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "save-button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", (event) => {
          event.stopPropagation();
          cancelDelete();
        });

        const confirm = document.createElement("button");
        confirm.type = "button";
        confirm.className = "save-button clear-button";
        confirm.textContent = "Delete";
        confirm.addEventListener("click", (event) => {
          event.stopPropagation();
          confirmDeleteEntry(entry.id);
        });

        actions.append(note, cancel, confirm);
      } else {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "entry-delete";
        remove.textContent = "Delete";
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          askDeleteEntry(entry.id);
        });
        actions.append(remove);
      }
    }

    const body = document.createElement("div");
    body.className = "entry-body";
    body.textContent = htmlToText(entry.html);

    main.append(time, body);
    main.addEventListener("click", () => beginEdit(entry.id));
    main.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        beginEdit(entry.id);
      }
    });
    if (actions) {
      item.append(actions);
    }
    item.append(main);
    entryList.append(item);
  }

  emptyState.hidden = entries.length > 0;
}

function htmlToText(html) {
  const holder = document.createElement("div");
  holder.innerHTML = sanitizeHtml(html);
  return holder.innerText.replace(/\u00a0/g, " ").trim();
}

function entriesToText(entries) {
  return entries
    .map((entry) => `--- ${formatTimestamp(entry.createdAt)} ---\n${htmlToText(entry.html)}`)
    .join("\n\n");
}

function textToHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function entryFromText(createdAt, text) {
  const body = text.trim();
  if (!body) {
    return null;
  }
  return {
    id: crypto.randomUUID(),
    createdAt,
    html: textToHtml(body),
  };
}

function parseMarkedLog(text) {
  const entries = [];
  let createdAt = null;
  let lines = [];

  const push = () => {
    if (!createdAt) {
      return;
    }
    const entry = entryFromText(createdAt, lines.join("\n"));
    if (entry) {
      entries.push(entry);
    }
  };

  for (const line of text.split("\n")) {
    const match = line.match(/^--- (\d{4}-\d{2}-\d{2}) (\d{2})[:.](\d{2}) ---$/);
    if (match) {
      push();
      const date = new Date(`${match[1]}T${match[2]}:${match[3]}:00`);
      createdAt = Number.isNaN(date.getTime()) ? null : date.toISOString();
      lines = [];
      continue;
    }
    if (createdAt) {
      lines.push(line);
    }
  }

  push();
  return entries;
}

function parseLegacyLog(text) {
  const blocks = text.trim().split(/\n\s*\n/);
  const entries = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const created = Date.parse(lines[0].trim());
    if (Number.isNaN(created) || lines.length < 2) {
      return null;
    }
    const entry = entryFromText(new Date(created).toISOString(), lines.slice(1).join("\n"));
    if (!entry) {
      return null;
    }
    entries.push(entry);
  }

  return entries.length > 0 ? entries : null;
}

function parseLogText(text) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/^--- \d{4}-\d{2}-\d{2} \d{2}[:.]\d{2} ---$/m.test(normalized)) {
    return parseMarkedLog(normalized);
  }

  const legacy = parseLegacyLog(normalized);
  if (legacy) {
    return legacy;
  }

  const entry = entryFromText(new Date().toISOString(), normalized);
  return entry ? [entry] : [];
}

let saveStatusTimer = 0;

function showSaveStatus(message) {
  saveStatus.hidden = false;
  saveStatus.textContent = message;
  window.clearTimeout(saveStatusTimer);
  saveStatusTimer = window.setTimeout(() => {
    saveStatus.hidden = true;
    saveStatus.textContent = "";
  }, 5000);
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

function exportFilename(date) {
  return `LogPad_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}.txt`;
}

function macBridge() {
  return window.webkit?.messageHandlers?.logpad ?? null;
}

function exportEntries(entries) {
  if (entries.length === 0) {
    showSaveStatus("Nothing to export yet. Write something and click Log first.");
    return;
  }

  const filename = exportFilename(new Date());
  const text = entriesToText(entries);
  const bridge = macBridge();
  if (bridge) {
    bridge.postMessage({ action: "export", filename, text });
    return;
  }

  downloadTextFile(filename, text);
  showSaveStatus(`Downloaded ${filename}. Check Downloads if it doesn't open.`);
}

function saveAsTextFile() {
  exportEntries(byNewest(loadEntries()));
}

function saveChronological() {
  exportEntries(byNewest(loadEntries()).reverse());
}

function applyImportedLog(text) {
  const imported = parseLogText(String(text || ""));
  if (imported.length === 0) {
    showSaveStatus("That file has no entries to import.");
    return;
  }
  if (loadEntries().length > 0 && !window.confirm("Replace the current log with this file?")) {
    return;
  }
  const label = imported.length === 1 ? "entry" : "entries";
  replaceLog(imported, `Imported ${imported.length} ${label}.`);
}

function replaceLog(entries, message) {
  const ordered = byNewest(entries);
  saveEntries(ordered);
  endEdit();
  renderEntries(ordered);
  showSaveStatus(message);
}

function askDeleteEntry(id) {
  pendingDeleteId = id;
  hideClearWarning();
  renderEntries(withIds(loadEntries()));
}

function cancelDelete() {
  pendingDeleteId = null;
  renderEntries(withIds(loadEntries()));
}

function confirmDeleteEntry(id) {
  const entries = withIds(loadEntries()).filter((entry) => entry.id !== id);
  pendingDeleteId = null;
  if (editingId === id) {
    endEdit();
  }
  saveEntries(entries);
  renderEntries(entries);
  showSaveStatus("Entry deleted.");
}

function showClearWarning() {
  if (loadEntries().length === 0) {
    showSaveStatus("The log is already empty.");
    return;
  }
  clearWarning.hidden = false;
  clearCancel.focus();
}

function hideClearWarning() {
  clearWarning.hidden = true;
}

function confirmClearLog() {
  if (clearWarning.hidden) {
    return;
  }
  hideClearWarning();
  replaceLog([], "Log cleared.");
}

function importLogFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const imported = parseLogText(String(reader.result || ""));
    if (imported.length === 0) {
      showSaveStatus("That file has no entries to import.");
      return;
    }
    if (
      loadEntries().length > 0 &&
      !window.confirm("Replace the current log with this file?")
    ) {
      return;
    }
    const label = imported.length === 1 ? "entry" : "entries";
    replaceLog(imported, `Imported ${imported.length} ${label}.`);
  };
  reader.readAsText(file);
}

function setEditing(active) {
  logButton.textContent = active ? "Update" : "Log";
  cancelButton.hidden = !active;
  editStatus.hidden = !active;
}

function beginEdit(id) {
  const entry = withIds(loadEntries()).find((item) => item.id === id);
  if (!entry) {
    return;
  }

  editingId = id;
  if (pendingDeleteId !== id) {
    pendingDeleteId = null;
  }
  editor.value = htmlToText(entry.html);
  setEditing(true);
  renderEntries(withIds(loadEntries()));
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);
}

function endEdit() {
  editingId = null;
  pendingDeleteId = null;
  editor.value = "";
  setEditing(false);
}

function cancelEdit() {
  endEdit();
  renderEntries(withIds(loadEntries()));
  editor.focus();
}

function updateEntry() {
  if (isEditorEmpty()) {
    editor.focus();
    return;
  }

  const entries = withIds(loadEntries());
  const entry = entries.find((item) => item.id === editingId);
  if (!entry) {
    endEdit();
    renderEntries(entries);
    return;
  }

  entry.html = textToHtml(editor.value);
  saveEntries(entries);
  endEdit();
  renderEntries(entries);
  editor.focus();
}

function logEntry() {
  if (isEditorEmpty()) {
    editor.focus();
    return;
  }

  const html = textToHtml(editor.value);
  const entries = withIds(loadEntries());
  entries.unshift({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    html,
  });
  saveEntries(entries);
  endEdit();
  renderEntries(entries);
  editor.focus();
}

function submitEntry() {
  if (editingId) {
    updateEntry();
    return;
  }
  logEntry();
}

logButton.addEventListener("click", submitEntry);
cancelButton.addEventListener("click", cancelEdit);
saveButton.addEventListener("click", saveAsTextFile);
chronoButton.addEventListener("click", saveChronological);
importButton.addEventListener("click", () => {
  const bridge = macBridge();
  if (bridge) {
    bridge.postMessage({ action: "import" });
    return;
  }
  importInput.click();
});
importInput.addEventListener("change", () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (file) {
    importLogFile(file);
  }
});
clearButton.addEventListener("click", showClearWarning);
clearCancel.addEventListener("click", hideClearWarning);
clearConfirm.addEventListener("click", confirmClearLog);
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    submitEntry();
  }
  if (event.key === "Escape" && !clearWarning.hidden) {
    event.preventDefault();
    hideClearWarning();
    return;
  }
  if (event.key === "Escape" && pendingDeleteId) {
    event.preventDefault();
    cancelDelete();
    return;
  }
  if (event.key === "Escape" && editingId) {
    event.preventDefault();
    cancelEdit();
  }
});
renderEntries(withIds(loadEntries()));
