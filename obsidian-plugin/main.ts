import {
  App,
  FuzzySuggestModal,
  Menu,
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
// Контракт с сервером. Заметка Obsidian ↔ задача трекера.
//   Obsidian владеет: содержимым, именем файла, свойствами «Проект», «Метки»,
//   «Связи». Трекер владеет статусом/стадией/сроками/исполнителем — приходят в
//   ответе и пишутся обратно как read-only свойства (русские ключи, как в трекере).
// ─────────────────────────────────────────────────────────────────────────────

/** Имена свойств (Properties) в заметке — на русском, как в трекере. */
const PROP = {
  project: "Проект",
  labels: "Метки",
  links: "Связи",
  trackerId: "ИД",
  trackerUrl: "Карточка",
  archived: "Архив",
} as const;

interface TrackerSyncSettings {
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

const DEFAULT_SETTINGS: TrackerSyncSettings = {
  baseUrl: "http://localhost:3000",
  token: "",
  workspace: "",
  folder: "",
  pollSeconds: 15,
  cursor: "",
  mocPath: "Готовность.md",
};

type NoteLink = { tracker_id: string | null; title: string; type?: string };

type UpsertPayload = {
  tracker_id: string | null;
  path: string;
  title: string;
  theme: string;
  tags: string[];
  links: NoteLink[];
};

type NoteFields = Record<string, unknown>;

type NoteSubtask = { id: string; title: string; done: boolean };
type NoteComment = { id: string; author: string; at: string; body: string };

type ChangedNote = {
  path: string;
  archived: boolean;
  fields: NoteFields;
  subtasks: NoteSubtask[];
  comments: NoteComment[];
};

type UpsertResponse = {
  tracker_id: string;
  fields: NoteFields;
  subtasks: NoteSubtask[];
  comments: NoteComment[];
};

export default class TrackerSyncPlugin extends Plugin {
  settings!: TrackerSyncSettings;
  /** Хэш «входных» свойств последней отправки — анти-эхо для write-back. */
  private lastInputHash = new Map<string, string>();
  /** Хэш состояния подзадач — чтобы reconcile шёл только при реальной правке. */
  private lastSubsHash = new Map<string, string>();
  private pollHandle: number | null = null;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new TrackerSyncSettingTab(this.app, this));

    // Дебаунс на путь: при наборе текста modify сыплется десятками.
    const pushDebounced = debounce((file: TFile) => void this.pushNote(file), 800, false);

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
    // Удаление заметки НЕ трогает трекер: Obsidian — редактор/представление,
    // удаление локальной заметки не должно архивировать/удалять задачу. Чистку
    // задач делаем явно на доске трекера.

    // Видимая кнопка в левой панели — меню всех действий синхронизации.
    this.addRibbonIcon("refresh-cw", "Трекер", (evt) => this.openMenu(evt));

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
      name: "Синхронизировать все задачи",
      callback: () => void this.pushAll(),
    });

    this.addCommand({
      id: "pick-project",
      name: "Выбрать проект заметки",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const ok = !!file && file.extension === "md";
        if (ok && !checking) void this.pickProject(file as TFile);
        return ok;
      },
    });

    this.addCommand({
      id: "add-label",
      name: "Добавить метку из трекера",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const ok = !!file && file.extension === "md";
        if (ok && !checking) void this.pickLabel(file as TFile);
        return ok;
      },
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
        const url = file && this.frontmatter(file)?.[PROP.trackerUrl];
        if (!url) return false;
        if (!checking) window.open(String(url), "_blank");
        return true;
      },
    });

    // Обратный канал — поллинг (CORS-free через requestUrl).
    this.app.workspace.onLayoutReady(() => this.startPolling());
  }

  onunload() {
    this.stopPolling();
  }

  private openMenu(evt: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((i) =>
      i
        .setTitle("Синхронизировать текущую заметку")
        .setIcon("file-up")
        .onClick(() => {
          const file = this.app.workspace.getActiveFile();
          if (file && this.inScope(file)) void this.pushNote(file, true);
          else new Notice("Трекер: нет активного документа (нужно свойство «Проект»)");
        }),
    );
    menu.addItem((i) =>
      i
        .setTitle("Синхронизировать все документы")
        .setIcon("folder-up")
        .onClick(() => void this.pushAll()),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("Выбрать проект текущей заметки")
        .setIcon("folder")
        .onClick(() => {
          const file = this.app.workspace.getActiveFile();
          if (file) void this.pickProject(file);
        }),
    );
    menu.addItem((i) =>
      i
        .setTitle("Добавить метку текущей заметки")
        .setIcon("tag")
        .onClick(() => {
          const file = this.app.workspace.getActiveFile();
          if (file) void this.pickLabel(file);
        }),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("Импорт задач из трекера")
        .setIcon("download")
        .onClick(() => void this.importFromTracker()),
    );
    menu.addItem((i) =>
      i
        .setTitle("Обзор готовности (MOC)")
        .setIcon("table")
        .onClick(() => void this.generateReadiness()),
    );
    menu.showAtMouseEvent(evt);
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
    return !!this.frontmatter(file)?.[PROP.project];
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
    const theme = fm?.[PROP.project];
    if (!theme) return null;
    return {
      tracker_id: (fm?.[PROP.trackerId] as string) ?? null,
      path: file.path,
      title: file.basename,
      theme: String(theme),
      tags: toList(fm?.[PROP.labels]),
      links: this.extractLinks(fm?.[PROP.links], file),
    };
  }

  /** «Связи» (список ссылок) → цели с tracker_id (если у целевой заметки он есть). */
  private extractLinks(raw: unknown, source: TFile): NoteLink[] {
    const out: NoteLink[] = [];
    for (const item of toList(raw)) {
      const linkpath = parseWikiLink(item);
      if (!linkpath) continue;
      const dest = this.app.metadataCache.getFirstLinkpathDest(linkpath, source.path);
      if (dest) {
        const destFm = this.frontmatter(dest);
        out.push({ tracker_id: (destFm?.[PROP.trackerId] as string) ?? null, title: dest.basename });
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

  /** Upsert свойств + запись трекер-полей и секций тела (для pick-команд). */
  private async sendUpsert(file: TFile, payload: UpsertPayload): Promise<boolean> {
    const { status, json } = await this.api("POST", "/api/obsidian/upsert", payload);
    if (status !== 200) {
      this.reportError(file, status, json);
      return false;
    }
    const res = json as UpsertResponse;
    this.lastInputHash.set(file.path, this.inputHash(payload));
    await this.writeFields(file, res.fields, false);
    await this.renderBodySections(file, res.subtasks ?? [], res.comments ?? []);
    this.lastSubsHash.set(file.path, hashSubs(res.subtasks ?? []));
    return true;
  }

  /**
   * Полная синхронизация заметки: свойства + подзадачи (чеклист) + новые
   * комментарии. Reconcile подзадач — только при реальной правке чеклиста, чтобы
   * правка свойства не архивировала подзадачи, добавленные в трекере.
   */
  private async pushNote(file: TFile, force = false): Promise<void> {
    if (!this.configured()) return;
    const payload = this.buildPayload(file);
    if (!payload) return;

    const content = await this.app.vault.read(file);
    const subRegion = getRegion(content, SUB_START, SUB_END);
    const cmtRegion = getRegion(content, CMT_START, CMT_END);
    const parsedSubs = subRegion != null ? parseSubtasks(subRegion) : null;
    const newComments = cmtRegion != null ? parseNewComments(cmtRegion) : [];

    const propsHash = this.inputHash(payload);
    const subsHash = parsedSubs != null ? hashSubs(parsedSubs) : null;
    const propsChanged = force || this.lastInputHash.get(file.path) !== propsHash;
    const subsChanged = parsedSubs != null && this.lastSubsHash.get(file.path) !== subsHash;
    if (!propsChanged && !subsChanged && newComments.length === 0) return;

    // Upsert свойств — заодно отдаёт текущие подзадачи/комментарии (базис).
    const { status, json } = await this.api("POST", "/api/obsidian/upsert", payload);
    if (status !== 200) {
      this.reportError(file, status, json);
      return;
    }
    const res = json as UpsertResponse;
    const trackerId = res.tracker_id;
    let subtasks = res.subtasks ?? [];
    let comments = res.comments ?? [];

    if (subsChanged && parsedSubs) {
      const r = await this.api("POST", "/api/obsidian/subtasks", {
        task_id: trackerId,
        items: parsedSubs,
      });
      if (r.status === 200) subtasks = (r.json as { subtasks: NoteSubtask[] }).subtasks;
    }
    if (newComments.length > 0) {
      const r = await this.api("POST", "/api/obsidian/comments", {
        task_id: trackerId,
        bodies: newComments,
      });
      if (r.status === 200) comments = (r.json as { comments: NoteComment[] }).comments;
    }

    this.lastInputHash.set(file.path, propsHash);
    await this.writeFields(file, res.fields, false);
    await this.renderBodySections(file, subtasks, comments);
    this.lastSubsHash.set(file.path, hashSubs(subtasks));
  }

  /** Перерисовывает секции «Подзадачи» и «Комментарии» в теле заметки. */
  private async renderBodySections(
    file: TFile,
    subtasks: NoteSubtask[],
    comments: NoteComment[],
  ): Promise<void> {
    const before = await this.app.vault.read(file);
    let content = replaceRegion(before, SUB_START, SUB_END, renderSubtasks(subtasks));
    content = replaceRegion(content, CMT_START, CMT_END, renderComments(comments));
    if (content !== before) await this.app.vault.modify(file, content);
  }

  private async pushAll(): Promise<void> {
    if (!this.configured()) {
      new Notice("Трекер: укажите URL и токен в настройках");
      return;
    }
    const files = this.app.vault.getMarkdownFiles().filter((f) => this.inScope(f));
    const progress = new Notice(`Трекер: синхронизация 0/${files.length}…`, 0);
    let ok = 0;
    for (const file of files) {
      await this.pushNote(file, true);
      ok += 1;
      progress.setMessage(`Трекер: синхронизация ${ok}/${files.length}…`);
    }
    progress.hide();
    new Notice(`Трекер: синхронизировано ${ok}`);
  }

  private reportError(file: TFile, status: number, json: unknown): void {
    const err = (json as { error?: string })?.error;
    if (status === 401) new Notice("Трекер: неверный токен");
    else if (err === "theme_not_found")
      new Notice(`Трекер: проект не найден (${this.frontmatter(file)?.[PROP.project]})`);
    else new Notice(`Трекер: ошибка ${status} (${file.basename})`);
  }

  // ── Выбор проекта / метки из трекера ─────────────────────────────────────────────

  private async pickProject(file: TFile): Promise<void> {
    if (!this.configured()) {
      new Notice("Трекер: укажите URL и токен в настройках");
      return;
    }
    const { status, json } = await this.api("GET", "/api/obsidian/themes");
    if (status !== 200) {
      new Notice(`Трекер: не удалось получить проекты (${status})`);
      return;
    }
    const names = ((json as { themes: { name: string }[] }).themes ?? []).map((t) => t.name);
    if (names.length === 0) {
      new Notice("Трекер: в трекере нет проектов");
      return;
    }
    new ChoiceModal(this.app, names, "Выберите проект", async (name) => {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm[PROP.project] = name;
      });
      const fm = this.frontmatter(file) ?? {};
      await this.sendUpsert(file, {
        tracker_id: (fm[PROP.trackerId] as string) ?? null,
        path: file.path,
        title: file.basename,
        theme: name,
        tags: toList(fm[PROP.labels]),
        links: this.extractLinks(fm[PROP.links], file),
      });
      new Notice(`Проект: ${name}`);
    }).open();
  }

  private async pickLabel(file: TFile): Promise<void> {
    if (!this.configured()) {
      new Notice("Трекер: укажите URL и токен в настройках");
      return;
    }
    const { status, json } = await this.api("GET", "/api/obsidian/labels");
    if (status !== 200) {
      new Notice(`Трекер: не удалось получить метки (${status})`);
      return;
    }
    const labels = (json as { labels: string[] }).labels ?? [];
    if (labels.length === 0) {
      new Notice("Трекер: в трекере нет меток");
      return;
    }
    new ChoiceModal(this.app, labels, "Добавить метку", async (name) => {
      const fmBefore = this.frontmatter(file) ?? {};
      const tags = toList(fmBefore[PROP.labels]);
      if (!tags.includes(name)) tags.push(name);
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm[PROP.labels] = tags;
      });
      const theme = fmBefore[PROP.project];
      if (theme) {
        await this.sendUpsert(file, {
          tracker_id: (fmBefore[PROP.trackerId] as string) ?? null,
          path: file.path,
          title: file.basename,
          theme: String(theme),
          tags,
          links: this.extractLinks(fmBefore[PROP.links], file),
        });
      }
      new Notice(`Метки: ${tags.join(", ")}`);
    }).open();
  }

  // ── Трекер → Obsidian (write-back свойств) ───────────────────────────────────

  /** Пишет трекер-владеемые свойства во frontmatter заметки (русские ключи). */
  private async writeFields(file: TFile, fields: NoteFields, archived: boolean): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        fm[key] = value;
      }
      if (archived) fm[PROP.archived] = true;
      else if (PROP.archived in fm) delete fm[PROP.archived];
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

    const active = this.app.workspace.getActiveFile();
    for (const change of data.changes ?? []) {
      const af = this.app.vault.getAbstractFileByPath(change.path);
      if (!(af instanceof TFile)) continue;
      await this.writeFields(af, change.fields, change.archived);
      // Тело не трогаем у активной (редактируемой) заметки, чтобы не мешать.
      if (af !== active) {
        await this.renderBodySections(af, change.subtasks ?? [], change.comments ?? []);
        this.lastSubsHash.set(af.path, hashSubs(change.subtasks ?? []));
        const p = this.buildPayload(af);
        if (p) this.lastInputHash.set(af.path, this.inputHash(p));
      }
    }
    this.settings.cursor = data.now;
    await this.saveSettings();
  }

  // ── Импорт: задачи трекера → заметки ─────────────────────────────────────────

  /** Карта tracker_id → заметка (по свойству «ИД») — чтобы не дублировать. */
  private notesByTrackerId(): Map<string, TFile> {
    const map = new Map<string, TFile>();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const id = this.frontmatter(f)?.[PROP.trackerId];
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
      new Notice("Трекер: укажите URL и токен в настройках");
      return;
    }
    const { status, json } = await this.api("GET", "/api/obsidian/export");
    if (status !== 200) {
      new Notice(`Трекер: импорт не удался (${status})`);
      return;
    }
    const data = json as { workspace?: string | null; docs: ExportDoc[] };
    const docs = data.docs ?? [];
    const existing = this.notesByTrackerId();
    // Корневая папка: явная из настроек → имя пространства → запасное «Проекты».
    // Структура: <Пространство>/<Проект>/<задача>.md.
    const base = this.settings.folder || (data.workspace ? sanitizeName(data.workspace) : "Проекты");
    // Создаём те, которых НЕТ в этом хранилище (по «ИД» в заметках). Флаг сервера
    // hasNote не используем: заметку могли удалить локально, а привязка осталась.
    const toCreate = docs.filter((d) => !existing.has(d.tracker_id));
    const skipped = docs.length - toCreate.length;

    if (toCreate.length === 0) {
      new Notice(`Трекер: всё уже импортировано (${skipped})`);
      return;
    }

    const progress = new Notice(`Трекер: импорт 0/${toCreate.length}…`, 0);
    const pairs: { tracker_id: string; path: string }[] = [];
    let created = 0;
    let failed = 0;
    for (const d of toCreate) {
      try {
        const folder = `${base}/${sanitizeName(d.themeName)}`;
        await this.ensureFolder(folder);
        const path = this.uniquePath(`${folder}/${sanitizeName(d.title)}.md`, d.tracker_id);
        const file = await this.app.vault.create(path, `# ${d.title}\n\n`);
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          fm[PROP.project] = d.themeName;
          if (d.tags.length) fm[PROP.labels] = d.tags;
          if (d.links.length) fm[PROP.links] = d.links.map((t) => `[[${t}]]`);
          for (const [key, value] of Object.entries(d.fields)) {
            if (value !== undefined) fm[key] = value;
          }
        });
        await this.renderBodySections(file, d.subtasks ?? [], d.comments ?? []);
        // Анти-эхо: хэш из данных экспорта (кэш Obsidian ещё не обновился).
        this.lastSubsHash.set(path, hashSubs(d.subtasks ?? []));
        this.lastInputHash.set(
          path,
          this.inputHash({
            tracker_id: d.tracker_id,
            path,
            title: file.basename,
            theme: d.themeName,
            tags: d.tags,
            links: d.links.map((t) => ({ tracker_id: null, title: t })),
          }),
        );
        existing.set(d.tracker_id, file);
        pairs.push({ tracker_id: d.tracker_id, path });
        created += 1;
      } catch (e) {
        failed += 1;
        console.error("Трекер: импорт заметки не удался", d.title, e);
      }
      progress.setMessage(`Трекер: импорт ${created}/${toCreate.length}…`);
    }

    // Пакетная привязка путей к задачам — чтобы обратный канал отдавал статусы.
    if (pairs.length) await this.api("POST", "/api/obsidian/bind", { pairs });

    progress.hide();
    const tail = failed ? `, ошибок ${failed}` : "";
    new Notice(`Трекер: импорт завершён — создано ${created}, пропущено ${skipped}${tail}`);
  }

  /** Уникальный путь: если занят чужим «ИД» — добавляет суффикс. */
  private uniquePath(path: string, trackerId: string): string {
    const af = this.app.vault.getAbstractFileByPath(path);
    if (!(af instanceof TFile)) return path;
    if (this.frontmatter(af)?.[PROP.trackerId] === trackerId) return path;
    return path.replace(/\.md$/, ` (${trackerId.slice(0, 6)}).md`);
  }

  // ── Генерация обзора готовности (MOC) ────────────────────────────────────────

  private async generateReadiness(): Promise<void> {
    if (!this.configured()) {
      new Notice("Трекер: укажите URL и токен в настройках");
      return;
    }
    const { status, json } = await this.api("GET", "/api/obsidian/readiness");
    if (status !== 200) {
      new Notice(`Трекер: не удалось получить готовность (${status})`);
      return;
    }
    const themes = (json as { themes: VaultTheme[] }).themes ?? [];
    const md = renderReadiness(themes);

    const path = normalizePath(this.settings.mocPath || "Готовность.md");
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
    new Notice(`Трекер: обзор готовности обновлён (${themes.length} проектов)`);
  }
}

// ── Модалка выбора из списка ────────────────────────────────────────────────────

class ChoiceModal extends FuzzySuggestModal<string> {
  constructor(
    app: App,
    private items: string[],
    placeholder: string,
    private onPick: (value: string) => void | Promise<void>,
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }
  getItems(): string[] {
    return this.items;
  }
  getItemText(item: string): string {
    return item;
  }
  onChooseItem(item: string): void {
    void this.onPick(item);
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

const STATUS_VAL: Record<string, string> = {
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
  lines.push("# Готовность проектов", "");
  lines.push(`> Сгенерировано ${new Date().toLocaleString("ru-RU")}. Источник: трекер.`, "");

  const total = themes.reduce((a, t) => a + t.total, 0);
  const done = themes.reduce((a, t) => a + t.done, 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  lines.push(`**Итого:** ${done}/${total} документов готово (${pct}%).`, "");

  for (const t of themes) {
    lines.push(`## ${t.name} — ${t.progressPct}% (${t.done}/${t.total})`);
    lines.push(`не начато ${t.notStarted} · в работе ${t.inProgress} · готово ${t.done}`, "");
    if (t.docs.length === 0) {
      lines.push("_Нет документов._", "");
      continue;
    }
    lines.push("| Документ | Статус | Стадия | Пересмотр |", "| --- | --- | --- | --- |");
    for (const d of t.docs) {
      const review = d.review ? (d.overdueReview ? `⚠ ${d.review}` : d.review) : "—";
      lines.push(
        `| ${basenameLink(d)} | ${STATUS_VAL[d.status] ?? d.status} | ${escapeCell(d.stage)} | ${review} |`,
      );
    }
    lines.push("");
  }

  lines.push("---", "");
  lines.push(
    "> [!tip] Живая таблица",
    "> Статичные таблицы можно заменить запросом Bases (ядро) или Dataview по",
    "> свойствам «Проект»/«Статус»/«Стадия»/«Пересмотр» — они есть в каждой заметке.",
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
  subtasks: NoteSubtask[];
  comments: NoteComment[];
};

// ── Управляемые секции тела заметки (подзадачи / комментарии) ────────────────────

const SUB_START = "<!-- trk:subtasks -->";
const SUB_END = "<!-- /trk:subtasks -->";
const CMT_START = "<!-- trk:comments -->";
const CMT_END = "<!-- /trk:comments -->";

/** Текст между маркерами (без них), либо null, если секции нет. */
function getRegion(content: string, start: string, end: string): string | null {
  const i = content.indexOf(start);
  if (i < 0) return null;
  const j = content.indexOf(end, i + start.length);
  if (j < 0) return null;
  return content.slice(i + start.length, j);
}

/** Заменяет секцию между маркерами; если её нет — дописывает в конец. */
function replaceRegion(content: string, start: string, end: string, inner: string): string {
  const block = `${start}\n${inner}\n${end}`;
  const i = content.indexOf(start);
  if (i >= 0) {
    const j = content.indexOf(end, i + start.length);
    if (j >= 0) return content.slice(0, i) + block + content.slice(j + end.length);
  }
  return content.replace(/\s*$/, "") + "\n\n" + block + "\n";
}

function renderSubtasks(subs: NoteSubtask[]): string {
  const lines = ["## Подзадачи", ""];
  if (subs.length === 0) lines.push("_Нет подзадач. Добавьте строку: `- [ ] …`_");
  for (const s of subs) lines.push(`- [${s.done ? "x" : " "}] ${s.title} <!-- trk:${s.id} -->`);
  return lines.join("\n");
}

/** Чеклист из секции → {id, title, done}. id=null для добавленной вручную строки. */
function parseSubtasks(inner: string): { id: string | null; title: string; done: boolean }[] {
  const out: { id: string | null; title: string; done: boolean }[] = [];
  for (const line of inner.split("\n")) {
    const m = /^\s*-\s*\[([ xX])\]\s*(.*)$/.exec(line);
    if (!m) continue;
    const done = m[1].toLowerCase() === "x";
    const idm = /<!--\s*trk:([^\s>]+)\s*-->/.exec(m[2]);
    const id = idm ? idm[1] : null;
    const title = m[2].replace(/<!--\s*trk:[^>]*-->/, "").trim();
    if (!title) continue;
    out.push({ id, title, done });
  }
  return out;
}

function renderComments(cmts: NoteComment[]): string {
  const lines = ["## Комментарии", ""];
  if (cmts.length === 0) lines.push("_Нет комментариев. Новый — цитатой: `> текст`_");
  for (const c of cmts) {
    lines.push(`> **${c.author}** · ${fmtDateTime(c.at)} <!-- trk:${c.id} -->`);
    for (const bl of c.body.split("\n")) lines.push(`> ${bl}`);
    lines.push("");
  }
  return lines.join("\n").replace(/\n+$/, "");
}

/** Блоки-цитаты без маркера = новые комментарии (текст без `> `). */
function parseNewComments(inner: string): string[] {
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const line of inner.split("\n")) {
    if (/^\s*>/.test(line)) cur.push(line.replace(/^\s*>\s?/, ""));
    else if (cur.length) {
      blocks.push(cur);
      cur = [];
    }
  }
  if (cur.length) blocks.push(cur);
  const out: string[] = [];
  for (const b of blocks) {
    if (b.some((l) => /<!--\s*trk:/.test(l))) continue; // существующий комментарий
    const body = b.join("\n").trim();
    if (body) out.push(body);
  }
  return out;
}

function hashSubs(subs: { id: string | null; title: string; done: boolean }[]): string {
  return JSON.stringify(subs.map((s) => `${s.id ?? ""}:${s.done ? 1 : 0}:${s.title}`));
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

// ── Настройки ──────────────────────────────────────────────────────────────────

class TrackerSyncSettingTab extends PluginSettingTab {
  plugin: TrackerSyncPlugin;

  constructor(app: App, plugin: TrackerSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h3", { text: "Синхронизация с трекером" });

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
      .setName("Корневая папка")
      .setDesc("Папка импорта/синхронизации. Пусто — имя пространства из трекера. Структура: Пространство / Проект / задача")
      .addText((t) =>
        t
          .setPlaceholder("(имя пространства)")
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
          .setPlaceholder("Готовность.md")
          .setValue(this.plugin.settings.mocPath)
          .onChange(async (v) => {
            this.plugin.settings.mocPath = v.trim() || "Готовность.md";
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
