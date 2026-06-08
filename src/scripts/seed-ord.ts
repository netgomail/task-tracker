/**
 * Сид ОРД: тематическая структура (проект = комплект-тема), документы с
 * типами, связи между документами и шаблоны комплектов.
 *
 *   npx tsx --env-file=.env.local src/scripts/seed-ord.ts
 *
 * Перед запуском контент целевого воркспейса очищается (проекты + шаблоны),
 * так что скрипт идемпотентен. Колонки доски = жизненный цикл документа.
 */
import { randomUUID } from "node:crypto";

import { generateNKeysBetween } from "fractional-indexing";
import postgres from "postgres";

import { ORD_DESCRIPTIONS } from "./ord-descriptions";
import { ORD_SUBTASKS } from "./ord-subtasks";
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

type Doc = [title: string, type: string];
type Link = [source: string, target: string, type: string];
type Theme = { name: string; color: string; docs: Doc[]; links: Link[] };

const THEMES: Theme[] = [
  {
    name: "01 · Базовый комплект ПДн",
    color: "blue",
    docs: [
      ["Приказ о введении режима обработки ПДн", "order"],
      ["Приказ о назначении ответственного за обработку и обеспечение безопасности ПДн", "order"],
      ["Приказ о назначении администратора безопасности (АБ)", "order"],
      ["Приказ о допуске сотрудников к обработке ПДн", "order"],
      ["Положение о порядке организации и проведения работ по защите ПДн", "regulation"],
      ["Положение об обработке ПДн без использования средств автоматизации", "regulation"],
      ["Политика безопасности персональных данных", "policy"],
      ["Политика в отношении обработки персональных данных (публичная)", "policy"],
      ["Перечень ПДн, подлежащих защите", "list"],
      ["Перечень лиц, допущенных к обработке ПДн", "list"],
      ["Перечень информационных систем (ИС)", "list"],
      ["Перечень информационных ресурсов, подлежащих защите", "list"],
    ],
    links: [
      ["Приказ о введении режима обработки ПДн", "Политика безопасности персональных данных", "approves"],
      ["Приказ о введении режима обработки ПДн", "Перечень ПДн, подлежащих защите", "requires"],
      ["Приказ о введении режима обработки ПДн", "Положение о порядке организации и проведения работ по защите ПДн", "requires"],
      ["Приказ о допуске сотрудников к обработке ПДн", "Перечень лиц, допущенных к обработке ПДн", "requires"],
      ["Приказ о назначении ответственного за обработку и обеспечение безопасности ПДн", "Должностная инструкция ответственного за обработку и обеспечение безопасности ПДн", "requires"],
      ["Приказ о назначении администратора безопасности (АБ)", "Должностная инструкция администратора безопасности", "requires"],
    ],
  },
  {
    name: "02 · Согласия и запросы субъектов ПДн",
    color: "pink",
    docs: [
      ["Согласие работника на обработку ПДн", "consent"],
      ["Согласие родителя (законного представителя) на обработку ПДн воспитанника", "consent"],
      ["Согласие на использование фото/видео ребёнка", "consent"],
      ["Согласие на обработку специальных категорий ПДн (здоровье ребёнка)", "consent"],
      ["Согласие на передачу ПДн третьим лицам", "consent"],
      ["Согласие на обработку ПДн, разрешённых для распространения", "consent"],
      ["Форма отзыва согласия на обработку ПДн", "consent"],
      ["Согласие соискателя/контрагента на обработку ПДн", "consent"],
      ["Правила рассмотрения запросов субъектов ПДн или их представителей", "regulation"],
      ["Журнал учёта обращений и запросов субъектов ПДн", "journal"],
    ],
    links: [
      ["Правила рассмотрения запросов субъектов ПДн или их представителей", "Журнал учёта обращений и запросов субъектов ПДн", "requires"],
      ["Правила рассмотрения запросов субъектов ПДн или их представителей", "Форма отзыва согласия на обработку ПДн", "requires"],
    ],
  },
  {
    name: "03 · Классификация и модель угроз ИСПДн",
    color: "violet",
    docs: [
      ["Приказ о назначении комиссии для классификации ИС", "order"],
      ["Акт классификации (обследования) ИСПДн", "act"],
      ["Акт определения уровня защищённости ПДн", "act"],
      ["Модель угроз безопасности ПДн", "model"],
      ["Модель нарушителя безопасности информации", "model"],
      ["Перечень применяемых мер защиты ИСПДн", "list"],
      ["Акт оценки эффективности принимаемых мер защиты ПДн", "act"],
    ],
    links: [
      ["Приказ о назначении комиссии для классификации ИС", "Акт классификации (обследования) ИСПДн", "approves"],
      ["Акт классификации (обследования) ИСПДн", "Акт определения уровня защищённости ПДн", "requires"],
      ["Акт определения уровня защищённости ПДн", "Модель угроз безопасности ПДн", "requires"],
      ["Модель угроз безопасности ПДн", "Модель нарушителя безопасности информации", "complements"],
      ["Модель угроз безопасности ПДн", "Перечень применяемых мер защиты ИСПДн", "requires"],
      ["Перечень применяемых мер защиты ИСПДн", "Акт оценки эффективности принимаемых мер защиты ПДн", "requires"],
    ],
  },
  {
    name: "04 · СКЗИ (криптография)",
    color: "rose",
    docs: [
      ["Приказ о мерах по обеспечению ЗИ при работе с криптографическими средствами", "order"],
      ["Инструкция по обращению с СКЗИ", "instruction"],
      ["Журнал поэкземплярного учёта СКЗИ", "journal"],
    ],
    links: [
      ["Приказ о мерах по обеспечению ЗИ при работе с криптографическими средствами", "Инструкция по обращению с СКЗИ", "requires"],
      ["Приказ о мерах по обеспечению ЗИ при работе с криптографическими средствами", "Журнал поэкземплярного учёта СКЗИ", "requires"],
    ],
  },
  {
    name: "05 · Доступ: помещения и ИС",
    color: "cyan",
    docs: [
      ["Приказ об утверждении границ контролируемой зоны ИС", "order"],
      ["Приказ об организации доступа в помещения для обработки информации ограниченного доступа", "order"],
      ["Положение об управлении доступом субъектов к объектам доступа в ИС", "regulation"],
      ["Журнал установки пломб на рабочие места сотрудников", "journal"],
    ],
    links: [
      ["Приказ об организации доступа в помещения для обработки информации ограниченного доступа", "Положение об управлении доступом субъектов к объектам доступа в ИС", "requires"],
      ["Приказ об утверждении границ контролируемой зоны ИС", "Приказ об организации доступа в помещения для обработки информации ограниченного доступа", "complements"],
    ],
  },
  {
    name: "06 · Носители и уничтожение",
    color: "amber",
    docs: [
      ["Приказ о назначении комиссии по уничтожению документов с ПДн", "order"],
      ["Инструкция по порядку учёта, хранения и уничтожения ПДн", "instruction"],
      ["Инструкция по порядку учёта, хранения съёмных носителей ПДн", "instruction"],
      ["Журнал учёта машинных носителей информации", "journal"],
      ["Журнал учёта съёмных носителей информации", "journal"],
    ],
    links: [
      ["Приказ о назначении комиссии по уничтожению документов с ПДн", "Инструкция по порядку учёта, хранения и уничтожения ПДн", "requires"],
      ["Инструкция по порядку учёта, хранения съёмных носителей ПДн", "Журнал учёта съёмных носителей информации", "requires"],
      ["Инструкция по порядку учёта, хранения и уничтожения ПДн", "Журнал учёта машинных носителей информации", "requires"],
    ],
  },
  {
    name: "07 · Эксплуатация СЗИ и защитные меры",
    color: "teal",
    docs: [
      ["Инструкция по эксплуатации средств защиты информации (СЗИ)", "instruction"],
      ["Инструкция по организации антивирусной защиты ИС", "instruction"],
      ["Инструкция по организации парольной защиты ИС (парольная политика)", "instruction"],
      ["Инструкция по работе в сети Интернет", "instruction"],
      ["Инструкция по модификации технических и программных средств", "instruction"],
      ["Положение о регистрации и обработке событий безопасности", "regulation"],
      ["Правила и процедуры ограничения программной среды", "regulation"],
      ["Перечень разрешённого к установке ПО", "list"],
      ["Перечень эксплуатационной и технической документации СрЗИ", "list"],
      ["Журнал учёта СрЗИ, эксплуатационной и технической документации", "journal"],
      ["Журнал резервного копирования", "journal"],
      ["Журнал периодического тестирования СЗИ", "journal"],
      ["Журнал антивирусных проверок информационных ресурсов", "journal"],
    ],
    links: [
      ["Инструкция по организации антивирусной защиты ИС", "Журнал антивирусных проверок информационных ресурсов", "requires"],
      ["Инструкция по эксплуатации средств защиты информации (СЗИ)", "Журнал периодического тестирования СЗИ", "requires"],
      ["Инструкция по эксплуатации средств защиты информации (СЗИ)", "Журнал учёта СрЗИ, эксплуатационной и технической документации", "requires"],
      ["Правила и процедуры ограничения программной среды", "Перечень разрешённого к установке ПО", "requires"],
    ],
  },
  {
    name: "08 · Контроль, планирование и инциденты",
    color: "green",
    docs: [
      ["Приказ о проведении мероприятий (работ) по защите ПДн", "order"],
      ["Приказ об утверждении порядка планирования мероприятий по ЗИ в ИС", "order"],
      ["Приказ о проведении внутреннего контроля состояния ЗИ", "order"],
      ["План мероприятий по защите информации", "plan"],
      ["Журнал учёта мероприятий по защите ПДн", "journal"],
      ["Журнал учёта нештатных ситуаций", "journal"],
    ],
    links: [
      ["Приказ об утверждении порядка планирования мероприятий по ЗИ в ИС", "План мероприятий по защите информации", "requires"],
      ["Приказ о проведении мероприятий (работ) по защите ПДн", "Журнал учёта мероприятий по защите ПДн", "requires"],
      ["Приказ о проведении внутреннего контроля состояния ЗИ", "Журнал учёта нештатных ситуаций", "requires"],
    ],
  },
  {
    name: "09 · Роскомнадзор",
    color: "orange",
    docs: [
      ["Уведомление в Роскомнадзор об обработке ПДн", "other"],
      ["Порядок уведомления РКН об утечке ПДн (24/72 часа)", "regulation"],
      ["Оценка вреда субъектам ПДн", "act"],
    ],
    links: [
      ["Порядок уведомления РКН об утечке ПДн (24/72 часа)", "Оценка вреда субъектам ПДн", "requires"],
    ],
  },
  {
    name: "10 · Кадры и ответственность",
    color: "slate",
    docs: [
      ["Должностная инструкция ответственного за обработку и обеспечение безопасности ПДн", "job_description"],
      ["Должностная инструкция администратора безопасности", "job_description"],
      ["Инструкция пользователя", "instruction"],
    ],
    links: [],
  },
];

// Темы, из которых соберём шаблоны комплектов для «Создать из комплекта».
const SET_TEMPLATE_THEMES = new Set([
  "04 · СКЗИ (криптография)",
  "05 · Доступ: помещения и ИС",
  "06 · Носители и уничтожение",
]);

const REVIEW_TYPES = new Set(["policy", "model", "regulation"]);

function slugFor(): string {
  return randomUUID().slice(0, 8);
}

async function main() {
  // Очистка контента воркспейса (идемпотентность).
  await sql`delete from projects where workspace_id = ${ORG_ID}`;
  await sql`delete from document_set_templates where workspace_id = ${ORG_ID}`;

  const now = new Date();
  const reviewAt = new Date(now);
  reviewAt.setFullYear(reviewAt.getFullYear() + 1);

  const globalKeyToId = new Map<string, string>(); // title -> taskId

  // Метки типов документов (find-or-create по имени), тип-ключ → labelId.
  const typeToLabelId = new Map<string, string>();
  for (const [typeKey, cfg] of Object.entries(ORD_TYPE_LABELS)) {
    const [existing] = await sql<{ id: string }[]>`
      select id from labels where workspace_id = ${ORG_ID} and name = ${cfg.name} limit 1`;
    let id = existing?.id;
    if (!id) {
      id = randomUUID();
      await sql`insert into labels ${sql({
        id,
        workspace_id: ORG_ID,
        name: cfg.name,
        color: cfg.color,
        icon: cfg.icon,
        created_at: now,
      })} on conflict do nothing`;
    } else {
      await sql`update labels set color = ${cfg.color}, icon = ${cfg.icon} where id = ${id}`;
    }
    typeToLabelId.set(typeKey, id);
  }

  for (const theme of THEMES) {
    const projectId = randomUUID();
    const boardId = randomUUID();
    const slug = slugFor();

    await sql`insert into projects ${sql({
      id: projectId,
      workspace_id: ORG_ID,
      slug,
      name: theme.name,
      color: theme.color,
      created_by: USER_ID,
      created_at: now,
      updated_at: now,
    })}`;
    await sql`insert into boards ${sql({ id: boardId, project_id: projectId, name: "Board", created_at: now })}`;

    const colKeys = generateNKeysBetween(null, null, LIFECYCLE.length);
    const columnIds: string[] = [];
    for (let i = 0; i < LIFECYCLE.length; i++) {
      const cid = randomUUID();
      columnIds.push(cid);
      await sql`insert into columns ${sql({
        id: cid,
        board_id: boardId,
        name: LIFECYCLE[i].name,
        color: LIFECYCLE[i].color,
        wip_limit: LIFECYCLE[i].wip,
        order_key: colKeys[i],
        created_at: now,
      })}`;
    }
    const firstColumn = columnIds[0];

    const taskKeys = generateNKeysBetween(null, null, Math.max(theme.docs.length, 1));
    for (let i = 0; i < theme.docs.length; i++) {
      const [title, docType] = theme.docs[i];
      const taskId = randomUUID();
      globalKeyToId.set(title, taskId);
      await sql`insert into tasks ${sql({
        id: taskId,
        workspace_id: ORG_ID,
        project_id: projectId,
        column_id: firstColumn,
        title,
        description: ORD_DESCRIPTIONS[title] ?? null,
        type: "task",
        priority: "normal",
        color: "slate",
        order_key: taskKeys[i],
        review_at: REVIEW_TYPES.has(docType) ? reviewAt : null,
        created_by: USER_ID,
        created_at: now,
        updated_at: now,
      })}`;

      // Тип документа — метка.
      const labelId = typeToLabelId.get(docType);
      if (labelId) {
        await sql`insert into task_labels ${sql({
          task_id: taskId,
          label_id: labelId,
          created_at: now,
        })} on conflict do nothing`;
      }

      // Осмысленные подзадачи (только у документов с разнородной работой).
      const subs = ORD_SUBTASKS[title];
      if (subs?.length) {
        const subKeys = generateNKeysBetween(null, null, subs.length);
        for (let s = 0; s < subs.length; s++) {
          await sql`insert into tasks ${sql({
            id: randomUUID(),
            workspace_id: ORG_ID,
            project_id: projectId,
            column_id: firstColumn,
            parent_id: taskId,
            title: subs[s],
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
    }
  }

  // Связи (в т.ч. кросс-тематические) — после создания всех задач.
  let linkCount = 0;
  for (const theme of THEMES) {
    for (const [src, tgt, type] of theme.links) {
      const sourceId = globalKeyToId.get(src);
      const targetId = globalKeyToId.get(tgt);
      if (!sourceId || !targetId) {
        console.warn(`  ⚠ связь не разрешена: ${src} → ${tgt}`);
        continue;
      }
      await sql`insert into task_links ${sql({
        id: randomUUID(),
        workspace_id: ORG_ID,
        source_task_id: sourceId,
        target_task_id: targetId,
        type,
        created_by: USER_ID,
        created_at: now,
      })} on conflict do nothing`;
      linkCount++;
    }
  }

  // Шаблоны комплектов из выбранных тем.
  let setCount = 0;
  for (const theme of THEMES) {
    if (!SET_TEMPLATE_THEMES.has(theme.name)) continue;
    const items = theme.docs.map(([title, docType]) => ({
      key: title,
      title,
      type: "task",
      labels: ORD_TYPE_LABELS[docType] ? [ORD_TYPE_LABELS[docType].name] : [],
    }));
    const links = theme.links.map(([sourceKey, targetKey, type]) => ({ sourceKey, targetKey, type }));
    await sql`insert into document_set_templates ${sql({
      id: randomUUID(),
      workspace_id: ORG_ID,
      name: theme.name.replace(/^\d+\s·\s/, ""),
      description: `Готовый комплект: ${items.length} документов`,
      color: theme.color,
      items: JSON.stringify(items),
      links: JSON.stringify(links),
      created_by: USER_ID,
      created_at: now,
      updated_at: now,
    })}`;
    setCount++;
  }

  const totalDocs = THEMES.reduce((n, t) => n + t.docs.length, 0);
  console.log(`✔ Сид ОРД: ${THEMES.length} тем, ${totalDocs} документов, ${linkCount} связей, ${setCount} шаблонов комплектов`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
