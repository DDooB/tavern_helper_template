import { Schema as MvuSchema } from '../../schema';
import type { Schema as MvuStatData } from '../../schema';

type PartySlot = 'Slot1' | 'Slot2' | 'Slot3';
type DrawType = 'normal' | 'advanced';
type PartnerGrade = 'EX' | 'S' | 'A' | 'B' | 'C' | 'D';
type PartnerClass = 'tank' | 'dps' | 'heal' | 'support' | 'allRound';

type PartnerMeta = {
  Name: string;
  Grade: PartnerGrade;
  Class: PartnerClass;
  Job: string;
};

type PartnerState = {
  Level: number;
  Affinity: number;
  LoveLevel: number;
  Fatigue: number;
  Alive: boolean;
  InParty: boolean;
};

type PartnerProfileKeys = {
  BriefKey: string;
  DetailKey: string;
};

type PartnerRecord = {
  Id: string;
  Meta: PartnerMeta;
  State: PartnerState;
  ProfileKeys: PartnerProfileKeys;
  UpdatedAt: number;
};

type PoolPartner = {
  Id: string;
  Name: string;
  Grade: PartnerGrade;
  Class: PartnerClass;
  Job: string;
  BriefKey: string;
  DetailKey: string;
};

type PartnerDbState = {
  partnerDb: Record<string, PartnerRecord>;
  runtime: {
    briefQueue: string[];
    csvUrl: string;
    pool: Record<string, PoolPartner>;
    lastPoolSyncAt: number;
  };
};

type PartySlotData = Exclude<MvuStatData['User']['PartySlotData'][PartySlot], ''>;

type NewPartnerInput = {
  Id: string;
  Name: string;
  Grade: string;
  Class: string;
  Job: string;
  Level?: number;
  Affinity?: number;
  LoveLevel?: number;
  BriefKey?: string;
  DetailKey?: string;
};

type DrawResult = {
  ok: boolean;
  code:
    | 'ok'
    | 'insufficient_sdp'
    | 'empty_pool'
    | 'pickup_not_found'
    | 'custom_name_exists_in_pool'
    | 'custom_id_exists'
    | 'pool_csv_fetch_failed'
    | 'invalid_grade'
    | 'invalid_class';
  message: string;
  spent: number;
  refund: number;
  partnerId?: string;
  partnerName?: string;
  isDuplicate?: boolean;
};

type SdhSnapshot = {
  sdp: number;
  ownedCount: number;
  inPartyCount: number;
  poolCount: number;
  csvUrl: string;
  lastPoolSyncAt: number;
  partySlots: Record<PartySlot, string>;
  stat: Pick<MvuStatData, 'User' | 'Mission'>;
  pool: PoolPartner[];
  ownedPartners: Array<{
    Id: string;
    Name: string;
    Grade: PartnerGrade;
    Class: PartnerClass;
    Job: string;
    InParty: boolean;
    Alive: boolean;
    Level: number;
  }>;
};

type SdhApi = {
  getSnapshot: () => Promise<SdhSnapshot>;
  setPoolCsvUrl: (url: string) => Promise<void>;
  refreshPoolFromCsv: () => Promise<{ ok: boolean; message: string; count: number }>;
  drawGacha: (drawType: DrawType) => Promise<DrawResult>;
  pickupByName: (name: string) => Promise<DrawResult>;
  registerCustomPartner: (input: NewPartnerInput) => Promise<DrawResult>;
  addPartnerToParty: (partnerId: string, slot?: PartySlot) => Promise<boolean>;
  removePartnerFromParty: (partnerIdOrSlot: string) => Promise<boolean>;
  grantSdp: (amount: number) => Promise<number>;
  queueBriefProfile: (partnerId: string) => void;
  syncNow: () => Promise<void>;
};

const CHAT_STORE_PATH = 'sdh';
const SLOTS: PartySlot[] = ['Slot1', 'Slot2', 'Slot3'];
const COST_NORMAL = 1000;
const COST_ADVANCED = 5000;
const COST_PICKUP = 50000;
const COST_CUSTOM = 10000;

const RATE_NORMAL: Array<{ grade: string; weight: number }> = [
  { grade: 'EX', weight: 0.1 },
  { grade: 'S', weight: 1 },
  { grade: 'A', weight: 5 },
  { grade: 'B', weight: 15 },
  { grade: 'C', weight: 30 },
  { grade: 'D', weight: 48.9 },
];

const RATE_ADVANCED: Array<{ grade: string; weight: number }> = [
  { grade: 'EX', weight: 2 },
  { grade: 'S', weight: 8 },
  { grade: 'A', weight: 20 },
  { grade: 'B', weight: 30 },
  { grade: 'C', weight: 40 },
  { grade: 'D', weight: 0 },
];

const PARTNER_GRADES: PartnerGrade[] = ['EX', 'S', 'A', 'B', 'C', 'D'];

function tryNormalizeGrade(raw: string): PartnerGrade | null {
  const value = raw.trim().toUpperCase();
  return PARTNER_GRADES.includes(value as PartnerGrade) ? (value as PartnerGrade) : null;
}

function normalizeGrade(raw: string, fallback: PartnerGrade = 'D'): PartnerGrade {
  return tryNormalizeGrade(raw) ?? fallback;
}

function tryNormalizeClass(raw: string): PartnerClass | null {
  const value = raw.trim().toLowerCase();
  if (value === 'tank') return 'tank';
  if (value === 'dps') return 'dps';
  if (value === 'heal' || value === 'healer') return 'heal';
  if (value === 'support') return 'support';
  if (
    value === 'allround' ||
    value === 'all_round' ||
    value === 'all-round' ||
    value === 'allrounder' ||
    value === 'all-rounder'
  ) {
    return 'allRound';
  }
  return null;
}

function normalizeClass(raw: string, fallback: PartnerClass = 'support'): PartnerClass {
  return tryNormalizeClass(raw) ?? fallback;
}

function normalizePartnerId(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase();
}

function defaultBriefKey(id: string): string {
  return `{{SDH_BRIEF_${id.toUpperCase()}}}`;
}

function defaultDetailKey(id: string): string {
  return `{{SDH_DETAIL_${id.toUpperCase()}}}`;
}

function now(): number {
  return Date.now();
}

function toSafeInt(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function clampState(state: PartnerState): PartnerState {
  const next = { ...state };
  next.Level = Math.max(1, toSafeInt(next.Level, 1));
  next.Fatigue = _.clamp(toSafeInt(next.Fatigue, 0), 0, 100);
  next.LoveLevel = _.clamp(toSafeInt(next.LoveLevel, 0), -5, 5);
  next.Affinity = toSafeInt(next.Affinity, 0);
  while (next.Affinity >= 100 && next.LoveLevel < 5) {
    next.Affinity -= 100;
    next.LoveLevel += 1;
  }
  while (next.Affinity <= -100 && next.LoveLevel > -5) {
    next.Affinity += 100;
    next.LoveLevel -= 1;
  }
  next.Affinity = _.clamp(next.Affinity, -99, 99);
  if (!next.Alive) next.InParty = false;
  return next;
}

function makePartnerRecord(input: NewPartnerInput): PartnerRecord {
  const id = normalizePartnerId(input.Id);
  return {
    Id: id,
    Meta: {
      Name: input.Name.trim(),
      Grade: normalizeGrade(input.Grade),
      Class: normalizeClass(input.Class),
      Job: input.Job.trim() || '미정',
    },
    State: clampState({
      Level: input.Level ?? 1,
      Affinity: input.Affinity ?? 0,
      LoveLevel: input.LoveLevel ?? 0,
      Fatigue: 0,
      Alive: true,
      InParty: false,
    }),
    ProfileKeys: {
      BriefKey: (input.BriefKey ?? defaultBriefKey(id)).trim(),
      DetailKey: (input.DetailKey ?? defaultDetailKey(id)).trim(),
    },
    UpdatedAt: now(),
  };
}

function makePoolPartner(input: {
  id: string;
  name: string;
  grade?: string;
  clazz?: string;
  job?: string;
  briefKey?: string;
  detailKey?: string;
}): PoolPartner {
  const id = normalizePartnerId(input.id || input.name);
  return {
    Id: id,
    Name: input.name.trim() || id,
    Grade: normalizeGrade(input.grade ?? 'D'),
    Class: normalizeClass(input.clazz ?? 'support'),
    Job: (input.job ?? '미정').trim() || '미정',
    BriefKey: (input.briefKey ?? defaultBriefKey(id)).trim(),
    DetailKey: (input.detailKey ?? defaultDetailKey(id)).trim(),
  };
}

function defaultStore(): PartnerDbState {
  const luna = makePartnerRecord({
    Id: 'luna',
    Name: 'Luna',
    Grade: 'B',
    Class: 'support',
    Job: '정보 중개인',
    Level: 1,
    Affinity: 15,
    LoveLevel: 0,
  });
  luna.State.InParty = true;
  luna.State.Fatigue = 20;

  const rhea = makePartnerRecord({
    Id: 'rhea',
    Name: 'Rhea',
    Grade: 'C',
    Class: 'heal',
    Job: '전투 의무관',
    Level: 1,
    Affinity: -5,
    LoveLevel: 0,
  });
  rhea.State.Fatigue = 10;

  const pool: Record<string, PoolPartner> = {
    luna: makePoolPartner({ id: 'luna', name: 'Luna', grade: 'B', clazz: 'support', job: '정보 중개인' }),
    rhea: makePoolPartner({ id: 'rhea', name: 'Rhea', grade: 'C', clazz: 'heal', job: '전투 의무관' }),
  };

  return {
    partnerDb: { luna, rhea },
    runtime: {
      briefQueue: [],
      csvUrl: '',
      pool,
      lastPoolSyncAt: 0,
    },
  };
}

function readStore(): PartnerDbState {
  const variables = getVariables({ type: 'chat' });
  const raw = _.cloneDeep(_.get(variables, CHAT_STORE_PATH)) as Partial<PartnerDbState> | undefined;
  if (!raw || !_.isPlainObject(raw)) return defaultStore();

  const fallback = defaultStore();
  const store: PartnerDbState = {
    partnerDb: (_.isPlainObject(raw.partnerDb) ? raw.partnerDb : fallback.partnerDb) as Record<string, PartnerRecord>,
    runtime: {
      briefQueue: Array.isArray(raw.runtime?.briefQueue) ? raw.runtime!.briefQueue.map(String) : [],
      csvUrl: typeof raw.runtime?.csvUrl === 'string' ? raw.runtime.csvUrl : '',
      pool: (_.isPlainObject(raw.runtime?.pool) ? raw.runtime!.pool : fallback.runtime.pool) as Record<string, PoolPartner>,
      lastPoolSyncAt: Number(raw.runtime?.lastPoolSyncAt ?? 0),
    },
  };
  return store;
}

function sanitizeStoreValues(store: PartnerDbState): void {
  for (const partner of Object.values(store.partnerDb)) {
    partner.Meta.Grade = normalizeGrade(partner.Meta.Grade, 'D');
    partner.Meta.Class = normalizeClass(partner.Meta.Class, 'support');
  }

  for (const key of Object.keys(store.runtime.pool)) {
    const item = store.runtime.pool[key];
    store.runtime.pool[key] = {
      ...item,
      Grade: normalizeGrade(item.Grade, 'D'),
      Class: normalizeClass(item.Class, 'support'),
    };
  }
}

function writeStore(store: PartnerDbState): void {
  updateVariablesWith(vars => {
    _.set(vars, CHAT_STORE_PATH, store);
    return vars;
  }, { type: 'chat' });
}

function ensureStore(): PartnerDbState {
  const store = readStore();
  sanitizeStoreValues(store);
  if (Object.keys(store.partnerDb).length === 0) {
    const seeded = defaultStore();
    writeStore(seeded);
    return seeded;
  }
  if (Object.keys(store.runtime.pool).length === 0) {
    store.runtime.pool = defaultStore().runtime.pool;
    writeStore(store);
  }
  return store;
}

function partnerIdsInParty(store: PartnerDbState): string[] {
  return Object.values(store.partnerDb)
    .filter(partner => partner.State.InParty && partner.State.Alive)
    .map(partner => partner.Id)
    .slice(0, SLOTS.length);
}

function updateInPartyFlags(store: PartnerDbState, partyIds: string[]): void {
  const partySet = new Set(partyIds);
  for (const partner of Object.values(store.partnerDb)) {
    partner.State.InParty = partner.State.Alive && partySet.has(partner.Id);
    partner.State = clampState(partner.State);
    partner.UpdatedAt = now();
  }
}

function parseStatData(statData: unknown): MvuStatData {
  return MvuSchema.parse(statData);
}

function toPartySlotData(partner: PartnerRecord): PartySlotData {
  return {
    PartnerId: partner.Id,
    Name: partner.Meta.Name,
    Level: partner.State.Level,
    Grade: partner.Meta.Grade,
    Class: partner.Meta.Class,
    Job: partner.Meta.Job,
    Affinity: partner.State.Affinity,
    LoveLevel: partner.State.LoveLevel,
    Fatigue: partner.State.Fatigue,
    Alive: partner.State.Alive,
  };
}

function applyStoreToStatData(store: PartnerDbState, statData: MvuStatData): void {
  const partyIds = partnerIdsInParty(store);
  for (let index = 0; index < SLOTS.length; index += 1) {
    const slot = SLOTS[index];
    const id = partyIds[index] ?? '';
    statData.User.PartySlots[slot] = id;
    if (!id || !store.partnerDb[id]) {
      statData.User.PartySlotData[slot] = '';
      continue;
    }
    statData.User.PartySlotData[slot] = toPartySlotData(store.partnerDb[id]);
  }
  statData.User._OwnedPartnerCount = Object.keys(store.partnerDb).length;
}

function applyStatDataToStore(store: PartnerDbState, statData: MvuStatData): void {
  const requested = SLOTS.map(slot => statData.User.PartySlots[slot]).filter(Boolean);
  const validIds = _(requested)
    .uniq()
    .filter(id => Boolean(store.partnerDb[id] && store.partnerDb[id].State.Alive))
    .take(SLOTS.length)
    .value();

  updateInPartyFlags(store, validIds);

  for (const slot of SLOTS) {
    const id = statData.User.PartySlots[slot];
    if (!id || !store.partnerDb[id]) continue;
    const slotData = statData.User.PartySlotData[slot];
    if (slotData === '') continue;

    store.partnerDb[id].State = clampState({
      Level: slotData.Level,
      Affinity: slotData.Affinity,
      LoveLevel: slotData.LoveLevel,
      Fatigue: slotData.Fatigue,
      Alive: slotData.Alive,
      InParty: true,
    });
    store.partnerDb[id].Meta.Name = slotData.Name.trim() || store.partnerDb[id].Meta.Name;
    store.partnerDb[id].Meta.Grade = normalizeGrade(slotData.Grade, store.partnerDb[id].Meta.Grade);
    store.partnerDb[id].Meta.Class = normalizeClass(slotData.Class, store.partnerDb[id].Meta.Class);
    store.partnerDb[id].Meta.Job = slotData.Job.trim() || store.partnerDb[id].Meta.Job;
    store.partnerDb[id].UpdatedAt = now();
  }
}

async function syncMessageStatDataFromStore(store: PartnerDbState): Promise<void> {
  await waitGlobalInitialized('Mvu');
  const mvuData = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
  const statData = parseStatData(mvuData.stat_data);
  applyStoreToStatData(store, statData);
  mvuData.stat_data = statData;
  await Mvu.replaceMvuData(mvuData, { type: 'message', message_id: 'latest' });
}

function enqueueBriefProfiles(ids: string[]): void {
  if (ids.length === 0) return;
  const store = ensureStore();
  const queue = new Set(store.runtime.briefQueue);
  for (const id of ids) {
    const normalized = normalizePartnerId(id);
    const partner = store.partnerDb[normalized];
    if (!partner) continue;
    if (partner.State.InParty || !partner.State.Alive) continue;
    queue.add(normalized);
  }
  store.runtime.briefQueue = Array.from(queue);
  writeStore(store);
}

function consumeBriefQueue(store: PartnerDbState): string[] {
  const queue = [...store.runtime.briefQueue];
  store.runtime.briefQueue = [];
  return queue;
}

function injectProfileTokens(tokens: string[]): void {
  if (tokens.length === 0) return;
  injectPrompts(
    tokens.map((token, index) => ({
      id: `sdh_profile_${now()}_${index}`,
      position: 'none' as const,
      depth: 0,
      role: 'system' as const,
      content: token,
      should_scan: true,
    })),
    { once: true },
  );
}

function buildProfileTokens(store: PartnerDbState, briefIds: string[]): string[] {
  const detailTokens = partnerIdsInParty(store)
    .map(id => store.partnerDb[id]?.ProfileKeys.DetailKey)
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '');

  const briefTokens = briefIds
    .map(id => store.partnerDb[id])
    .filter((partner): partner is PartnerRecord => Boolean(partner))
    .filter(partner => !partner.State.InParty && partner.State.Alive)
    .map(partner => partner.ProfileKeys.BriefKey)
    .filter(token => token.trim() !== '');

  return _.uniq([...detailTokens, ...briefTokens]);
}

function findMentionedOwnedPartners(message: string, store: PartnerDbState): string[] {
  const normalizedMessage = message.toLowerCase();
  const hits: string[] = [];
  for (const partner of Object.values(store.partnerDb)) {
    if (partner.State.InParty || !partner.State.Alive) continue;
    const candidates = [partner.Id, partner.Meta.Name].map(value => value.toLowerCase()).filter(value => value.length > 0);
    if (candidates.some(candidate => normalizedMessage.includes(candidate))) {
      hits.push(partner.Id);
    }
  }
  return _.uniq(hits);
}

async function readSdp(): Promise<number> {
  await waitGlobalInitialized('Mvu');
  const mvuData = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
  const statData = parseStatData(mvuData.stat_data);
  return Math.max(0, Math.trunc(statData.User.SDP));
}

async function grantSdp(amount: number): Promise<number> {
  const delta = Math.trunc(amount);
  await waitGlobalInitialized('Mvu');
  const mvuData = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
  const statData = parseStatData(mvuData.stat_data);
  statData.User.SDP = Math.max(0, Math.trunc(statData.User.SDP + delta));
  mvuData.stat_data = statData;
  await Mvu.replaceMvuData(mvuData, { type: 'message', message_id: 'latest' });
  return statData.User.SDP;
}

async function spendSdp(cost: number): Promise<boolean> {
  const current = await readSdp();
  if (current < cost) return false;
  await grantSdp(-cost);
  return true;
}

function pickByWeight(table: Array<{ grade: string; weight: number }>): string {
  const total = table.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return 'D';
  let roll = Math.random() * total;
  for (const item of table) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item.grade;
  }
  return table[table.length - 1]?.grade ?? 'D';
}

function randomChoice<T>(list: T[]): T {
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

function findPoolByName(pool: Record<string, PoolPartner>, name: string): PoolPartner | null {
  const target = normalizeName(name);
  return Object.values(pool).find(item => normalizeName(item.Name) === target) ?? null;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let value = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      result.push(value);
      value = '';
      continue;
    }
    value += ch;
  }
  result.push(value);
  return result.map(cell => cell.trim());
}

function resolveHeaderIndex(headers: string[], aliases: string[]): number {
  const lowered = headers.map(h => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = lowered.indexOf(alias.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function parsePoolCsv(csvText: string): Record<string, PoolPartner> {
  const lines = csvText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '');
  if (lines.length < 2) return {};

  const headers = parseCsvLine(lines[0]);
  const idIdx = resolveHeaderIndex(headers, ['id', 'partner_id', '파트너id', '파트너 id']);
  const nameIdx = resolveHeaderIndex(headers, ['name', 'partner_name', '이름', '파트너명', 'partner']);
  const gradeIdx = resolveHeaderIndex(headers, ['grade', '등급']);
  const classIdx = resolveHeaderIndex(headers, ['class', 'clazz', '클래스']);
  const jobIdx = resolveHeaderIndex(headers, ['job', '직업']);
  const briefIdx = resolveHeaderIndex(headers, ['brief_key', 'brief', '간단키', '간단프로필키']);
  const detailIdx = resolveHeaderIndex(headers, ['detail_key', 'detail', '상세키', '상세프로필키']);

  const pool: Record<string, PoolPartner> = {};
  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const rawName = nameIdx >= 0 ? row[nameIdx] ?? '' : '';
    if (rawName.trim() === '') continue;
    const rawId = idIdx >= 0 ? row[idIdx] ?? rawName : rawName;
    const item = makePoolPartner({
      id: rawId,
      name: rawName,
      grade: gradeIdx >= 0 ? row[gradeIdx] : 'D',
      clazz: classIdx >= 0 ? row[classIdx] : 'support',
      job: jobIdx >= 0 ? row[jobIdx] : '미정',
      briefKey: briefIdx >= 0 ? row[briefIdx] : undefined,
      detailKey: detailIdx >= 0 ? row[detailIdx] : undefined,
    });
    pool[item.Id] = item;
  }
  return pool;
}

function isDuplicateOwned(store: PartnerDbState, partner: PoolPartner): boolean {
  if (store.partnerDb[partner.Id]) return true;
  const targetName = normalizeName(partner.Name);
  return Object.values(store.partnerDb).some(item => normalizeName(item.Meta.Name) === targetName);
}

async function registerPartnerFromPool(partner: PoolPartner): Promise<DrawResult> {
  const store = ensureStore();
  if (isDuplicateOwned(store, partner)) {
    const refund = Math.trunc(COST_NORMAL / 2);
    return {
      ok: true,
      code: 'ok',
      message: `${partner.Name} 중복 소환: SDP 50% 환급`,
      spent: 0,
      refund,
      partnerId: partner.Id,
      partnerName: partner.Name,
      isDuplicate: true,
    };
  }

  const record = makePartnerRecord({
    Id: partner.Id,
    Name: partner.Name,
    Grade: partner.Grade,
    Class: partner.Class,
    Job: partner.Job,
    BriefKey: partner.BriefKey,
    DetailKey: partner.DetailKey,
  });
  store.partnerDb[record.Id] = record;
  store.runtime.briefQueue = _.uniq([...store.runtime.briefQueue, record.Id]);
  writeStore(store);
  await syncMessageStatDataFromStore(store);

  return {
    ok: true,
    code: 'ok',
    message: `${record.Meta.Name} 소환 성공`,
    spent: 0,
    refund: 0,
    partnerId: record.Id,
    partnerName: record.Meta.Name,
    isDuplicate: false,
  };
}

async function addPartnerToParty(partnerId: string, preferredSlot?: PartySlot): Promise<boolean> {
  const id = normalizePartnerId(partnerId);
  const store = ensureStore();
  const partner = store.partnerDb[id];
  if (!partner) {
    toastr.error(`등록되지 않은 파트너 ID: ${id}`);
    return false;
  }
  if (!partner.State.Alive) {
    toastr.error(`${partner.Meta.Name}은(는) 생존 상태가 아니어서 편성할 수 없습니다.`);
    return false;
  }

  const currentIds = partnerIdsInParty(store);
  const slotMap: Record<PartySlot, string> = { Slot1: '', Slot2: '', Slot3: '' };
  for (let index = 0; index < SLOTS.length; index += 1) {
    const slot = SLOTS[index];
    slotMap[slot] = currentIds[index] ?? '';
  }

  if (preferredSlot) {
    for (const slot of SLOTS) {
      if (slotMap[slot] === id) slotMap[slot] = '';
    }
    slotMap[preferredSlot] = id;
  } else if (!Object.values(slotMap).includes(id)) {
    const emptySlot = SLOTS.find(slot => slotMap[slot] === '');
    if (!emptySlot) {
      toastr.warning('파티 슬롯이 가득 찼습니다. 슬롯 지정 편성을 사용하세요.');
      return false;
    }
    slotMap[emptySlot] = id;
  }

  const nextPartyIds = SLOTS.map(slot => slotMap[slot]).filter(value => value !== '');
  updateInPartyFlags(store, nextPartyIds);
  writeStore(store);
  await syncMessageStatDataFromStore(store);
  return true;
}

async function removePartnerFromParty(partnerIdOrSlot: string): Promise<boolean> {
  const store = ensureStore();
  const token = partnerIdOrSlot.trim();
  let targetId = '';

  if (SLOTS.includes(token as PartySlot)) {
    const slot = token as PartySlot;
    const bySlot = partnerIdsInParty(store);
    targetId = bySlot[SLOTS.indexOf(slot)] ?? '';
  } else {
    targetId = normalizePartnerId(token);
  }

  if (!targetId || !store.partnerDb[targetId] || !store.partnerDb[targetId].State.InParty) return false;
  store.partnerDb[targetId].State.InParty = false;
  store.partnerDb[targetId].UpdatedAt = now();
  updateInPartyFlags(store, partnerIdsInParty(store).filter(id => id !== targetId));
  writeStore(store);
  await syncMessageStatDataFromStore(store);
  return true;
}

async function applyGachaCostWithDuplicateRefund(
  cost: number,
  result: DrawResult,
  duplicate: boolean,
): Promise<DrawResult> {
  result.spent = cost;
  if (!duplicate) return result;
  const refund = Math.trunc(cost / 2);
  await grantSdp(refund);
  result.refund = refund;
  result.message = `${result.partnerName ?? ''} 중복 소환: SDP ${refund} 환급`;
  return result;
}

async function drawGacha(drawType: DrawType): Promise<DrawResult> {
  const cost = drawType === 'normal' ? COST_NORMAL : COST_ADVANCED;
  const enough = await spendSdp(cost);
  if (!enough) {
    return { ok: false, code: 'insufficient_sdp', message: 'SDP가 부족합니다.', spent: 0, refund: 0 };
  }

  const store = ensureStore();
  const pool = Object.values(store.runtime.pool);
  if (pool.length === 0) {
    await grantSdp(cost);
    return { ok: false, code: 'empty_pool', message: '가챠 풀이 비어 있습니다.', spent: 0, refund: 0 };
  }

  const table = drawType === 'normal' ? RATE_NORMAL : RATE_ADVANCED;
  const rolledGrade = pickByWeight(table).toUpperCase();
  const gradeCandidates = pool.filter(item => item.Grade.trim().toUpperCase() === rolledGrade);
  const candidates = gradeCandidates.length > 0 ? gradeCandidates : pool;
  const picked = randomChoice(candidates);

  const base = await registerPartnerFromPool(picked);
  base.partnerId = picked.Id;
  base.partnerName = picked.Name;
  base.isDuplicate = Boolean(base.isDuplicate);
  return applyGachaCostWithDuplicateRefund(cost, base, Boolean(base.isDuplicate));
}

async function pickupByName(name: string): Promise<DrawResult> {
  const trimmed = name.trim();
  if (trimmed === '') {
    return { ok: false, code: 'pickup_not_found', message: '이름을 입력하세요.', spent: 0, refund: 0 };
  }

  const enough = await spendSdp(COST_PICKUP);
  if (!enough) {
    return { ok: false, code: 'insufficient_sdp', message: 'SDP가 부족합니다.', spent: 0, refund: 0 };
  }

  const store = ensureStore();
  const target = findPoolByName(store.runtime.pool, trimmed);
  if (!target) {
    await grantSdp(COST_PICKUP);
    return {
      ok: false,
      code: 'pickup_not_found',
      message: '가챠 풀에 없는 이름입니다. 다시 입력하세요.',
      spent: 0,
      refund: 0,
    };
  }

  const base = await registerPartnerFromPool(target);
  base.partnerId = target.Id;
  base.partnerName = target.Name;
  base.isDuplicate = Boolean(base.isDuplicate);
  return applyGachaCostWithDuplicateRefund(COST_PICKUP, base, Boolean(base.isDuplicate));
}

async function registerCustomPartner(input: NewPartnerInput): Promise<DrawResult> {
  const id = normalizePartnerId(input.Id || input.Name);
  if (!id || !input.Name.trim()) {
    return { ok: false, code: 'custom_id_exists', message: '이름/ID를 확인하세요.', spent: 0, refund: 0 };
  }

  const normalizedGrade = tryNormalizeGrade(input.Grade);
  if (!normalizedGrade) {
    return {
      ok: false,
      code: 'invalid_grade',
      message: 'Invalid Grade. Use one of: EX, S, A, B, C, D.',
      spent: 0,
      refund: 0,
    };
  }

  const normalizedClass = tryNormalizeClass(input.Class);
  if (!normalizedClass) {
    return {
      ok: false,
      code: 'invalid_class',
      message: 'Invalid Class. Use one of: tank, dps, heal, support, allRound.',
      spent: 0,
      refund: 0,
    };
  }

  const store = ensureStore();
  const targetName = normalizeName(input.Name);
  const inPoolByName = Object.values(store.runtime.pool).some(item => normalizeName(item.Name) === targetName);
  if (inPoolByName) {
    toastr.warning('이미 소환풀 목록에 있는 파트너입니다.');
    return {
      ok: false,
      code: 'custom_name_exists_in_pool',
      message: '이미 소환풀 목록에 있는 파트너입니다.',
      spent: 0,
      refund: 0,
    };
  }
  if (store.partnerDb[id]) {
    return {
      ok: false,
      code: 'custom_id_exists',
      message: '이미 존재하는 파트너 ID입니다.',
      spent: 0,
      refund: 0,
    };
  }

  const enough = await spendSdp(COST_CUSTOM);
  if (!enough) {
    return { ok: false, code: 'insufficient_sdp', message: 'SDP가 부족합니다.', spent: 0, refund: 0 };
  }

  const record = makePartnerRecord({
    Id: id,
    Name: input.Name,
    Grade: normalizedGrade,
    Class: normalizedClass,
    Job: input.Job,
    Level: input.Level,
    Affinity: input.Affinity,
    LoveLevel: input.LoveLevel,
    BriefKey: input.BriefKey,
    DetailKey: input.DetailKey,
  });
  store.partnerDb[record.Id] = record;
  store.runtime.briefQueue = _.uniq([...store.runtime.briefQueue, record.Id]);
  writeStore(store);
  await syncMessageStatDataFromStore(store);

  return {
    ok: true,
    code: 'ok',
    message: `${record.Meta.Name} 커스텀 등록 완료`,
    spent: COST_CUSTOM,
    refund: 0,
    partnerId: record.Id,
    partnerName: record.Meta.Name,
    isDuplicate: false,
  };
}

async function setPoolCsvUrl(url: string): Promise<void> {
  const store = ensureStore();
  store.runtime.csvUrl = url.trim();
  writeStore(store);
}

async function refreshPoolFromCsv(): Promise<{ ok: boolean; message: string; count: number }> {
  const store = ensureStore();
  const url = store.runtime.csvUrl.trim();
  if (url === '') return { ok: false, message: 'CSV URL이 비어 있습니다.', count: 0 };

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, message: `CSV 다운로드 실패 (${response.status})`, count: 0 };
    }
    const text = await response.text();
    const parsed = parsePoolCsv(text);
    if (Object.keys(parsed).length === 0) {
      return { ok: false, message: 'CSV 파싱 결과가 비어 있습니다.', count: 0 };
    }
    store.runtime.pool = parsed;
    store.runtime.lastPoolSyncAt = now();
    writeStore(store);
    return { ok: true, message: `가챠 풀 ${Object.keys(parsed).length}명 로드 완료`, count: Object.keys(parsed).length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `CSV 로드 오류: ${message}`, count: 0 };
  }
}

async function getSnapshot(): Promise<SdhSnapshot> {
  const store = ensureStore();
  await waitGlobalInitialized('Mvu');
  const mvuData = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
  const statData = parseStatData(mvuData.stat_data);
  const sdp = Math.max(0, Math.trunc(statData.User.SDP));
  const partySlots: Record<PartySlot, string> = { Slot1: '', Slot2: '', Slot3: '' };
  for (let index = 0; index < SLOTS.length; index += 1) {
    const slot = SLOTS[index];
    partySlots[slot] = statData.User.PartySlots[slot] ?? '';
  }

  const ownedPartners = Object.values(store.partnerDb)
    .map(partner => ({
      Id: partner.Id,
      Name: partner.Meta.Name,
      Grade: partner.Meta.Grade,
      Class: partner.Meta.Class,
      Job: partner.Meta.Job,
      InParty: partner.State.InParty,
      Alive: partner.State.Alive,
      Level: partner.State.Level,
    }))
    .sort((a, b) => a.Name.localeCompare(b.Name));

  return {
    sdp,
    ownedCount: ownedPartners.length,
    inPartyCount: ownedPartners.filter(item => item.InParty).length,
    poolCount: Object.keys(store.runtime.pool).length,
    csvUrl: store.runtime.csvUrl,
    lastPoolSyncAt: store.runtime.lastPoolSyncAt,
    partySlots,
    stat: {
      User: statData.User,
      Mission: statData.Mission,
    },
    pool: Object.values(store.runtime.pool).sort((a, b) => a.Name.localeCompare(b.Name)),
    ownedPartners,
  };
}

function setupEvents(): void {
  eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, variables => {
    const store = ensureStore();
    const statData = parseStatData(variables.stat_data);
    applyStatDataToStore(store, statData);
    applyStoreToStatData(store, statData);
    variables.stat_data = statData;
    writeStore(store);
  });

  eventOn(tavern_events.USER_MESSAGE_RENDERED, messageId => {
    const message = getChatMessages(messageId, { include_swipes: false })[0];
    if (!message || message.role !== 'user') return;
    const store = ensureStore();
    const mentioned = findMentionedOwnedPartners(message.message, store);
    if (mentioned.length > 0) enqueueBriefProfiles(mentioned);
  });

  eventOn(tavern_events.GENERATION_AFTER_COMMANDS, (_type, _option, dryRun) => {
    if (dryRun) return;
    const store = ensureStore();
    const briefIds = consumeBriefQueue(store);
    const tokens = buildProfileTokens(store, briefIds);
    if (tokens.length > 0) injectProfileTokens(tokens);
    writeStore(store);
  });

  eventOn(tavern_events.CHAT_CHANGED, () => {
    void syncMessageStatDataFromStore(ensureStore());
  });
}

function exposeApi(): void {
  const api: SdhApi = {
    getSnapshot,
    setPoolCsvUrl,
    refreshPoolFromCsv,
    drawGacha,
    pickupByName,
    registerCustomPartner,
    addPartnerToParty,
    removePartnerFromParty,
    grantSdp,
    queueBriefProfile: (partnerId: string) => enqueueBriefProfiles([partnerId]),
    syncNow: async () => {
      const store = ensureStore();
      await syncMessageStatDataFromStore(store);
    },
  };

  (window as Window & { SDH?: SdhApi }).SDH = api;
  try {
    (window.top as Window & { SDH?: SdhApi }).SDH = api;
  } catch {
    // top window 접근이 막힌 환경이면 현재 iframe 에만 노출
  }
}

$(async () => {
  await waitGlobalInitialized('Mvu');
  const store = ensureStore();
  await syncMessageStatDataFromStore(store);
  setupEvents();
  exposeApi();
});

