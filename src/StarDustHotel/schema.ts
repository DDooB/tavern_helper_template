const PARTNER_GRADES = ['EX', 'S', 'A', 'B', 'C', 'D'] as const;
const PARTNER_CLASSES = ['tank', 'dps', 'heal', 'support', 'allRound'] as const;

function normalizePartnerGrade(raw: string): (typeof PARTNER_GRADES)[number] {
  const value = raw.trim().toUpperCase();
  return PARTNER_GRADES.includes(value as (typeof PARTNER_GRADES)[number])
    ? (value as (typeof PARTNER_GRADES)[number])
    : 'D';
}

function normalizePartnerClass(raw: string): (typeof PARTNER_CLASSES)[number] {
  const lowered = raw.trim().toLowerCase();
  if (lowered === 'tank') return 'tank';
  if (lowered === 'dps') return 'dps';
  if (lowered === 'heal' || lowered === 'healer') return 'heal';
  if (lowered === 'support') return 'support';
  if (
    lowered === 'allround' ||
    lowered === 'all_round' ||
    lowered === 'all-round' ||
    lowered === 'allrounder' ||
    lowered === 'all-rounder'
  ) {
    return 'allRound';
  }
  return 'support';
}

export const Schema = z
  .object({
    User: z.object({
      Level: z.coerce.number().transform(v => Math.max(1, Math.trunc(v))),
      Costume: z.string(),
      SDP: z.coerce.number().transform(v => Math.max(0, Math.trunc(v))),
      Inventory: z.record(
        z.string().describe('Item ID'),
        z.object({
          Description: z.string(),
          Quantity: z.coerce.number().transform(v => Math.max(0, Math.trunc(v))),
        }),
      ),
      PartySlots: z.record(z.enum(['Slot1', 'Slot2', 'Slot3']), z.string()),
      PartySlotData: z.record(
        z.enum(['Slot1', 'Slot2', 'Slot3']),
        z.union([
          z.literal(''),
          z.object({
            PartnerId: z.string(),
            Name: z.string(),
            Level: z.coerce.number().transform(v => Math.max(1, Math.trunc(v))),
            Grade: z.string().transform(v => normalizePartnerGrade(v)),
            Class: z.string().transform(v => normalizePartnerClass(v)),
            Job: z.string(),
            Affinity: z.coerce.number().transform(v => Math.trunc(v)),
            LoveLevel: z.coerce.number().transform(v => _.clamp(Math.trunc(v), -5, 5)),
            Fatigue: z.coerce.number().transform(v => _.clamp(Math.trunc(v), 0, 100)),
            Alive: z.boolean(),
          }),
        ]),
      ),
      _OwnedPartnerCount: z.coerce.number().transform(v => Math.max(0, Math.trunc(v))),
    }),
    Mission: z.object({
      OnMission: z.boolean(),
      MissionType: z.enum(['normal', 'eros']),
      MissionGrade: z.enum(['S', 'A', 'B', 'C', 'D']),
      WorldName: z.string(),
      WorldSummaryAndObjective: z.string(),
    }),
  })
  .transform(data => {
    const slots = ['Slot1', 'Slot2', 'Slot3'] as const;
    const dedupedIds: string[] = [];

    for (const slot of slots) {
      const rawId = data.User.PartySlots[slot].trim();
      if (rawId === '' || dedupedIds.includes(rawId)) continue;
      dedupedIds.push(rawId);
    }

    slots.forEach((slot, index) => {
      const partnerId = dedupedIds[index] ?? '';
      data.User.PartySlots[slot] = partnerId;
      const slotData = data.User.PartySlotData[slot];
      if (partnerId === '' || slotData === '') {
        data.User.PartySlotData[slot] = '';
        return;
      }

      let affinity = Math.trunc(slotData.Affinity);
      let loveLevel = _.clamp(Math.trunc(slotData.LoveLevel), -5, 5);
      while (affinity >= 100 && loveLevel < 5) {
        affinity -= 100;
        loveLevel += 1;
      }
      while (affinity <= -100 && loveLevel > -5) {
        affinity += 100;
        loveLevel -= 1;
      }

      data.User.PartySlotData[slot] = {
        ...slotData,
        PartnerId: partnerId,
        Level: Math.max(1, Math.trunc(slotData.Level)),
        Grade: normalizePartnerGrade(slotData.Grade),
        Class: normalizePartnerClass(slotData.Class),
        Affinity: _.clamp(affinity, -99, 99),
        LoveLevel: _.clamp(loveLevel, -5, 5),
        Fatigue: _.clamp(Math.trunc(slotData.Fatigue), 0, 100),
      };
    });

    data.User._OwnedPartnerCount = Math.max(0, Math.trunc(data.User._OwnedPartnerCount));

    // Mission fallback values.
    if (!data.Mission.OnMission) {
      data.Mission.MissionType = 'normal';
      data.Mission.MissionGrade = 'D';
      data.Mission.WorldName = '스타더스트 호텔';
      data.Mission.WorldSummaryAndObjective = '대기중';
    } else {
      if (data.Mission.WorldName.trim() === '') data.Mission.WorldName = '스타더스트 호텔';
      if (data.Mission.WorldSummaryAndObjective.trim() === '') data.Mission.WorldSummaryAndObjective = '임무 진행중';
    }

    return data;
  });

export type Schema = z.output<typeof Schema>;
