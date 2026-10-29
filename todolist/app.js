const STORAGE_KEY = "todolist-items";

const editor = document.getElementById("editor");
const addButton = document.getElementById("add-button");
const cancelButton = document.getElementById("cancel-button");
const editStatus = document.getElementById("edit-status");
const exportButton = document.getElementById("export-button");
const importButton = document.getElementById("import-button");
const importInput = document.getElementById("import-input");
const clearButton = document.getElementById("clear-button");
const clearWarning = document.getElementById("clear-warning");
const clearCancel = document.getElementById("clear-cancel");
const clearConfirm = document.getElementById("clear-confirm");
const saveStatus = document.getElementById("save-status");
const todoList = document.getElementById("todo-list");
const emptyState = document.getElementById("empty-state");

let editingId = null;

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) => item && typeof item.text === "string");
  } catch {
    return [];
  }
}

function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function withIds(items) {
  let changed = false;
  for (const item of items) {
    if (!item.id) {
      item.id = crypto.randomUUID();
      changed = true;
    }
    if (typeof item.done !== "boolean") {
      item.done = false;
      changed = true;
    }
  }
  if (changed) {
    saveItems(items);
  }
  return items;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function renderItems(items) {
  todoList.replaceChildren();

  for (const item of items) {
    const rowItem = document.createElement("li");
    rowItem.className = "todo-item";
    if (item.done) {
      rowItem.classList.add("is-done");
    }
    if (item.id === editingId) {
      rowItem.classList.add("is-editing");
    }

    const row = document.createElement("div");
    row.className = "todo-row";

    const check = document.createElement("button");
    check.type = "button";
    check.className = "todo-check";
    check.setAttribute("aria-pressed", item.done ? "true" : "false");
    check.setAttribute("aria-label", item.done ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`);
    check.addEventListener("click", () => toggleItem(item.id));

    const text = document.createElement("button");
    text.type = "button";
    text.className = "todo-text";
    text.textContent = item.text;
    text.addEventListener("click", () => beginEdit(item.id));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "todo-delete";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${item.text}`);
    remove.addEventListener("click", () => deleteItem(item.id));

    row.append(check, text, remove);
    rowItem.append(row);
    todoList.append(rowItem);
  }

  emptyState.hidden = items.length > 0;
}

function itemsToText(items) {
  return items.map((item) => `- [${item.done ? "x" : " "}] ${item.text}`).join("\n");
}

function parseListText(text) {
  const items = [];
  const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let done = false;
    let body = trimmed;
    let match = trimmed.match(/^[-*+]\s+\[([ xX])\]\s*(.*)$/);
    if (match) {
      done = match[1].toLowerCase() === "x";
      body = match[2];
    } else if ((match = trimmed.match(/^\[([ xX])\]\s*(.*)$/))) {
      done = match[1].toLowerCase() === "x";
      body = match[2];
    } else if ((match = trimmed.match(/^[-*+]\s+(.*)$/))) {
      body = match[1];
    } else if ((match = trimmed.match(/^\d+[.)]\s+(.*)$/))) {
      body = match[1];
    }

    body = body.trim();
    if (!body) {
      continue;
    }

    items.push({
      id: crypto.randomUUID(),
      text: body,
      done,
      createdAt: new Date().toISOString(),
    });
  }

  return items;
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
  const blob = new Blob([text.endsWith("\n") ? text : `${text}\n`], { type: "text/plain;charset=utf-8" });
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
  return `ToDoList_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}.txt`;
}

function exportList() {
  const items = withIds(loadItems());
  if (items.length === 0) {
    showSaveStatus("Nothing to export yet. Add an item first.");
    return;
  }

  const filename = exportFilename(new Date());
  downloadTextFile(filename, itemsToText(items));
  showSaveStatus(`Downloaded ${filename}. Check Downloads if it doesn't open.`);
}

function replaceList(items, message) {
  saveItems(items);
  endEdit();
  renderItems(items);
  showSaveStatus(message);
}

function applyImportedList(text) {
  const imported = parseListText(text);
  if (imported.length === 0) {
    showSaveStatus("That file has no items to import.");
    return;
  }
  if (loadItems().length > 0 && !window.confirm("Replace the current list with this file?")) {
    return;
  }
  const label = imported.length === 1 ? "item" : "items";
  replaceList(imported, `Imported ${imported.length} ${label}.`);
}

function importListFile(file) {
  const reader = new FileReader();
  reader.onload = () => applyImportedList(String(reader.result || ""));
  reader.readAsText(file);
}

function toggleItem(id) {
  const items = withIds(loadItems());
  const item = items.find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  item.done = !item.done;
  saveItems(items);
  renderItems(items);
}

function deleteItem(id) {
  const items = withIds(loadItems()).filter((item) => item.id !== id);
  if (editingId === id) {
    endEdit();
  }
  saveItems(items);
  renderItems(items);
}

function showClearWarning() {
  if (loadItems().length === 0) {
    showSaveStatus("The list is already empty.");
    return;
  }
  clearWarning.hidden = false;
  clearCancel.focus();
}

function hideClearWarning() {
  clearWarning.hidden = true;
}

function confirmClearList() {
  if (clearWarning.hidden) {
    return;
  }
  hideClearWarning();
  replaceList([], "List cleared.");
}

function setEditing(active) {
  addButton.textContent = active ? "Update" : "Add";
  addButton.title = active ? "Update (Enter)" : "Add (Enter)";
  cancelButton.hidden = !active;
  editStatus.hidden = !active;
  editor.setAttribute("aria-label", active ? "Edit item" : "Add an item");
  editor.placeholder = active ? "Edit item…" : "Add an item…";
}

function beginEdit(id) {
  const item = withIds(loadItems()).find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  editingId = id;
  editor.value = item.text;
  setEditing(true);
  renderItems(withIds(loadItems()));
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);
}

function endEdit() {
  editingId = null;
  editor.value = "";
  setEditing(false);
}

function cancelEdit() {
  endEdit();
  renderItems(withIds(loadItems()));
  editor.focus();
}

function editorText() {
  return editor.value.replace(/\u00a0/g, " ").trim();
}

function updateItem() {
  const text = editorText();
  if (!text) {
    editor.focus();
    return;
  }

  const items = withIds(loadItems());
  const item = items.find((entry) => entry.id === editingId);
  if (!item) {
    endEdit();
    renderItems(items);
    return;
  }

  item.text = text;
  saveItems(items);
  endEdit();
  renderItems(items);
  editor.focus();
}

function addItem() {
  const text = editorText();
  if (!text) {
    editor.focus();
    return;
  }

  const items = withIds(loadItems());
  items.push({
    id: crypto.randomUUID(),
    text,
    done: false,
    createdAt: new Date().toISOString(),
  });
  saveItems(items);
  endEdit();
  renderItems(items);
  editor.focus();
}

function submitItem() {
  if (editingId) {
    updateItem();
    return;
  }
  addItem();
}

addButton.addEventListener("click", submitItem);
cancelButton.addEventListener("click", cancelEdit);
exportButton.addEventListener("click", exportList);
importButton.addEventListener("click", () => importInput.click());
importInput.addEventListener("change", () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (file) {
    importListFile(file);
  }
});
clearButton.addEventListener("click", showClearWarning);
clearCancel.addEventListener("click", hideClearWarning);
clearConfirm.addEventListener("click", confirmClearList);

editor.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitItem();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    submitItem();
  }
  if (event.key === "Escape" && !clearWarning.hidden) {
    event.preventDefault();
    hideClearWarning();
    editor.focus();
    return;
  }
  if (event.key === "Escape" && editingId) {
    event.preventDefault();
    cancelEdit();
  }
});

renderItems(withIds(loadItems()));
