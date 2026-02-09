<template>
  <main class="page">
    <div class="starfield"></div>
    <section class="card header">
      <h1>Stardust Gacha Console</h1>
      <p class="sub">상아색 성운 UI · 황금 장식 · 파트너 소환 및 등록</p>
      <div class="stats">
        <span>SP: {{ snapshot?.sdp ?? 0 }}</span>
        <span>소지 파트너: {{ snapshot?.ownedCount ?? 0 }}</span>
        <span>파티: {{ snapshot?.inPartyCount ?? 0 }}/3</span>
        <span>풀 인원: {{ snapshot?.poolCount ?? 0 }}</span>
      </div>
    </section>

    <section class="card">
      <h2>가챠 풀 CSV</h2>
      <div class="row">
        <input v-model.trim="csvUrl" class="input grow" placeholder="Google Spreadsheet CSV URL" />
        <button class="btn gold" :disabled="busy" @click="saveCsvUrl">URL 저장</button>
        <button class="btn" :disabled="busy" @click="reloadPool">풀 새로고침</button>
      </div>
      <p class="hint">현재 URL: {{ snapshot?.csvUrl || '(미설정)' }}</p>
      <p class="hint">
        마지막 동기화:
        {{ snapshot?.lastPoolSyncAt ? new Date(snapshot.lastPoolSyncAt).toLocaleString() : '(없음)' }}
      </p>
    </section>

    <section class="card grid3">
      <article class="gacha-box">
        <h3>일반 가챠</h3>
        <p>비용: 1,000 SP</p>
        <p class="rate">EX 0.1 / S 1 / A 5 / B 15 / C 30 / D 48.9 (%)</p>
        <button class="btn wide" :disabled="busy" @click="draw('normal')">일반 1회</button>
      </article>

      <article class="gacha-box">
        <h3>고급 가챠</h3>
        <p>비용: 5,000 SP</p>
        <p class="rate">EX 2 / S 8 / A 20 / B 30 / C 40 / D 0 (%)</p>
        <button class="btn wide" :disabled="busy" @click="draw('advanced')">고급 1회</button>
      </article>

      <article class="gacha-box">
        <h3>픽업 가챠</h3>
        <p>비용: 50,000 SP</p>
        <input v-model.trim="pickupName" class="input" placeholder="풀에 있는 파트너 이름" />
        <button class="btn wide" :disabled="busy" @click="pickup">픽업 소환</button>
      </article>
    </section>

    <section class="card">
      <h2>커스텀 파트너 등록 (10,000 SP)</h2>
      <div class="grid2">
        <input v-model.trim="custom.name" class="input" placeholder="이름" />
        <input v-model.trim="custom.id" class="input" placeholder="ID (비우면 이름 기반 생성)" />
        <input v-model.trim="custom.className" class="input" placeholder="클래스 (자유 입력)" />
        <input v-model.trim="custom.grade" class="input" placeholder="등급 (자유 입력)" />
        <input v-model.trim="custom.job" class="input" placeholder="직업" />
        <input v-model.number="custom.level" class="input" type="number" min="1" placeholder="레벨" />
        <input v-model.number="custom.affinity" class="input" type="number" placeholder="호감도" />
        <input v-model.number="custom.loveLevel" class="input" type="number" placeholder="러브 레벨" />
      </div>
      <button class="btn gold wide" :disabled="busy" @click="registerCustom">커스텀 등록</button>
    </section>

    <section class="card">
      <h2>파티 편성</h2>
      <div class="row">
        <input v-model.trim="partyPartnerId" class="input" placeholder="파트너 ID" />
        <select v-model="partySlot" class="input">
          <option value="">자동 슬롯</option>
          <option value="Slot1">Slot1</option>
          <option value="Slot2">Slot2</option>
          <option value="Slot3">Slot3</option>
        </select>
        <button class="btn" :disabled="busy" @click="assignParty">편성</button>
        <button class="btn" :disabled="busy" @click="removeParty">해제</button>
      </div>
      <p class="hint">
        현재 슬롯:
        Slot1={{ snapshot?.partySlots.Slot1 || '-' }},
        Slot2={{ snapshot?.partySlots.Slot2 || '-' }},
        Slot3={{ snapshot?.partySlots.Slot3 || '-' }}
      </p>
    </section>

    <section class="card">
      <h2>최근 결과</h2>
      <p class="result">{{ lastResult }}</p>
      <button class="btn" :disabled="busy" @click="refreshSnapshot">새로고침</button>
    </section>

    <section class="card tables">
      <div>
        <h3>가챠 풀 (상위 30)</h3>
        <ul class="list">
          <li v-for="item in poolPreview" :key="item.Id">
            {{ item.Name }} · {{ item.Grade }} · {{ item.Class }} · {{ item.Id }}
          </li>
        </ul>
      </div>
      <div>
        <h3>소지 파트너 (상위 30)</h3>
        <ul class="list">
          <li v-for="item in ownedPreview" :key="item.Id">
            {{ item.Name }} · Lv{{ item.Level }} · {{ item.Grade }} · {{ item.InParty ? 'Party' : 'Standby' }}
          </li>
        </ul>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
type PartySlot = 'Slot1' | 'Slot2' | 'Slot3';
type DrawType = 'normal' | 'advanced';

type DrawResult = {
  ok: boolean;
  code: string;
  message: string;
  spent: number;
  refund: number;
  partnerId?: string;
  partnerName?: string;
  isDuplicate?: boolean;
};

type PoolPartner = {
  Id: string;
  Name: string;
  Grade: string;
  Class: string;
  Job: string;
  BriefKey: string;
  DetailKey: string;
};

type Snapshot = {
  sdp: number;
  ownedCount: number;
  inPartyCount: number;
  poolCount: number;
  csvUrl: string;
  lastPoolSyncAt: number;
  partySlots: Record<PartySlot, string>;
  pool: PoolPartner[];
  ownedPartners: Array<{
    Id: string;
    Name: string;
    Grade: string;
    Class: string;
    Job: string;
    InParty: boolean;
    Alive: boolean;
    Level: number;
  }>;
};

type SdhApi = {
  getSnapshot: () => Promise<Snapshot>;
  setPoolCsvUrl: (url: string) => Promise<void>;
  refreshPoolFromCsv: () => Promise<{ ok: boolean; message: string; count: number }>;
  drawGacha: (drawType: DrawType) => Promise<DrawResult>;
  pickupByName: (name: string) => Promise<DrawResult>;
  registerCustomPartner: (input: {
    Id: string;
    Name: string;
    Grade: string;
    Class: string;
    Job: string;
    Level?: number;
    Affinity?: number;
    LoveLevel?: number;
  }) => Promise<DrawResult>;
  addPartnerToParty: (partnerId: string, slot?: PartySlot) => Promise<boolean>;
  removePartnerFromParty: (partnerIdOrSlot: string) => Promise<boolean>;
};

const busy = ref(false);
const snapshot = ref<Snapshot | null>(null);
const csvUrl = ref('');
const pickupName = ref('');
const lastResult = ref('대기중');
const partyPartnerId = ref('');
const partySlot = ref('');

const custom = ref({
  name: '',
  id: '',
  className: '',
  grade: '',
  job: '',
  level: 1,
  affinity: 0,
  loveLevel: 0,
});

const poolPreview = computed(() => (snapshot.value?.pool ?? []).slice(0, 30));
const ownedPreview = computed(() => (snapshot.value?.ownedPartners ?? []).slice(0, 30));

async function resolveApi(): Promise<SdhApi | null> {
  for (let i = 0; i < 30; i += 1) {
    const host = (window.top as Window & { SDH?: SdhApi }).SDH ?? (window as Window & { SDH?: SdhApi }).SDH;
    if (host) return host;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return null;
}

let api: SdhApi | null = null;

async function refreshSnapshot(): Promise<void> {
  if (!api) return;
  snapshot.value = await api.getSnapshot();
  csvUrl.value = snapshot.value.csvUrl;
}

function renderResult(result: DrawResult): string {
  const costText = `소모 ${result.spent} SP`;
  const refundText = result.refund > 0 ? ` / 환급 ${result.refund} SP` : '';
  const partnerText = result.partnerName ? ` / 대상 ${result.partnerName}` : '';
  return `${result.message} (${costText}${refundText}${partnerText})`;
}

async function runAction(task: () => Promise<void>): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastResult.value = `오류: ${message}`;
    toastr.error(lastResult.value);
  } finally {
    busy.value = false;
  }
}

async function saveCsvUrl(): Promise<void> {
  if (!api) return;
  await runAction(async () => {
    await api!.setPoolCsvUrl(csvUrl.value);
    await refreshSnapshot();
    lastResult.value = 'CSV URL 저장 완료';
    toastr.success(lastResult.value);
  });
}

async function reloadPool(): Promise<void> {
  if (!api) return;
  await runAction(async () => {
    const result = await api!.refreshPoolFromCsv();
    lastResult.value = result.message;
    if (result.ok) toastr.success(result.message);
    else toastr.warning(result.message);
    await refreshSnapshot();
  });
}

async function draw(type: DrawType): Promise<void> {
  if (!api) return;
  await runAction(async () => {
    const result = await api!.drawGacha(type);
    lastResult.value = renderResult(result);
    if (result.ok) toastr.success(lastResult.value);
    else toastr.warning(lastResult.value);
    await refreshSnapshot();
  });
}

async function pickup(): Promise<void> {
  if (!api) return;
  await runAction(async () => {
    const result = await api!.pickupByName(pickupName.value);
    lastResult.value = renderResult(result);
    if (result.ok) toastr.success(lastResult.value);
    else toastr.warning(lastResult.value);
    await refreshSnapshot();
  });
}

async function registerCustom(): Promise<void> {
  if (!api) return;
  await runAction(async () => {
    const payload = {
      Id: custom.value.id.trim() || custom.value.name.trim(),
      Name: custom.value.name.trim(),
      Grade: custom.value.grade.trim() || 'D',
      Class: custom.value.className.trim() || 'support',
      Job: custom.value.job.trim() || '미정',
      Level: Number(custom.value.level),
      Affinity: Number(custom.value.affinity),
      LoveLevel: Number(custom.value.loveLevel),
    };
    const result = await api!.registerCustomPartner(payload);
    lastResult.value = renderResult(result);
    if (result.ok) toastr.success(lastResult.value);
    else toastr.warning(lastResult.value);
    await refreshSnapshot();
  });
}

async function assignParty(): Promise<void> {
  if (!api) return;
  await runAction(async () => {
    const ok = await api!.addPartnerToParty(partyPartnerId.value, (partySlot.value as PartySlot) || undefined);
    lastResult.value = ok ? '파티 편성 완료' : '파티 편성 실패';
    if (ok) toastr.success(lastResult.value);
    else toastr.warning(lastResult.value);
    await refreshSnapshot();
  });
}

async function removeParty(): Promise<void> {
  if (!api) return;
  await runAction(async () => {
    const token = partyPartnerId.value.trim() || partySlot.value.trim();
    if (!token) {
      toastr.warning('해제 대상 ID 또는 슬롯을 입력하세요.');
      return;
    }
    const ok = await api!.removePartnerFromParty(token);
    lastResult.value = ok ? '파티 해제 완료' : '파티 해제 실패';
    if (ok) toastr.success(lastResult.value);
    else toastr.warning(lastResult.value);
    await refreshSnapshot();
  });
}

onMounted(async () => {
  api = await resolveApi();
  if (!api) {
    lastResult.value = 'SDH 파트너 스크립트를 찾지 못했습니다.';
    toastr.error(lastResult.value);
    return;
  }
  await refreshSnapshot();
});
</script>

<style scoped>
:root {
  --ivory-0: #fffdf5;
  --ivory-1: #f5efdf;
  --gold-0: #9f6b00;
  --gold-1: #d9b24a;
  --gold-2: #f5d98c;
  --ink-0: #1f1d18;
}

.page {
  min-height: 100vh;
  padding: 20px;
  color: var(--ink-0);
  background:
    radial-gradient(1200px 900px at 85% -10%, #2f2a4d 0%, rgba(47, 42, 77, 0) 70%),
    radial-gradient(900px 700px at -10% 110%, #223047 0%, rgba(34, 48, 71, 0) 65%),
    linear-gradient(180deg, var(--ivory-0), var(--ivory-1));
}

.starfield {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.22;
  background-image:
    radial-gradient(circle at 8% 15%, #ffffff 0 1px, transparent 2px),
    radial-gradient(circle at 28% 42%, #fff7c2 0 1px, transparent 2px),
    radial-gradient(circle at 70% 30%, #ffffff 0 1px, transparent 2px),
    radial-gradient(circle at 90% 65%, #fff0a8 0 1px, transparent 2px),
    radial-gradient(circle at 44% 80%, #ffffff 0 1px, transparent 2px);
}

.card {
  position: relative;
  margin: 0 auto 14px auto;
  max-width: 1100px;
  border-radius: 16px;
  border: 1px solid rgba(159, 107, 0, 0.25);
  background: rgba(255, 252, 242, 0.9);
  box-shadow:
    inset 0 0 0 1px rgba(245, 217, 140, 0.25),
    0 10px 30px rgba(37, 28, 9, 0.12);
  padding: 16px;
}

.card::before {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 10px;
  border: 1px solid rgba(217, 178, 74, 0.26);
  pointer-events: none;
}

.header h1 {
  margin: 2px 0 6px 0;
  font-size: 28px;
  letter-spacing: 0.04em;
  color: #5d4100;
}

.sub {
  margin: 0;
  color: #685633;
}

.stats {
  margin-top: 10px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.stats span {
  background: rgba(245, 217, 140, 0.35);
  color: #47360e;
  border: 1px solid rgba(159, 107, 0, 0.25);
  padding: 4px 10px;
  border-radius: 999px;
}

.row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.grid3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.grid2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.tables {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.input {
  background: rgba(255, 250, 235, 0.96);
  border: 1px solid rgba(159, 107, 0, 0.35);
  color: #2f2715;
  border-radius: 10px;
  padding: 8px 10px;
  min-height: 36px;
}

.input.grow {
  flex: 1;
  min-width: 260px;
}

.btn {
  border: 1px solid rgba(159, 107, 0, 0.5);
  background: linear-gradient(180deg, #fff8e2, #f8e5b1);
  color: #3d2c08;
  border-radius: 10px;
  padding: 8px 12px;
  cursor: pointer;
}

.btn.gold {
  background: linear-gradient(180deg, #f7dc9b, #d7ab3f);
}

.btn.wide {
  width: 100%;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.gacha-box {
  border-radius: 12px;
  border: 1px solid rgba(159, 107, 0, 0.28);
  padding: 12px;
  background: linear-gradient(165deg, rgba(255, 248, 224, 0.95), rgba(248, 235, 187, 0.6));
}

.gacha-box h3 {
  margin: 0 0 4px 0;
}

.rate {
  color: #5f4f2c;
  font-size: 13px;
}

.hint {
  color: #6f5f3d;
  margin: 6px 0 0 0;
}

.result {
  margin: 0 0 10px 0;
  color: #4a3912;
  font-weight: 600;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 280px;
  overflow: auto;
  border: 1px solid rgba(159, 107, 0, 0.22);
  border-radius: 10px;
  background: rgba(255, 248, 229, 0.72);
}

.list li {
  padding: 7px 10px;
  border-bottom: 1px solid rgba(159, 107, 0, 0.12);
  font-size: 13px;
}

.list li:last-child {
  border-bottom: none;
}

@media (max-width: 980px) {
  .grid3 {
    grid-template-columns: 1fr;
  }

  .tables {
    grid-template-columns: 1fr;
  }

  .grid2 {
    grid-template-columns: 1fr;
  }
}
</style>
