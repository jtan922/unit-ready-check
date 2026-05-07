const STORAGE_KEY = "preshowOccupancyInspections.v2";
const OLD_STORAGE_KEY = "preshowMoveInInspections.v1";
const API_PATH = "/api/inspection-data";

const SECTIONS = [
  {
    title: "KITCHEN",
    type: "single",
    items: [
      "Dishwasher: inside & outside",
      "Disposal: good working order",
      "Refrigerator: inside & outside",
      "Stove: inside & outside",
      "Range Hood: fan & light work, filter clean",
      "Drip Pans: clean",
      "Light fixtures: all bulbs working",
      "Paint",
      "Cabinets: inside & outside",
      "Countertops",
      "Flooring: clean with no rips or tears",
      "No leaking faucets",
      "Check for leak under sink",
      "Pantry",
      "Window/Blinds"
    ]
  },
  {
    title: "LIVING AREA",
    type: "single",
    items: [
      "Drapes/Blinds/Rods",
      "Flooring",
      "Paint",
      "Closet: shelves & rods",
      "Window screens/locks",
      "Light fixtures: all bulbs working",
      "Door hardware"
    ]
  },
  {
    title: "BEDROOMS",
    type: "matrix",
    columns: ["1", "2", "3", "4"],
    items: [
      "Flooring",
      "Closet: shelves & rods",
      "Window screens/locks",
      "Light fixtures: all bulbs working",
      "Drapes/Blinds/Rods",
      "Paint"
    ]
  },
  {
    title: "BATHROOMS",
    type: "matrix",
    columns: ["1", "2", "3", "4"],
    items: [
      "Tile: clean",
      "Tub: clean",
      "Tub stopper: in place",
      "Toilet: clean & flushes properly",
      "No leaking faucets",
      "Fan: works properly",
      "Light fixtures: all bulbs working",
      "Paint",
      "Flooring: clean with no rips or tears",
      "Caulking: fresh",
      "Vanity: inside & outside",
      "Sink basin",
      "Sink Stopper: in place",
      "Accessories (towel bar, soap dish, etc.)"
    ]
  },
  {
    title: "MISCELLANEOUS",
    type: "single",
    items: [
      "HVAC Filters Changed",
      "Smoke/Carbon Batteries changed",
      "Sprinkler heads free of dust, debris, overspray",
      "Patio/Balcony/Porch",
      "Locks changed & keys fit",
      "Sliding glass door/tracks",
      "Front Door: paint & door #",
      "Utility/Laundry area",
      "Marked Ready in Yardi Voyager"
    ]
  }
];

const DEFAULT_META = {
  unitAddress: "",
  inspectionDate: "",
  moldEvidence: "No",
  moldNotes: "",
  infestationEvidence: "No",
  infestationNotes: "",
  washerSerial: "",
  washerCondition: "",
  dryerSerial: "",
  dryerCondition: "",
  overallNotes: "",
  inspector: "Jason Tan",
  inspectorDate: "",
  propertyManager: "",
  propertyManagerDate: ""
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let app = {
  activeId: "",
  inspections: {}
};

let toastTimer = null;
let cloudSaveTimer = null;
let cloudAvailable = false;
let cloudBusy = false;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function newId() {
  return `unit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function blankInspection() {
  const id = newId();
  return {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    meta: { ...DEFAULT_META, inspectionDate: todayIso(), inspectorDate: todayIso() },
    checks: {}
  };
}

function loadApp() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      app.activeId = parsed.activeId || "";
      app.inspections = normalizeInspections(parsed.inspections || {});
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  if (!Object.keys(app.inspections).length) {
    const inspection = blankInspection();
    app.inspections[inspection.id] = inspection;
    app.activeId = inspection.id;
  }
  if (!app.inspections[app.activeId]) app.activeId = Object.keys(app.inspections)[0];
  persist();
}

function normalizeInspections(inspections) {
  const normalized = {};
  for (const [id, inspection] of Object.entries(inspections)) {
    normalized[id] = {
      id,
      createdAt: inspection.createdAt || new Date().toISOString(),
      updatedAt: inspection.updatedAt || new Date().toISOString(),
      meta: {
        ...DEFAULT_META,
        ...(inspection.meta || {}),
        unitAddress: inspection.meta?.unitAddress || "",
        propertyManager: inspection.meta?.propertyManager || inspection.meta?.manager || ""
      },
      checks: inspection.checks || migrateChecks(inspection.items || {})
    };
  }
  return normalized;
}

function migrateChecks(items) {
  const checks = {};
  for (const [key, value] of Object.entries(items)) {
    if (value?.status === "pass" || value?.status === "acceptable") checks[key] = true;
  }
  return checks;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
    return true;
  } catch {
    showToast("Storage is full. Backup saved sheets, then delete old units.");
    return false;
  }
}

function setCloudStatus(message, level = "") {
  const node = $("#cloudStatus");
  if (!node) return;
  node.textContent = `Cloud: ${message}`;
  node.dataset.level = level;
}

function currentInspection() {
  return app.inspections[app.activeId];
}

function checkId(section, item, column = "") {
  return `${section}::${item}::${column}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function renderSheet() {
  $("#sheetBody").innerHTML = SECTIONS.map((section) => {
    if (section.type === "matrix") return renderMatrixSection(section);
    return renderSingleSection(section);
  }).join("");
}

function renderSingleSection(section) {
  return `
    <section class="pdf-section">
      <h3>${section.title}</h3>
      <table>
        <tbody>
          ${section.items.map((item) => `
            <tr>
              <td>${escapeHtml(item)}</td>
              <td class="check-cell">
                <input type="checkbox" data-check="${checkId(section.title, item)}">
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderMatrixSection(section) {
  return `
    <section class="pdf-section matrix-section">
      <h3>${section.title} <span>${section.columns.join(" ")}</span></h3>
      <table>
        <thead>
          <tr>
            <th></th>
            ${section.columns.map((column) => `<th>${column}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${section.items.map((item) => `
            <tr>
              <td>${escapeHtml(item)}</td>
              ${section.columns.map((column) => `
                <td class="check-cell">
                  <input type="checkbox" data-check="${checkId(section.title, item, column)}">
                </td>
              `).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function applyInspection() {
  const inspection = currentInspection();
  $$("[data-meta]").forEach((field) => {
    const key = field.dataset.meta;
    const value = inspection.meta[key] ?? "";
    if (field.type === "radio") {
      field.checked = field.value === value;
    } else {
      field.value = value;
    }
  });
  $$("[data-check]").forEach((field) => {
    field.checked = Boolean(inspection.checks[field.dataset.check]);
  });
  renderUnitList();
}

function readInspection() {
  const inspection = currentInspection();
  $$("[data-meta]").forEach((field) => {
    const key = field.dataset.meta;
    if (field.type === "radio") {
      if (field.checked) inspection.meta[key] = field.value;
    } else {
      inspection.meta[key] = field.value;
    }
  });
  $$("[data-check]").forEach((field) => {
    inspection.checks[field.dataset.check] = field.checked;
  });
  inspection.updatedAt = new Date().toISOString();
}

function saveCurrent(options = {}) {
  readInspection();
  const saved = persist();
  renderUnitList();
  if (saved && options.notify) showToast("Saved");
  queueCloudSave();
}

async function initCloud() {
  if (location.protocol === "file:") {
    setCloudStatus("local only", "warn");
    return;
  }
  await syncFromCloud({ notify: false });
  setInterval(() => syncFromCloud({ notify: false, quiet: true }), 30000);
}

function queueCloudSave() {
  if (!cloudAvailable || cloudBusy) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => pushToCloud({ notify: false }), 800);
}

async function syncFromCloud(options = {}) {
  if (location.protocol === "file:") {
    setCloudStatus("local only", "warn");
    return false;
  }

  cloudBusy = true;
  setCloudStatus("syncing");
  try {
    const response = await fetch(API_PATH, { cache: "no-store" });
    if (!response.ok) throw new Error(`Cloud read failed: ${response.status}`);
    const remote = await response.json();
    cloudAvailable = true;
    const remoteInspections = normalizeInspections(remote.inspections || {});
    const localWasBlank = isOnlyBlankLocalInspection();
    mergeInspections(remoteInspections);
    if (localWasBlank && Object.keys(remoteInspections).length) {
      const firstRemoteId = Object.keys(remoteInspections)[0];
      app.activeId = firstRemoteId;
    }
    persist();
    applyInspection();

    const localHasNewerData = hasLocalNewerThan(remoteInspections);
    if (localHasNewerData) await pushToCloud({ notify: false, skipMerge: true });

    setCloudStatus("saved", "ok");
    if (options.notify) showToast("Synced");
    return true;
  } catch {
    cloudAvailable = false;
    setCloudStatus("offline/local", "warn");
    if (options.notify && !options.quiet) showToast("Cloud sync is not available from this link.");
    return false;
  } finally {
    cloudBusy = false;
  }
}

async function pushToCloud(options = {}) {
  if (location.protocol === "file:") return false;

  cloudBusy = true;
  setCloudStatus("saving");
  try {
    if (!options.skipMerge) {
      const response = await fetch(API_PATH, { cache: "no-store" });
      if (response.ok) {
        const remote = await response.json();
        mergeInspections(normalizeInspections(remote.inspections || {}));
      }
    }
    const response = await fetch(API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspections: app.inspections })
    });
    if (!response.ok) throw new Error(`Cloud write failed: ${response.status}`);
    cloudAvailable = true;
    setCloudStatus("saved", "ok");
    if (options.notify) showToast("Saved to cloud");
    return true;
  } catch {
    cloudAvailable = false;
    setCloudStatus("offline/local", "warn");
    if (options.notify) showToast("Could not save to cloud. Saved on this device.");
    return false;
  } finally {
    cloudBusy = false;
  }
}

function mergeInspections(incoming) {
  for (const [id, inspection] of Object.entries(incoming)) {
    const local = app.inspections[id];
    if (!local || new Date(inspection.updatedAt || 0) > new Date(local.updatedAt || 0)) {
      app.inspections[id] = inspection;
    }
  }
  if (!app.inspections[app.activeId]) app.activeId = Object.keys(app.inspections)[0] || "";
}

function hasLocalNewerThan(remoteInspections) {
  return Object.entries(app.inspections).some(([id, inspection]) => {
    const remote = remoteInspections[id];
    return !remote || new Date(inspection.updatedAt || 0) > new Date(remote.updatedAt || 0);
  });
}

function isOnlyBlankLocalInspection() {
  const inspections = Object.values(app.inspections);
  if (inspections.length !== 1) return false;
  const [inspection] = inspections;
  const hasChecks = Object.values(inspection.checks || {}).some(Boolean);
  const meta = inspection.meta || {};
  return !hasChecks && !meta.unitAddress && !meta.moldNotes && !meta.infestationNotes && !meta.overallNotes;
}

function renderUnitList() {
  const query = $("#unitSearch").value.trim().toLowerCase();
  const units = Object.values(app.inspections)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .filter((inspection) => (inspection.meta.unitAddress || "Untitled Unit").toLowerCase().includes(query));

  $("#unitTotal").textContent = String(Object.keys(app.inspections).length);
  $("#unitList").innerHTML = units.map((inspection) => {
    const checked = Object.values(inspection.checks || {}).filter(Boolean).length;
    const total = totalChecks();
    return `
      <button class="unit-card ${inspection.id === app.activeId ? "active" : ""}" type="button" data-unit-id="${inspection.id}">
        <strong>${escapeHtml(inspection.meta.unitAddress || "Untitled Unit")}</strong>
        <span>${checked}/${total} checked</span>
        <small>${inspection.updatedAt ? new Date(inspection.updatedAt).toLocaleDateString() : ""}</small>
      </button>
    `;
  }).join("") || `<p class="empty-note">No saved units match that search.</p>`;
}

function totalChecks() {
  return SECTIONS.reduce((sum, section) => {
    if (section.type === "matrix") return sum + (section.items.length * section.columns.length);
    return sum + section.items.length;
  }, 0);
}

function createNewInspection() {
  saveCurrent();
  const inspection = blankInspection();
  app.inspections[inspection.id] = inspection;
  app.activeId = inspection.id;
  persist();
  applyInspection();
  queueCloudSave();
  showToast("New unit started");
}

function switchInspection(id) {
  if (!app.inspections[id] || id === app.activeId) return;
  saveCurrent();
  app.activeId = id;
  persist();
  applyInspection();
}

function deleteCurrentInspection() {
  const label = currentInspection().meta.unitAddress || "this unit";
  if (!confirm(`Delete ${label}?`)) return;
  delete app.inspections[app.activeId];
  if (!Object.keys(app.inspections).length) {
    const inspection = blankInspection();
    app.inspections[inspection.id] = inspection;
  }
  app.activeId = Object.keys(app.inspections)[0];
  persist();
  applyInspection();
  queueCloudSave();
  showToast("Unit deleted");
}

function exportAll() {
  saveCurrent();
  const blob = new Blob([JSON.stringify({
    app: "Pre-Show/Occupancy Inspection",
    exportedAt: new Date().toISOString(),
    ...app
  }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `preshow-occupancy-inspections-${todayIso()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Backup exported");
}

function importAll(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!incoming.inspections) throw new Error("Missing inspections");
      app.inspections = normalizeInspections(incoming.inspections);
      app.activeId = incoming.activeId || Object.keys(app.inspections)[0];
      persist();
      applyInspection();
      pushToCloud({ notify: false });
      showToast("Backup imported");
    } catch {
      alert("That file was not a valid inspection backup.");
    }
  };
  reader.readAsText(file);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2000);
}

function bindEvents() {
  $("#saveBtn").addEventListener("click", () => saveCurrent({ notify: true }));
  $("#syncBtn").addEventListener("click", () => syncFromCloud({ notify: true }));
  $("#newUnitBtn").addEventListener("click", createNewInspection);
  $("#backupBtn").addEventListener("click", exportAll);
  $("#printBtn").addEventListener("click", () => {
    saveCurrent();
    window.print();
  });
  $("#deleteUnitBtn").addEventListener("click", deleteCurrentInspection);
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importAll(file);
    event.target.value = "";
  });
  $("#unitSearch").addEventListener("input", renderUnitList);
  $("#unitList").addEventListener("click", (event) => {
    const card = event.target.closest("[data-unit-id]");
    if (card) switchInspection(card.dataset.unitId);
  });
  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-meta], [data-check]")) saveCurrent();
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-meta], [data-check]")) saveCurrent();
  });
}

loadApp();
renderSheet();
applyInspection();
bindEvents();
initCloud();
