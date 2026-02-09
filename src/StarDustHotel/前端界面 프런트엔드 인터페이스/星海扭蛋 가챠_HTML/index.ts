import './style.css';

type DrawType = 'normal' | 'advanced';
type GachaTab = 'normal' | 'advanced' | 'pickup' | 'custom';

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
};

type OwnedPartner = {
  Id: string;
  Name: string;
  Grade: string;
  Class: string;
  Job: string;
  InParty: boolean;
  Alive: boolean;
  Level: number;
};

type Snapshot = {
  sdp: number;
  ownedCount: number;
  poolCount: number;
  csvUrl: string;
  lastPoolSyncAt: number;
  stat?: {
    User?: {
      SDP?: number;
    };
  };
  pool: PoolPartner[];
  ownedPartners: OwnedPartner[];
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
};

type ResultPartner = {
  Name: string;
  Level: number;
  Grade: string;
  Class: string;
  Job: string;
};

const state: {
  busy: boolean;
  snapshot: Snapshot | null;
  api: SdhApi | null;
  activeTab: GachaTab;
  resultMessage: string;
  lastResultPartner: ResultPartner | null;
} = {
  busy: false,
  snapshot: null,
  api: null,
  activeTab: 'normal',
  resultMessage: '대기중',
  lastResultPartner: null,
};

function esc(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function classEmoji(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value === 'tank') return '🛡️';
  if (value === 'dps') return '⚔️';
  if (value === 'heal' || value === 'healer') return '✨';
  if (value === 'support') return '🌿';
  return '💎';
}

function renderLayout(): void {
  $('#app').html(`
    <main class="page">
      <section class="gacha-shell">
        <header class="header">
          <h1 class="title">STAR SEA GACHA</h1>
          <p class="sub">확률 기반 소환 / 파트너 등록</p>
          <div class="status-row">
            <span id="stat-sdp" class="pill">SDP 0</span>
            <span id="stat-owned" class="pill">보유 0</span>
            <span id="stat-pool" class="pill">풀 0</span>
          </div>
        </header>

        <section class="csv-bar">
          <input id="csv-url" class="input grow" placeholder="Google Spreadsheet CSV URL" />
          <button id="btn-save-url" class="btn">URL 저장</button>
          <button id="btn-reload-pool" class="btn alt">풀 동기화</button>
          <button id="btn-refresh" class="btn dark">갱신</button>
        </section>
        <p id="hint-csv" class="hint">현재 URL: (미설정)</p>

        <nav class="tab-nav" role="tablist" aria-label="가챠 방식">
          <button class="tab-btn is-active" data-tab="normal" type="button">일반 가챠</button>
          <button class="tab-btn" data-tab="advanced" type="button">고급 가챠</button>
          <button class="tab-btn" data-tab="pickup" type="button">픽업 가챠</button>
          <button class="tab-btn" data-tab="custom" type="button">커스텀 등록</button>
        </nav>

        <section class="tab-panel is-active" data-panel="normal">
          <h2 class="panel-title">일반 가챠</h2>
          <p class="rate">비용 1,000 SDP | EX 0.1% / S 1% / A 5% / B 15% / C 30% / D 48.9%</p>
          <button id="btn-draw-normal" class="btn">일반 1회 소환</button>
        </section>

        <section class="tab-panel" data-panel="advanced">
          <h2 class="panel-title">고급 가챠</h2>
          <p class="rate">비용 5,000 SDP | EX 2% / S 8% / A 20% / B 30% / C 40% / D 0%</p>
          <button id="btn-draw-advanced" class="btn">고급 1회 소환</button>
        </section>

        <section class="tab-panel" data-panel="pickup">
          <h2 class="panel-title">픽업 가챠</h2>
          <p class="rate">비용 50,000 SDP | 풀에 있는 이름만 지정 가능</p>
          <input id="pickup-name" class="input" list="pickup-suggestions" placeholder="파트너 이름 입력" />
          <datalist id="pickup-suggestions"></datalist>
          <div style="height:8px"></div>
          <button id="btn-pickup" class="btn">픽업 소환</button>
        </section>

        <section class="tab-panel" data-panel="custom">
          <h2 class="panel-title">커스텀 파트너 등록</h2>
          <p class="rate">비용 10,000 SDP | Grade: EX,S,A,B,C,D | Class: tank,dps,heal,support,allRound</p>
          <div class="form-grid">
            <input id="custom-name" class="input" placeholder="이름" />
            <input id="custom-id" class="input" placeholder="ID (비우면 이름 사용)" />
            <select id="custom-grade" class="select">
              <option value="D">D</option>
              <option value="C">C</option>
              <option value="B">B</option>
              <option value="A">A</option>
              <option value="S">S</option>
              <option value="EX">EX</option>
            </select>
            <select id="custom-class" class="select">
              <option value="tank">tank</option>
              <option value="dps">dps</option>
              <option value="heal">heal</option>
              <option value="support" selected>support</option>
              <option value="allRound">allRound</option>
            </select>
            <input id="custom-job" class="input" placeholder="직업" />
            <input id="custom-level" class="input" type="number" min="1" value="1" placeholder="레벨" />
            <input id="custom-affinity" class="input" type="number" value="0" placeholder="호감도" />
            <input id="custom-lovelevel" class="input" type="number" value="0" placeholder="러브 레벨" />
          </div>
          <button id="btn-custom-register" class="btn">커스텀 등록</button>
        </section>

        <section class="result-box">
          <p id="result-message" class="result-message">대기중</p>
          <div id="result-card" class="result-card">
            <div id="result-name" class="result-name">-</div>
            <div id="result-meta" class="result-meta">-</div>
          </div>
        </section>
      </section>
    </main>
  `);
}

function activateTab(tab: GachaTab): void {
  state.activeTab = tab;
  $('.tab-btn').removeClass('is-active');
  $(`.tab-btn[data-tab="${tab}"]`).addClass('is-active');
  $('.tab-panel').removeClass('is-active');
  $(`.tab-panel[data-panel="${tab}"]`).addClass('is-active');
}

function applyBusyState(): void {
  $('button').prop('disabled', state.busy);
  $('input').prop('disabled', state.busy);
  $('select').prop('disabled', state.busy);
}

function renderResult(): void {
  $('#result-message').text(state.resultMessage);
  if (!state.lastResultPartner) {
    $('#result-card').removeClass('active');
    return;
  }

  const p = state.lastResultPartner;
  $('#result-name').text(`${p.Name} (${p.Grade})`);
  $('#result-meta').text(`Lv.${p.Level} | ${classEmoji(p.Class)} ${p.Class} | ${p.Job}`);
  $('#result-card').addClass('active');
}

function renderSnapshot(snapshot: Snapshot | null): void {
  if (!snapshot) return;
  const sdp = snapshot.stat?.User?.SDP ?? snapshot.sdp;
  $('#stat-sdp').text(`SDP ${sdp.toLocaleString()}`);
  $('#stat-owned').text(`보유 ${snapshot.ownedCount}`);
  $('#stat-pool').text(`풀 ${snapshot.poolCount}`);
  $('#hint-csv').text(`현재 URL: ${snapshot.csvUrl || '(미설정)'} | 동기화: ${snapshot.lastPoolSyncAt ? new Date(snapshot.lastPoolSyncAt).toLocaleString() : '(없음)'}`);
  $('#csv-url').val(snapshot.csvUrl);

  const names = snapshot.pool
    .map(item => item.Name.trim())
    .filter(name => name !== '')
    .filter((name, idx, arr) => arr.indexOf(name) === idx)
    .slice(0, 400)
    .map(name => `<option value="${esc(name)}"></option>`)
    .join('');

  $('#pickup-suggestions').html(names);
}

async function resolveApi(): Promise<SdhApi | null> {
  for (let i = 0; i < 30; i += 1) {
    const api = (window.top as Window & { SDH?: SdhApi }).SDH ?? (window as Window & { SDH?: SdhApi }).SDH;
    if (api) return api;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return null;
}

async function refreshSnapshot(): Promise<void> {
  if (!state.api) return;
  state.snapshot = await state.api.getSnapshot();
  renderSnapshot(state.snapshot);
}

function buildResultPartner(result: DrawResult): ResultPartner | null {
  if (!state.snapshot || !result.partnerName) return null;

  const byId = result.partnerId
    ? state.snapshot.ownedPartners.find(p => p.Id === result.partnerId)
    : undefined;
  const byName = state.snapshot.ownedPartners.find(p => p.Name === result.partnerName);
  const fromOwned = byId ?? byName;
  if (fromOwned) {
    return {
      Name: fromOwned.Name,
      Level: fromOwned.Level,
      Grade: fromOwned.Grade,
      Class: fromOwned.Class,
      Job: fromOwned.Job,
    };
  }

  const byPool = state.snapshot.pool.find(p => p.Id === result.partnerId || p.Name === result.partnerName);
  if (byPool) {
    return {
      Name: byPool.Name,
      Level: 1,
      Grade: byPool.Grade,
      Class: byPool.Class,
      Job: byPool.Job,
    };
  }

  return null;
}

function resultText(result: DrawResult): string {
  const costText = `소모 ${result.spent} SDP`;
  const refundText = result.refund > 0 ? ` / 환급 ${result.refund} SDP` : '';
  return `${result.message} (${costText}${refundText})`;
}

async function runAction(task: () => Promise<void>): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  applyBusyState();
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.resultMessage = `오류: ${message}`;
    state.lastResultPartner = null;
    renderResult();
    toastr.error(state.resultMessage);
  } finally {
    state.busy = false;
    applyBusyState();
  }
}

function bindEvents(): void {
  $('.tab-btn').on('click', function onTabClick() {
    const tab = String($(this).data('tab')) as GachaTab;
    activateTab(tab);
  });

  $('#btn-save-url').on('click', () => {
    void runAction(async () => {
      if (!state.api) return;
      await state.api.setPoolCsvUrl(String($('#csv-url').val() ?? '').trim());
      await refreshSnapshot();
      state.resultMessage = 'CSV URL 저장 완료';
      state.lastResultPartner = null;
      renderResult();
      toastr.success(state.resultMessage);
    });
  });

  $('#btn-reload-pool').on('click', () => {
    void runAction(async () => {
      if (!state.api) return;
      const result = await state.api.refreshPoolFromCsv();
      await refreshSnapshot();
      state.resultMessage = result.message;
      state.lastResultPartner = null;
      renderResult();
      if (result.ok) toastr.success(state.resultMessage);
      else toastr.warning(state.resultMessage);
    });
  });

  $('#btn-refresh').on('click', () => {
    void runAction(async () => {
      await refreshSnapshot();
      state.resultMessage = '상태 갱신 완료';
      state.lastResultPartner = null;
      renderResult();
      toastr.info(state.resultMessage);
    });
  });

  $('#btn-draw-normal').on('click', () => {
    void runAction(async () => {
      if (!state.api) return;
      const result = await state.api.drawGacha('normal');
      await refreshSnapshot();
      state.resultMessage = resultText(result);
      state.lastResultPartner = buildResultPartner(result);
      renderResult();
      if (result.ok) toastr.success(state.resultMessage);
      else toastr.warning(state.resultMessage);
    });
  });

  $('#btn-draw-advanced').on('click', () => {
    void runAction(async () => {
      if (!state.api) return;
      const result = await state.api.drawGacha('advanced');
      await refreshSnapshot();
      state.resultMessage = resultText(result);
      state.lastResultPartner = buildResultPartner(result);
      renderResult();
      if (result.ok) toastr.success(state.resultMessage);
      else toastr.warning(state.resultMessage);
    });
  });

  $('#btn-pickup').on('click', () => {
    void runAction(async () => {
      if (!state.api) return;
      const result = await state.api.pickupByName(String($('#pickup-name').val() ?? '').trim());
      await refreshSnapshot();
      state.resultMessage = resultText(result);
      state.lastResultPartner = buildResultPartner(result);
      renderResult();
      if (result.ok) toastr.success(state.resultMessage);
      else toastr.warning(state.resultMessage);
    });
  });

  $('#btn-custom-register').on('click', () => {
    void runAction(async () => {
      if (!state.api) return;
      const payload = {
        Id: String($('#custom-id').val() ?? '').trim() || String($('#custom-name').val() ?? '').trim(),
        Name: String($('#custom-name').val() ?? '').trim(),
        Grade: String($('#custom-grade').val() ?? 'D').trim(),
        Class: String($('#custom-class').val() ?? 'support').trim(),
        Job: String($('#custom-job').val() ?? '').trim() || '미정',
        Level: Number($('#custom-level').val() ?? 1),
        Affinity: Number($('#custom-affinity').val() ?? 0),
        LoveLevel: Number($('#custom-lovelevel').val() ?? 0),
      };

      const result = await state.api.registerCustomPartner(payload);
      await refreshSnapshot();
      state.resultMessage = resultText(result);
      state.lastResultPartner = buildResultPartner(result);
      renderResult();
      if (result.ok) toastr.success(state.resultMessage);
      else toastr.warning(state.resultMessage);
    });
  });
}

$(async () => {
  renderLayout();
  bindEvents();
  activateTab('normal');
  renderResult();

  state.resultMessage = 'SDH API 연결 중...';
  renderResult();

  state.api = await resolveApi();
  if (!state.api) {
    state.resultMessage = 'SDH 파트너 시스템 API를 찾지 못했습니다.';
    renderResult();
    toastr.error(state.resultMessage);
    return;
  }

  await refreshSnapshot();
  state.resultMessage = '준비 완료';
  renderResult();
});
