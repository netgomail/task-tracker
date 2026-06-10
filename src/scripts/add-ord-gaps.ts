/**
 * Добивка ОРД: недостающие документы по результатам сверки с «Нормативной
 * картой ИБ» (раздел 2, июнь 2026). В отличие от seed-ord.ts — АДДИТИВНЫЙ:
 * ничего не удаляет, существующие проекты/задачи не трогает, повторный запуск
 * пропускает уже созданные задачи (по точному названию в воркспейсе).
 *
 *   npx tsx --env-file=.env.local src/scripts/add-ord-gaps.ts
 *
 * Создаёт проект «11 · Сайт» (если нет) и ~19 задач с описаниями,
 * подзадачами, метками типов и связями с существующими документами.
 */
import { randomUUID } from "node:crypto";

import { generateNKeysBetween } from "fractional-indexing";
import postgres from "postgres";

import { ORD_TYPE_LABELS } from "./ord-type-labels";

const ORG_ID = process.env.SEED_ORG_ID ?? "3Mv7NfvJWKMYakcEppMKObf6AlV5tBQy";
const USER_ID = process.env.SEED_USER_ID ?? "kZWBRa3XBfPVkWfKfnShEl5nA5s1uq65";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL не задан");

const sql = postgres(DATABASE_URL, { ssl: false, connect_timeout: 15 });

const LIFECYCLE: { name: string; color: string; wip: number | null }[] = [
  { name: "Не начато", color: "slate", wip: null },
  { name: "Разработка проекта", color: "blue", wip: null },
  { name: "Согласование", color: "amber", wip: 3 },
  { name: "Утверждение", color: "violet", wip: 2 },
  { name: "Ввод в действие", color: "cyan", wip: null },
  { name: "Ознакомление", color: "teal", wip: null },
  { name: "Готово", color: "green", wip: null },
];

type GapDoc = {
  theme: string;
  title: string;
  type: string; // ключ ORD_TYPE_LABELS
  description: string;
  subtasks?: string[];
  /** Связи: [источник, цель, тип]; "@" — сама создаваемая задача. */
  links?: [string, string, string][];
};

const NEW_THEME = { name: "11 · Сайт", color: "red" };

const GAPS: GapDoc[] = [
  // ── 01 · Базовый комплект ПДн ──────────────────────────────────────────
  {
    theme: "01 · Базовый комплект ПДн",
    title: "Типовые формы документов, содержащих ПДн (заявления, анкеты)",
    type: "other",
    description:
      "Типовые формы документов с ПДн (заявления, анкеты, личные карточки): состав полей минимизирован под цели обработки.\nОснование: п. 7 ПП РФ № 687 от 15.09.2008.",
    subtasks: [
      "Собрать используемые формы (приём, заявления, анкеты)",
      "Проверить минимизацию состава ПДн в каждой форме",
      "Утвердить типовые формы",
    ],
  },
  {
    theme: "01 · Базовый комплект ПДн",
    title: "Поручения на обработку ПДн третьим лицам (1С, ЦБ, хостинг)",
    type: "other",
    description:
      "Поручения оператора на обработку ПДн третьими лицами: обслуживание 1С, централизованная бухгалтерия, хостинг сайта.\nОснование: ч. 3 ст. 6 152-ФЗ.",
    subtasks: [
      "Выявить всех обработчиков ПДн по договорам",
      "Включить условия ч. 3 ст. 6 152-ФЗ в договоры/поручения",
      "Подписать поручения с каждым обработчиком",
    ],
    links: [["@", "Согласие на передачу ПДн третьим лицам", "complements"]],
  },
  // ── 03 · Классификация и модель угроз ИСПДн ────────────────────────────
  {
    theme: "03 · Классификация и модель угроз ИСПДн",
    title: "Технический паспорт ИСПДн",
    type: "other",
    description:
      "Технический паспорт на каждую ИСПДн: состав технических средств и ПО, СЗИ, схема размещения.\nОснование: приказ ФСТЭК № 21; методические документы ФСТЭК.",
    subtasks: [
      "Инвентаризация ТС и ПО каждой ИСПДн",
      "Описать установленные СЗИ и схему сети",
      "Оформить паспорт на каждую ИСПДн",
    ],
    links: [["@", "Акт классификации (обследования) ИСПДн", "complements"]],
  },
  {
    theme: "03 · Классификация и модель угроз ИСПДн",
    title: "Приказ о вводе ИСПДн в эксплуатацию",
    type: "order",
    description:
      "Вводит ИСПДн в эксплуатацию после оценки эффективности принимаемых мер защиты.\nОснование: приказ ФСТЭК № 21.",
    links: [["@", "Акт оценки эффективности принимаемых мер защиты ПДн", "requires"]],
  },
  {
    theme: "03 · Классификация и модель угроз ИСПДн",
    title: "Документы по сегментам региональных ГИС (Смета, РСЭД, АИС «Подросток»)",
    type: "other",
    description:
      "Документы участника региональных ГИС ЯНАО: ГИС «Смета», РСЭД, АИС «Подросток» — соглашения, акты подключения, обязательства оператора сегмента.\nОснование: приказ ФСТЭК № 17 (ГИС); регламенты операторов ГИС.",
    subtasks: [
      "Запросить у операторов ГИС требования к участникам",
      "Собрать соглашения и акты подключения",
      "Назначить ответственных за сегменты",
    ],
  },
  // ── 04 · СКЗИ (криптография) ───────────────────────────────────────────
  {
    theme: "04 · СКЗИ (криптография)",
    title: "Приказ о назначении ответственного пользователя СКЗИ",
    type: "order",
    description:
      "Назначает ответственного пользователя СКЗИ (орган криптографической защиты).\nОснование: приказ ФАПСИ № 152 от 13.06.2001.",
    links: [
      ["Приказ о мерах по обеспечению ЗИ при работе с криптографическими средствами", "@", "complements"],
    ],
  },
  {
    theme: "04 · СКЗИ (криптография)",
    title: "Приказ о допуске работников к работе с СКЗИ (перечень пользователей)",
    type: "order",
    description:
      "Утверждает перечень работников, допущенных к самостоятельной работе с СКЗИ.\nОснование: приказ ФАПСИ № 152; приказ ФСБ № 378 от 10.07.2014.",
    links: [
      ["Приказ о мерах по обеспечению ЗИ при работе с криптографическими средствами", "@", "complements"],
    ],
  },
  {
    theme: "04 · СКЗИ (криптография)",
    title: "Технический (аппаратный) журнал СКЗИ",
    type: "journal",
    description:
      "Поэкземплярный учёт аппаратных средств с установленными СКЗИ; лицевые счета пользователей СКЗИ.\nОснование: приказ ФАПСИ № 152.",
    links: [["@", "Журнал поэкземплярного учёта СКЗИ", "complements"]],
  },
  {
    theme: "04 · СКЗИ (криптография)",
    title: "Акты установки, ввода в эксплуатацию и уничтожения СКЗИ",
    type: "act",
    description:
      "Акты установки, ввода в эксплуатацию, изъятия и уничтожения СКЗИ и ключевых документов.\nОснование: приказ ФАПСИ № 152.",
  },
  {
    theme: "04 · СКЗИ (криптография)",
    title: "Журнал учёта хранилищ (сейфов) и ключей от них",
    type: "journal",
    description:
      "Учёт хранилищ ключевых документов и СКЗИ (сейфов) и ключей от них.\nОснование: приказ ФАПСИ № 152.",
  },
  // ── 05 · Доступ: помещения и ИС ────────────────────────────────────────
  {
    theme: "05 · Доступ: помещения и ИС",
    title: "Матрица доступа (разрешительная система доступа к ИС)",
    type: "list",
    description:
      "Разрешительная система доступа: кто к каким ресурсам ИС имеет доступ и с какими правами.\nОснование: меры ИАФ/УПД приказа ФСТЭК № 21.",
    subtasks: [
      "Инвентаризация ресурсов и ролей пользователей",
      "Составить матрицу «пользователь × ресурс × права»",
      "Утвердить и сверить с фактическими правами в ИС",
    ],
    links: [
      ["Положение об управлении доступом субъектов к объектам доступа в ИС", "@", "requires"],
    ],
  },
  // ── 06 · Носители и уничтожение ────────────────────────────────────────
  {
    theme: "06 · Носители и уничтожение",
    title: "Перечень мест хранения материальных носителей ПДн",
    type: "list",
    description:
      "Перечень мест хранения материальных носителей ПДн и лиц, ответственных за них.\nОснование: п. 13 ПП РФ № 687 от 15.09.2008.",
  },
  {
    theme: "06 · Носители и уничтожение",
    title: "Акт об уничтожении ПДн (форма) и журнал уничтожения",
    type: "act",
    description:
      "Форма акта об уничтожении ПДн и журнал регистрации уничтожения.\nОснование: приказ Роскомнадзора № 179 от 28.10.2022.",
    subtasks: ["Утвердить форму акта об уничтожении", "Завести журнал уничтожения ПДн"],
    links: [["Инструкция по порядку учёта, хранения и уничтожения ПДн", "@", "requires"]],
  },
  // ── 07 · Эксплуатация СЗИ и защитные меры ──────────────────────────────
  {
    theme: "07 · Эксплуатация СЗИ и защитные меры",
    title: "Регламент резервного копирования и восстановления",
    type: "instruction",
    description:
      "Порядок резервного копирования и восстановления: состав, периодичность, места хранения копий, проверка восстановимости.\nОснование: меры ОДТ приказа ФСТЭК № 21.",
    links: [["@", "Журнал резервного копирования", "requires"]],
  },
  // ── 08 · Контроль, планирование и инциденты ────────────────────────────
  {
    theme: "08 · Контроль, планирование и инциденты",
    title: "План реагирования на инциденты ИБ",
    type: "plan",
    description:
      "Порядок действий при инцидентах ИБ: выявление, локализация, оповещение, восстановление, разбор.\nОснование: меры ИНЦ приказа ФСТЭК № 21; для утечек ПДн — ст. 21 152-ФЗ.",
    links: [
      ["@", "Журнал учёта нештатных ситуаций", "requires"],
      ["@", "Порядок уведомления РКН об утечке ПДн (24 72 часа)", "complements"],
    ],
  },
  // ── 10 · Кадры и ответственность ───────────────────────────────────────
  {
    theme: "10 · Кадры и ответственность",
    title: "Обязательство о неразглашении ПДн (форма)",
    type: "other",
    description:
      "Форма обязательства (расписки) работника о неразглашении ПДн; подписывается всеми допущенными к обработке.\nОснование: ст. 7 152-ФЗ.",
    subtasks: [
      "Утвердить форму обязательства",
      "Собрать подписи со всех допущенных (по перечню)",
    ],
    links: [["Приказ о допуске сотрудников к обработке ПДн", "@", "requires"]],
  },
  // ── 11 · Сайт ──────────────────────────────────────────────────────────
  {
    theme: "11 · Сайт",
    title: "Приказ о назначении ответственного за сайт",
    type: "order",
    description:
      "Назначает ответственного за сайт ДОУ и размещение информации (в т.ч. соблюдение 152-ФЗ при публикациях).\nОснование: ч. 2 ст. 29 273-ФЗ «Об образовании»; ПП РФ № 1802 от 20.10.2021.",
  },
  {
    theme: "11 · Сайт",
    title: "Уведомление о cookie и метриках на сайте",
    type: "other",
    description:
      "Уведомление посетителей сайта об использовании cookie и систем аналитики (метрик) с получением согласия.\nОснование: 152-ФЗ (cookie и IP — ПДн); практика Роскомнадзора.",
    subtasks: [
      "Инвентаризация счётчиков и метрик на сайте",
      "Разместить баннер-уведомление о cookie",
      "Отразить cookie/метрики в публичной политике",
    ],
    links: [["@", "Политика в отношении обработки персональных данных (публичная)", "complements"]],
  },
  {
    theme: "11 · Сайт",
    title: "Согласие на обработку ПДн для форм обратной связи на сайте",
    type: "consent",
    description:
      "Текст согласия (чекбокс) для форм обратной связи и иных форм сбора данных на сайте.\nОснование: ст. 9 152-ФЗ.",
    links: [["@", "Политика в отношении обработки персональных данных (публичная)", "complements"]],
  },
];

async function ensureTheme(name: string, color: string, now: Date): Promise<string> {
  const [existing] = await sql<{ id: string }[]>`
    select id from projects
    where workspace_id = ${ORG_ID} and name = ${name} and archived_at is null limit 1`;
  if (existing) return existing.id;

  const projectId = randomUUID();
  const boardId = randomUUID();
  await sql`insert into projects ${sql({
    id: projectId,
    workspace_id: ORG_ID,
    slug: randomUUID().slice(0, 8),
    name,
    color,
    created_by: USER_ID,
    created_at: now,
    updated_at: now,
  })}`;
  await sql`insert into boards ${sql({ id: boardId, project_id: projectId, name: "Board", created_at: now })}`;
  const colKeys = generateNKeysBetween(null, null, LIFECYCLE.length);
  for (let i = 0; i < LIFECYCLE.length; i++) {
    await sql`insert into columns ${sql({
      id: randomUUID(),
      board_id: boardId,
      name: LIFECYCLE[i].name,
      color: LIFECYCLE[i].color,
      wip_limit: LIFECYCLE[i].wip,
      order_key: colKeys[i],
      created_at: now,
    })}`;
  }
  console.log(`  + проект «${name}»`);
  return projectId;
}

/** Колонка «Не начато» проекта (первая по order_key). */
async function firstColumn(projectId: string): Promise<string> {
  const [col] = await sql<{ id: string }[]>`
    select c.id from columns c
    join boards b on b.id = c.board_id
    where b.project_id = ${projectId}
    order by c.order_key asc limit 1`;
  if (!col) throw new Error(`У проекта ${projectId} нет колонок`);
  return col.id;
}

async function main() {
  // Санити: воркспейс уже засеян (защита от запуска не на той базе).
  const [base] = await sql<{ id: string }[]>`
    select id from projects
    where workspace_id = ${ORG_ID} and name = '01 · Базовый комплект ПДн' and archived_at is null limit 1`;
  if (!base) throw new Error("Базовые проекты ОРД не найдены — проверь ORG_ID/базу");

  const now = new Date();

  // Метки типов: только поиск существующих (создаёт сид).
  const labelIdByType = new Map<string, string>();
  for (const [typeKey, cfg] of Object.entries(ORD_TYPE_LABELS)) {
    const [row] = await sql<{ id: string }[]>`
      select id from labels where workspace_id = ${ORG_ID} and name = ${cfg.name} limit 1`;
    if (row) labelIdByType.set(typeKey, row.id);
  }

  const themeIds = new Map<string, string>();
  themeIds.set(NEW_THEME.name, await ensureTheme(NEW_THEME.name, NEW_THEME.color, now));

  const createdIdByTitle = new Map<string, string>();
  let created = 0;
  let skipped = 0;

  for (const doc of GAPS) {
    // Идемпотентность: по точному названию в воркспейсе.
    const [dup] = await sql<{ id: string }[]>`
      select id from tasks
      where workspace_id = ${ORG_ID} and title = ${doc.title}
        and parent_id is null and archived_at is null limit 1`;
    if (dup) {
      createdIdByTitle.set(doc.title, dup.id);
      skipped++;
      continue;
    }

    let projectId = themeIds.get(doc.theme);
    if (!projectId) {
      const [p] = await sql<{ id: string }[]>`
        select id from projects
        where workspace_id = ${ORG_ID} and name = ${doc.theme} and archived_at is null limit 1`;
      if (!p) throw new Error(`Проект «${doc.theme}» не найден`);
      projectId = p.id;
      themeIds.set(doc.theme, projectId);
    }
    const columnId = await firstColumn(projectId);

    // В конец колонки «Не начато».
    const [last] = await sql<{ order_key: string }[]>`
      select order_key from tasks
      where column_id = ${columnId} and parent_id is null
      order by order_key desc limit 1`;
    const [orderKey] = generateNKeysBetween(last?.order_key ?? null, null, 1);

    const taskId = randomUUID();
    await sql`insert into tasks ${sql({
      id: taskId,
      workspace_id: ORG_ID,
      project_id: projectId,
      column_id: columnId,
      title: doc.title,
      description: doc.description,
      type: "task",
      priority: "normal",
      color: "slate",
      order_key: orderKey,
      created_by: USER_ID,
      created_at: now,
      updated_at: now,
    })}`;
    createdIdByTitle.set(doc.title, taskId);

    const labelId = labelIdByType.get(doc.type);
    if (labelId) {
      await sql`insert into task_labels ${sql({
        task_id: taskId,
        label_id: labelId,
        created_at: now,
      })} on conflict do nothing`;
    }

    if (doc.subtasks?.length) {
      const subKeys = generateNKeysBetween(null, null, doc.subtasks.length);
      for (let s = 0; s < doc.subtasks.length; s++) {
        await sql`insert into tasks ${sql({
          id: randomUUID(),
          workspace_id: ORG_ID,
          project_id: projectId,
          column_id: columnId,
          parent_id: taskId,
          title: doc.subtasks[s],
          type: "task",
          priority: "normal",
          color: "slate",
          order_key: subKeys[s],
          created_by: USER_ID,
          created_at: now,
          updated_at: now,
        })}`;
      }
    }

    created++;
    console.log(`  + ${doc.theme} → ${doc.title}`);
  }

  // Связи — после создания всех задач ("@" = создаваемая задача).
  let linkCount = 0;
  for (const doc of GAPS) {
    for (const [src, tgt, type] of doc.links ?? []) {
      const resolve = async (key: string): Promise<string | null> => {
        if (key === "@") return createdIdByTitle.get(doc.title) ?? null;
        const cached = createdIdByTitle.get(key);
        if (cached) return cached;
        const [row] = await sql<{ id: string }[]>`
          select id from tasks
          where workspace_id = ${ORG_ID} and title = ${key}
            and parent_id is null and archived_at is null limit 1`;
        return row?.id ?? null;
      };
      const sourceId = await resolve(src);
      const targetId = await resolve(tgt);
      if (!sourceId || !targetId) {
        console.warn(`  ⚠ связь не разрешена: ${src} → ${tgt}`);
        continue;
      }
      const [dupLink] = await sql<{ id: string }[]>`
        select id from task_links
        where workspace_id = ${ORG_ID} and source_task_id = ${sourceId}
          and target_task_id = ${targetId} and type = ${type} limit 1`;
      if (dupLink) continue;
      await sql`insert into task_links ${sql({
        id: randomUUID(),
        workspace_id: ORG_ID,
        source_task_id: sourceId,
        target_task_id: targetId,
        type,
        created_by: USER_ID,
        created_at: now,
      })}`;
      linkCount++;
    }
  }

  console.log(`✔ Добивка ОРД: создано ${created}, пропущено (уже есть) ${skipped}, связей ${linkCount}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
