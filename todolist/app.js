const STORAGE_KEY = "todolist-items";
const SORT_KEY = "todolist-sort";

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
const sortButton = document.getElementById("sort-button");
const saveStatus = document.getElementById("save-status");
const todoList = document.getElementById("todo-list");
const emptyState = document.getElementById("empty-state");

let editingId = null;
let drag = null;
let ignoreTextClick = false;
let sortMode = loadSortMode();

function loadSortMode() {
  const value = localStorage.getItem(SORT_KEY);
  return value === "az" || value === "chrono" ? value : "";
}

function compareItems(a, b, mode) {
  if (mode === "az") {
    const byText = a.text.localeCompare(b.text, "nb", { sensitivity: "base", numeric: true });
    if (byText !== 0) {
      return byText;
    }
  }
  return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
}

function sortedCopy(items, mode) {
  const open = items.filter((item) => !item.done).sort((a, b) => compareItems(a, b, mode));
  const done = items.filter((item) => item.done).sort((a, b) => compareItems(a, b, mode));
  return [...open, ...done];
}

function updateSortButton() {
  if (sortMode === "az") {
    sortButton.textContent = "A-Z → Chrono";
    sortButton.title = "Sorted A-Z. Switch to chronological";
  } else if (sortMode === "chrono") {
    sortButton.textContent = "Chrono → A-Z";
    sortButton.title = "Sorted chronologically. Switch to A-Z";
  } else {
    sortButton.textContent = "A-Z";
    sortButton.title = "Sort A-Z";
  }
  sortButton.setAttribute("aria-label", sortButton.title);
}

function setSortMode(mode) {
  sortMode = mode === "az" || mode === "chrono" ? mode : "";
  if (sortMode) {
    localStorage.setItem(SORT_KEY, sortMode);
  } else {
    localStorage.removeItem(SORT_KEY);
  }
  updateSortButton();
}

function arranged(items) {
  return sortMode ? sortedCopy(items, sortMode) : items;
}

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

    rowItem.dataset.id = item.id;

    const row = document.createElement("div");
    row.className = "todo-row";

    const handle = document.createElement("span");
    handle.className = "todo-drag";
    handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", `Drag "${item.text}" to reorder`);
    rowItem.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".todo-check, .todo-delete")) {
        return;
      }
      startDrag(event, item.id);
    });

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
    text.addEventListener("click", () => {
      if (ignoreTextClick) {
        ignoreTextClick = false;
        return;
      }
      beginEdit(item.id);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "todo-delete";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${item.text}`);
    remove.addEventListener("click", () => deleteItem(item.id));

    row.append(handle, check, text, remove);
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
  setSortMode("");
  saveItems(items);
  endEdit();
  renderItems(items);
  showSaveStatus(message);
}

function toggleSort() {
  const mode = sortMode === "az" ? "chrono" : "az";
  const items = sortedCopy(withIds(loadItems()), mode);
  setSortMode(mode);
  saveItems(items);
  renderItems(items);
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
  const index = items.findIndex((entry) => entry.id === id);
  if (index < 0) {
    return;
  }
  const [item] = items.splice(index, 1);
  item.done = !item.done;
  if (item.done) {
    items.push(item);
  } else {
    const firstDone = items.findIndex((entry) => entry.done);
    if (firstDone < 0) {
      items.push(item);
    } else {
      items.splice(firstDone, 0, item);
    }
  }
  const next = arranged(items);
  saveItems(next);
  renderItems(next);
}

function placeItem(items, id, toIndex) {
  const from = items.findIndex((entry) => entry.id === id);
  if (from < 0 || toIndex < 0 || toIndex >= items.length || from === toIndex) {
    return false;
  }
  const [item] = items.splice(from, 1);
  items.splice(toIndex, 0, item);
  return true;
}

function syncDom(items) {
  const byId = new Map([...todoList.children].map((el) => [el.dataset.id, el]));
  const nodes = [];
  for (const item of items) {
    const node = byId.get(item.id);
    if (!node) {
      return;
    }
    nodes.push(node);
  }
  todoList.replaceChildren(...nodes);
}

function indexAtPoint(x, y) {
  const els = [...todoList.querySelectorAll(".todo-item")];
  if (els.length === 0) {
    return 0;
  }
  let best = 0;
  let bestDist = Infinity;
  els.forEach((el, index) => {
    const rect = el.getBoundingClientRect();
    const dx = x - (rect.left + rect.width / 2);
    const dy = y - (rect.top + rect.height / 2);
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return best;
}

function startDrag(event, id) {
  if (event.button !== 0 || drag) {
    return;
  }
  drag = {
    pointerId: event.pointerId,
    id,
    items: withIds(loadItems()),
    active: false,
    startX: event.clientX,
    startY: event.clientY,
  };
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is unavailable for some synthetic events.
  }
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (!drag.active) {
    if (dx * dx + dy * dy < 64) {
      return;
    }
    drag.active = true;
    const el = todoList.querySelector(`[data-id="${drag.id}"]`);
    if (el) {
      el.classList.add("is-dragging");
    }
  }
  event.preventDefault();
  const toIndex = indexAtPoint(event.clientX, event.clientY);
  if (placeItem(drag.items, drag.id, toIndex)) {
    syncDom(drag.items);
  }
  const scroller = document.querySelector(".log-scroll");
  const bounds = scroller.getBoundingClientRect();
  if (event.clientY < bounds.top + 28) {
    scroller.scrollTop -= 16;
  } else if (event.clientY > bounds.bottom - 28) {
    scroller.scrollTop += 16;
  }
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  const el = todoList.querySelector(`[data-id="${drag.id}"]`);
  if (el) {
    el.classList.remove("is-dragging");
  }
  if (drag.active) {
    setSortMode("");
    saveItems(drag.items);
    ignoreTextClick = true;
  }
  drag = null;
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
  const next = arranged(items);
  saveItems(next);
  endEdit();
  renderItems(next);
  editor.focus();
}

function addItem() {
  const text = editorText();
  if (!text) {
    editor.focus();
    return;
  }

  const items = withIds(loadItems());
  const next = {
    id: crypto.randomUUID(),
    text,
    done: false,
    createdAt: new Date().toISOString(),
  };
  const firstDone = items.findIndex((entry) => entry.done);
  if (firstDone < 0) {
    items.push(next);
  } else {
    items.splice(firstDone, 0, next);
  }
  const ordered = arranged(items);
  saveItems(ordered);
  endEdit();
  renderItems(ordered);
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
sortButton.addEventListener("click", toggleSort);
updateSortButton();
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

document.addEventListener("pointermove", onPointerMove, { passive: false });
document.addEventListener("pointerup", onPointerUp);
document.addEventListener("pointercancel", onPointerUp);

renderItems(withIds(loadItems()));
