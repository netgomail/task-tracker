import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  debounce,
  normalizePath,
  requestUrl,
} from "obsidian";

// ─────────────────────────────────────────────────────────────────────────────
// Контракт с сервером (см. PLAN.md). Заметка-документ ОРД ↔ задача трекера.
//   Obsidian владеет: содержимым, именем файла, свойствами `theme`, `type`,
//   `links`. Трекер владеет: status/stage/priority/due/review/completed/
//   assignee — они приходят в ответе и пишутся обратно как read-only свойства.
// ─────────────────────────────────────────────────────────────────────────────

interface OrdSyncSettings {
  baseUrl: string;
  token: string;
  workspace: string;
  /** Папка-ограничение (vault-относительная). Пусто — весь vault. */
  folder: string;
  pollSeconds: number;
  /** Курсор обратного канала: ISO времени последнего успешного /changes. */
  cursor: string;
  /** Путь генерируемой обзорной заметки готовности (MOC). */
  mocPath: string;
}

const DEFAULT_SETTINGS: OrdSyncSettings = {
  baseUrl: "http://localhost:3000",
  token: "",
  workspace: "",
  folder: "",
  pollSeconds: 15,
  cursor: "",
  mocPath: "ОРД — Готовность.md",
};

/** Свойства, которыми владеет трекер (пишутся обратно, read-only для человека). */
const TRACKER_FIELDS = [
  "tracker_id",
  "status",
  "stage",
  "priority",
  "due",
  "review",
  "completed",
  "assignee",
  "tracker_url",
  "tracker_updated",
] as const;

type NoteLink = { tracker_id: string | null; title: string; type?: string };

type UpsertPayload = {
  tracker_id: string | null;
  path: string;
  title: string;
  theme: string;
  tags: string[];
  links: NoteLink[];
};

type NoteFields = Record<string, unknown> & { tracker_id: string };

type ChangedNote = { path: string; archived: boolean; fields: NoteFields };

export default class OrdSyncPlugin extends Plugin {
  settings!: OrdSyncSettings;
  /** Хэш «входных» свойств последней отправки — анти-эхо для write-back. */
  private lastInputHash = new Map<string, string>();
  private pollHandle: number | null = null;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new OrdSyncSettingTab(this.app, this));

    // Дебаунс на путь: при наборе текста modify сыплется десятками.
    const pushDebounced = debounce(
      (file: TFile) => void this.pushNote(file),
      800,
      false,
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && this.inScope(file)) pushDebounced(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && this.inScope(file)) pushDebounced(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile && this.inScope(file)) {
          this.lastInputHash.delete(oldPath);
          void this.pushNote(file);
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.lastInputHash.delete(file.path);
          void this.deleteNote(file.path);
        }
      }),
    );

    this.addCommand({
      id: "sync-current-note",
      name: "Синхронизировать текущую заметку",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const ok = !!file && this.inScope(file);
        if (ok && !checking) void this.pushNote(file as TFile, true);
        return ok;
      },
    });

    this.addCommand({
      id: "sync-all-notes",
      name: "Синхронизировать все документы ОРД (со свойством theme)",
      callback: () => void this.pushAll(),
    });

    this.addCommand({
      id: "import-from-tracker",
      name: "Создать заметки из задач трекера (импорт)",
      callback: () => void this.importFromTracker(),
    });

    this.addCommand({
      id: "generate-readiness-moc",
      name: "Сгенерировать обзор готовности (MOC)",
      callback: () => void this.generateReadiness(),
    });

    this.addCommand({
      id: "open-in-tracker",
      name: "Открыть карточку в трекере",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const url = file && this.frontmatter(file)?.tracker_url;
        if (!url) return false;
        if (!checking) window.open(String(url), "_blank");
        return true;
      },
    });

    // Обратный канал — поллинг (CORS-free через requestUrl). SSE-эндпоинт на
    // сервере есть, но в Obsidian надёжнее опрос.
    this.app.workspace.onLayoutReady(() => this.startPolling());
  }

  onunload() {
    this.stopPolling();
  }

  // ── Настройки ──────────────────────────────────────────────────────────────

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ── Вспомогательное ──────────────────────────────────────────────────────────

  private inScope(file: TFile): boolean {
    if (file.extension !== "md") return false;
    if (this.settings.folder) {
      const prefix = normalizePath(this.settings.folder) + "/";
      if (!(file.path + "/").startsWith(prefix)) return false;
    }
    return !!this.frontmatter(file)?.theme;
  }

  private frontmatter(file: TFile): Record<string, unknown> | undefined {
    return this.app.metadataCache.getFileCache(file)?.frontmatter;
  }

  private configured(): boolean {
    return !!this.settings.baseUrl && !!this.settings.token;
  }

  private async api(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const res = await requestUrl({
      url: this.settings.baseUrl.replace(/\/$/, "") + path,
      method,
      headers: {
        Authorization: `Bearer ${this.settings.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      throw: false,
    });
    let json: unknown = null;
    try {
      json = res.json;
    } catch {
      json = null;
    }
    return { status: res.status, json };
  }

  // ── Obsidian → трекер ────────────────────────────────────────────────────────

  private buildPayload(file: TFile): UpsertPayload | null {
    const fm = this.frontmatter(file);
    if (!fm || !fm.theme) return null;
    return {
      tracker_id: (fm.tracker_id as string) ?? null,
      path: file.path,
      title: file.basename,
      theme: String(fm.theme),
      tags: toList(fm.type),
      links: this.extractLinks(fm.links, file),
    };
  }

  /** `links:` (список ссылок) → цели с tracker_id (если у целевой заметки он есть). */
  private extractLinks(raw: unknown, source: TFile): NoteLink[] {
    const out: NoteLink[] = [];
    for (const item of toList(raw)) {
      const linkpath = parseWikiLink(item);
      if (!linkpath) continue;
      const dest = this.app.metadataCache.getFirstLinkpathDest(linkpath, source.path);
      if (dest) {
        const destFm = this.frontmatter(dest);
        out.push({ tracker_id: (destFm?.tracker_id as string) ?? null, title: dest.basename });
      } else {
        out.push({ tracker_id: null, title: linkpath });
      }
    }
    return out;
  }

  /** Хэш только «входных» полей — RO write-back его не меняет, эхо не зациклится. */
  private inputHash(p: UpsertPayload): string {
    return JSON.stringify({
      title: p.title,
      theme: p.theme,
      tags: [...p.tags].sort(),
      links: p.links.map((l) => l.tracker_id || l.title).sort(),
    });
  }

  private async pushNote(file: TFile, force = false): Promise<void> {
    if (!this.configured()) return;
    const payload = this.buildPayload(file);
    if (!payload) return;

    const hash = this.inputHash(payload);
    if (!force && this.lastInputHash.get(file.path) === hash) return; // эхо/нерелевантная правка

    const { status, json } = await this.api("POST", "/api/obsidian/upsert", payload);
    if (status !== 200) {
      this.reportError(file, status, json);
      return;
    }
    this.lastInputHash.set(file.path, hash);
    const data = json as { tracker_id: string; fields: NoteFields };
    await this.writeFields(file, data.fields, false);
  }

  private async pushAll(): Promise<void> {
    if (!this.configured()) {
      new Notice("ОРД Sync: укажите URL и токен в настройках");
      return;
    }
    const files = this.app.vault.getMarkdownFiles().filter((f) => this.inScope(f));
    new Notice(`ОРД Sync: синхронизирую ${files.length} док.`);
    let ok = 0;
    for (const file of files) {
      await this.pushNote(file, true);
      ok += 1;
    }
    new Notice(`ОРД Sync: готово (${ok})`);
  }

  private async deleteNote(path: string): Promise<void> {
    if (!this.configured()) return;
    await this.api("POST", "/api/obsidian/delete", { path });
  }

  private reportError(file: TFile, status: number, json: unknown): void {
    const err = (json as { error?: string })?.error;
    if (status === 401) new Notice("ОРД Sync: неверный токен");
    else if (err === "theme_not_found")
      new Notice(`ОРД Sync: тема не найдена (${this.frontmatter(file)?.theme})`);
    else new Notice(`ОРД Sync: ошибка ${status} (${file.basename})`);
  }

  // ── Трекер → Obsidian (write-back свойств) ───────────────────────────────────

  /** Пишет трекер-владеемые свойства во frontmatter заметки. */
  private async writeFields(file: TFile, fields: NoteFields, archived: boolean): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      for (const key of TRACKER_FIELDS) {
        const value = (fields as Record<string, unknown>)[key];
        if (value === undefined) continue;
        fm[key] = value;
      }
      if (archived) fm["archived"] = true;
      else if ("archived" in fm) delete fm["archived"];
    });
  }

  // ── Поллинг обратного канала ─────────────────────────────────────────────────

  private startPolling(): void {
    this.stopPolling();
    if (!this.configured()) return;
    const tick = () => void this.pollChanges();
    this.pollHandle = window.setInterval(tick, Math.max(5, this.settings.pollSeconds) * 1000);
    this.registerInterval(this.pollHandle);
    tick();
  }

  private stopPolling(): void {
    if (this.pollHandle !== null) {
      window.clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  restartPolling(): void {
    this.startPolling();
  }

  private async pollChanges(): Promise<void> {
    if (!this.configured()) return;
    const since = this.settings.cursor;
    const q = since ? `?since=${encodeURIComponent(since)}` : "";
    const { status, json } = await this.api("GET", `/api/obsidian/changes${q}`);
    if (status !== 200) return;
    const data = json as { changes: ChangedNote[]; now: string };

    for (const change of data.changes ?? []) {
      const af = this.app.vault.getAbstractFileByPath(change.path);
      if (af instanceof TFile) {
        await this.writeFields(af, change.fields, change.archived);
      }
    }
    this.settings.cursor = data.now;
    await this.saveSettings();
  }

  // ── Импорт: задачи трекера → заметки ─────────────────────────────────────────

  /** Карта tracker_id → заметка (по frontmatter) — чтобы не дублировать. */
  private notesByTrackerId(): Map<string, TFile> {
    const map = new Map<string, TFile>();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const id = this.frontmatter(f)?.tracker_id;
      if (id) map.set(String(id), f);
    }
    return map;
  }

  private async ensureFolder(path: string): Promise<void> {
    const parts = path.split("/").filter(Boolean);
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        await this.app.vault.createFolder(cur).catch(() => {});
      }
    }
  }

  private async importFromTracker(): Promise<void> {
    if (!this.configured()) {
      new Notice("ОРД Sync: укажите URL и токен в настройках");
      return;
    }
    const { status, json } = await this.api("GET", "/api/obsidian/export");
    if (status !== 200) {
      new Notice(`ОРД Sync: импорт не удался (${status})`);
      return;
    }
    const docs = (json as { docs: ExportDoc[] }).docs ?? [];
    const existing = this.notesByTrackerId();
    const base = this.settings.folder || "Темы";
    let created = 0;
    let skipped = 0;

    for (const d of docs) {
      if (d.hasNote || existing.has(d.tracker_id)) {
        skipped += 1;
        continue;
      }
      const folder = `${base}/${sanitizeName(d.themeName)}`;
      await this.ensureFolder(folder);
      const path = this.uniquePath(`${folder}/${sanitizeName(d.title)}.md`, d.tracker_id);
      const file = await this.app.vault.create(path, `# ${d.title}\n\n`);
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm["theme"] = d.themeSlug;
        if (d.tags.length) fm["type"] = d.tags;
        if (d.links.length) fm["links"] = d.links.map((t) => `[[${t}]]`);
        for (const key of TRACKER_FIELDS) {
          const value = (d.fields as Record<string, unknown>)[key];
          if (value !== undefined) fm[key] = value;
        }
      });
      // Анти-эхо: входные поля уже отданы трекеру при экспорте — не шлём назад.
      this.lastInputHash.set(path, this.inputHash(this.buildPayload(file)!));
      existing.set(d.tracker_id, file);
      created += 1;
    }
    new Notice(`ОРД Sync: импорт — создано ${created}, пропущено ${skipped}`);
  }

  /** Уникальный путь: если занят чужим tracker_id — добавляет суффикс. */
  private uniquePath(path: string, trackerId: string): string {
    const af = this.app.vault.getAbstractFileByPath(path);
    if (!(af instanceof TFile)) return path;
    if (this.frontmatter(af)?.tracker_id === trackerId) return path;
    return path.replace(/\.md$/, ` (${trackerId.slice(0, 6)}).md`);
  }

  // ── Генерация обзора готовности (MOC) ────────────────────────────────────────

  private async generateReadiness(): Promise<void> {
    if (!this.configured()) {
      new Notice("ОРД Sync: укажите URL и токен в настройках");
      return;
    }
    const { status, json } = await this.api("GET", "/api/obsidian/readiness");
    if (status !== 200) {
      new Notice(`ОРД Sync: не удалось получить готовность (${status})`);
      return;
    }
    const themes = (json as { themes: VaultTheme[] }).themes ?? [];
    const md = renderReadiness(themes);

    const path = normalizePath(this.settings.mocPath || "ОРД — Готовность.md");
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, md);
    } else {
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
        await this.app.vault.createFolder(dir).catch(() => {});
      }
      await this.app.vault.create(path, md);
    }
    new Notice(`ОРД Sync: обзор готовности обновлён (${themes.length} тем)`);
  }
}

// ── Рендер MOC готовности ───────────────────────────────────────────────────────

type VaultDoc = {
  title: string;
  status: "not_started" | "in_progress" | "done";
  stage: string;
  review: string | null;
  overdueReview: boolean;
  path: string | null;
};

type VaultTheme = {
  slug: string;
  name: string;
  total: number;
  done: number;
  inProgress: number;
  notStarted: number;
  progressPct: number;
  docs: VaultDoc[];
};

const STATUS_LABEL: Record<VaultDoc["status"], string> = {
  not_started: "не начато",
  in_progress: "в работе",
  done: "готово",
};

function basenameLink(doc: VaultDoc): string {
  if (!doc.path) return escapeCell(doc.title);
  const base = doc.path.split("/").pop()!.replace(/\.md$/, "");
  return `[[${base}]]`;
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|");
}

function renderReadiness(themes: VaultTheme[]): string {
  const lines: string[] = [];
  lines.push("# ОРД — Готовность", "");
  lines.push(`> Сгенерировано ${new Date().toLocaleString("ru-RU")}. Источник: трекер.`, "");

  const total = themes.reduce((a, t) => a + t.total, 0);
  const done = themes.reduce((a, t) => a + t.done, 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  lines.push(`**Итого:** ${done}/${total} документов готово (${pct}%).`, "");

  for (const t of themes) {
    lines.push(`## ${t.name} — ${t.progressPct}% (${t.done}/${t.total})`);
    lines.push(
      `не начато ${t.notStarted} · в работе ${t.inProgress} · готово ${t.done}`,
      "",
    );
    if (t.docs.length === 0) {
      lines.push("_Нет документов._", "");
      continue;
    }
    lines.push("| Документ | Статус | Стадия | Пересмотр |", "| --- | --- | --- | --- |");
    for (const d of t.docs) {
      const review = d.review ? (d.overdueReview ? `⚠ ${d.review}` : d.review) : "—";
      lines.push(
        `| ${basenameLink(d)} | ${STATUS_LABEL[d.status]} | ${escapeCell(d.stage)} | ${review} |`,
      );
    }
    lines.push("");
  }

  lines.push("---", "");
  lines.push(
    "> [!tip] Живая таблица",
    "> Можно заменить статичные таблицы на запрос Bases (ядро) или Dataview по",
    "> свойствам `theme`/`status`/`stage`/`review` — они синхронизируются в каждую заметку.",
  );
  return lines.join("\n");
}

// ── Утилиты разбора свойств ────────────────────────────────────────────────────

/** Нормализует свойство-список Obsidian: строка | массив | null → string[]. */
function toList(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  return [String(raw)].filter(Boolean);
}

/** Из `[[Заметка|алиас#заголовок]]` или `Заметка` достаёт linkpath «Заметка». */
function parseWikiLink(raw: string): string | null {
  const s = String(raw).trim();
  const inner = s.startsWith("[[") && s.endsWith("]]") ? s.slice(2, -2) : s;
  const linkpath = inner.split("|")[0].split("#")[0].trim();
  return linkpath || null;
}

/** Убирает недопустимые в именах файлов/папок Obsidian символы. */
function sanitizeName(s: string): string {
  return s.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim() || "без названия";
}

type ExportDoc = {
  tracker_id: string;
  title: string;
  themeSlug: string;
  themeName: string;
  hasNote: boolean;
  tags: string[];
  links: string[];
  fields: Record<string, unknown>;
};

// ── Настройки ──────────────────────────────────────────────────────────────────

class OrdSyncSettingTab extends PluginSettingTab {
  plugin: OrdSyncPlugin;

  constructor(app: App, plugin: OrdSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h3", { text: "Синхронизация ОРД с трекером" });

    new Setting(containerEl)
      .setName("URL сервера")
      .setDesc("Адрес таск-трекера, напр. http://localhost:3000")
      .addText((t) =>
        t
          .setPlaceholder("http://localhost:3000")
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (v) => {
            this.plugin.settings.baseUrl = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Токен синхронизации")
      .setDesc("Создаётся в трекере: Настройки пространства → Синхронизация с Obsidian")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder("obs_…")
          .setValue(this.plugin.settings.token)
          .onChange(async (v) => {
            this.plugin.settings.token = v.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Папка документов ОРД")
      .setDesc("Ограничить синхронизацию папкой (пусто — весь vault; всё равно нужен `theme`)")
      .addText((t) =>
        t
          .setPlaceholder("Темы")
          .setValue(this.plugin.settings.folder)
          .onChange(async (v) => {
            this.plugin.settings.folder = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Интервал опроса статусов, сек")
      .setDesc("Как часто подтягивать стадии/сроки из трекера (минимум 5)")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.pollSeconds)).onChange(async (v) => {
          const n = Number.parseInt(v, 10);
          this.plugin.settings.pollSeconds = Number.isFinite(n) && n >= 5 ? n : 15;
          await this.plugin.saveSettings();
          this.plugin.restartPolling();
        }),
      );

    new Setting(containerEl)
      .setName("Файл обзора готовности (MOC)")
      .setDesc("Куда команда «Сгенерировать обзор готовности» пишет таблицу")
      .addText((t) =>
        t
          .setPlaceholder("ОРД — Готовность.md")
          .setValue(this.plugin.settings.mocPath)
          .onChange(async (v) => {
            this.plugin.settings.mocPath = v.trim() || "ОРД — Готовность.md";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Сбросить курсор обратного канала")
      .setDesc("Заставит подтянуть статусы заново при следующем опросе")
      .addButton((b) =>
        b.setButtonText("Сбросить").onClick(async () => {
          this.plugin.settings.cursor = "";
          await this.plugin.saveSettings();
          new Notice("Курсор сброшен");
        }),
      );
  }
}
