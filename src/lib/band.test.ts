import { describe, expect, it } from "vitest";
import { authUrl, BAND_SCOPES, dailyFilter, lastNight, mergeBand, mergeMinutes, refreshFrom, perMinute, readDaily, readHeartRate, readHrv, readSleep, readState, readSteps, rollUpBody, sampleFilter, signState, sleepFilter, wakeFor, type SleepSession } from "./band";

// Shapes as Google's CLI reads them (pkg/output/simplify.go): the type object holds sampleTime / interval / date.
const hr = (t: string, bpm: unknown) => ({ name: `users/me/dataTypes/heart-rate/dataPoints/${t}`, dataSource: { device: { displayName: "Charge 6" } }, heartRate: { sampleTime: { physicalTime: t, utcOffset: "7200s" }, beatsPerMinute: bpm } });

describe("heart rate", () => {
  it("reads samples, oldest first, and drops what isn't a heartbeat", () => {
    const page = { dataPoints: [hr("2026-10-07T08:00:05Z", 64), hr("2026-10-07T08:00:00Z", "62"), hr("2026-10-07T08:00:10Z", 0), hr("bad", 70), { name: "x", heartRate: { beatsPerMinute: 70 } }] };
    expect(readHeartRate(page)).toEqual([{ t: Date.parse("2026-10-07T08:00:00Z"), bpm: 62 }, { t: Date.parse("2026-10-07T08:00:05Z"), bpm: 64 }]);
    expect(readHeartRate({})).toEqual([]);
  });
  it("keeps one value per minute — average, lowest, highest — and a minute pulled again replaces the old one", () => {
    const t0 = Date.parse("2026-10-07T08:00:00Z");
    const m = perMinute([{ t: t0, bpm: 60 }, { t: t0 + 20_000, bpm: 64 }, { t: t0 + 40_000, bpm: 71 }, { t: t0 + 61_000, bpm: 90 }]);
    expect(m).toEqual([[t0, 65, 60, 71], [t0 + 60_000, 90, 90, 90]]);
    expect(mergeMinutes(m, [[t0 + 60_000, 92, 88, 96], [t0 + 120_000, 100, 99, 101]])).toEqual([[t0, 65, 60, 71], [t0 + 60_000, 92, 88, 96], [t0 + 120_000, 100, 99, 101]]);
  });
});

describe("HRV and resting heart rate", () => {
  it("HRV samples: the RMSSD field, whatever it's called", () => {
    const p = { dataPoints: [{ heartRateVariability: { sampleTime: { physicalTime: "2026-10-07T02:00:00Z" }, rootMeanSquareOfSuccessiveDifferencesMilliseconds: 41.5, standardDeviationMilliseconds: 60 } }] };
    expect(readHrv(p)).toEqual([{ t: Date.parse("2026-10-07T02:00:00Z"), ms: 41.5 }]);
  });
  it("daily values by local date", () => {
    expect(readDaily({ dataPoints: [{ dailyRestingHeartRate: { date: { year: 2026, month: 10, day: 7 }, beatsPerMinute: 54 } }] }, "beatsPerMinute")).toEqual({ "2026-10-07": 54 });
    expect(readDaily({ dataPoints: [{ dailyHeartRateVariability: { date: { year: 2026, month: 10, day: 6 }, averageRmssdMilliseconds: 38 } }] })).toEqual({ "2026-10-06": 38 });
  });
});

describe("sleep", () => {
  const night = {
    name: "users/me/dataTypes/sleep/dataPoints/abc123",
    sleep: {
      interval: { startTime: "2026-10-06T21:40:00Z", endTime: "2026-10-07T05:10:00Z", startUtcOffset: "7200s" }, type: "STAGES",
      metadata: { nap: false },
      summary: { minutesAsleep: 412, minutesAwake: 38, minutesInSleepPeriod: 450, minutesToFallAsleep: 12, stagesSummary: [{ type: "DEEP", minutes: 70 }, { type: "LIGHT", minutes: 240 }, { type: "REM", minutes: 102 }, { type: "AWAKE", minutes: 38 }] },
      stages: [{ type: "LIGHT", startTime: "2026-10-06T21:52:00Z", endTime: "2026-10-06T22:30:00Z" }, { type: "DEEP", startTime: "2026-10-06T22:30:00Z", endTime: "2026-10-06T23:20:00Z" }],
    },
  };
  const nap = { name: "n", sleep: { interval: { startTime: "2026-10-07T12:00:00Z", endTime: "2026-10-07T12:30:00Z" }, metadata: { nap: true }, summary: { minutesAsleep: 25 } } };
  it("reads a night: times, minutes per stage, the stages themselves", () => {
    const [s] = readSleep({ dataPoints: [night] });
    expect(s).toMatchObject({ id: "abc123", start: Date.parse("2026-10-06T21:40:00Z"), end: Date.parse("2026-10-07T05:10:00Z"), asleepMin: 412, toFallAsleepMin: 12, nap: false });
    expect(s.stageMin).toEqual({ deep: 70, light: 240, rem: 102, awake: 38 });
    expect(s.stages.map((x) => x.type)).toEqual(["light", "deep"]);
  });
  it("last night is the latest main sleep — not a nap, not one from days ago", () => {
    const all = readSleep({ dataPoints: [nap, night] });
    expect(lastNight(all, Date.parse("2026-10-07T13:00:00Z"))?.id).toBe("abc123");
    expect(lastNight(all, Date.parse("2026-10-09T13:00:00Z"))).toBeNull();
  });
});

describe("asking Google", () => {
  it("filters: sample types by physical time (UTC), sleep by local end time, daily types by date", () => {
    expect(sampleFilter("heart_rate", Date.parse("2026-10-07T08:00:00.500Z"))).toBe('heart_rate.sample_time.physical_time >= "2026-10-07T08:00:00Z"');
    expect(sampleFilter("heart_rate", 0, 60_000)).toBe('heart_rate.sample_time.physical_time >= "1970-01-01T00:00:00Z" AND heart_rate.sample_time.physical_time < "1970-01-01T00:01:00Z"');
    expect(sleepFilter("2026-10-05")).toBe('sleep.interval.civil_end_time >= "2026-10-05T00:00:00"');
    expect(dailyFilter("daily_resting_heart_rate", "2026-10-01")).toBe('daily_resting_heart_rate.date >= "2026-10-01"');
  });
  it("the sign-in link: read-only scopes, a refresh token, our callback", () => {
    const u = new URL(authUrl("cid.apps.googleusercontent.com", "st"));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ client_id: "cid.apps.googleusercontent.com", response_type: "code", access_type: "offline", prompt: "consent", state: "st", redirect_uri: "https://healthos.lukacsarnold9.workers.dev/api/google/callback" });
    expect(u.searchParams.get("scope")!.split(" ")).toEqual(BAND_SCOPES);
    expect(BAND_SCOPES.every((s) => s.endsWith(".readonly"))).toBe(true);
  });
  it("the state says who started it; tampered, other-secret or stale states are refused", async () => {
    const now = 1_800_000_000_000;
    const st = await signState("user-1", "secret", now);
    expect(await readState(st, "secret", now + 60_000)).toBe("user-1");
    expect(await readState(st.replace("user-1", "user-2"), "secret", now)).toBeNull();
    expect(await readState(st, "other", now)).toBeNull();
    expect(await readState(st, "secret", now + 16 * 60_000)).toBeNull();
    expect(await readState("junk", "secret", now)).toBeNull();
  });
});

describe("steps (PLAN 66)", () => {
  it("the roll-up asked for: a physical range and a window size; a page token rides in the body", () => {
    expect(JSON.parse(rollUpBody(Date.UTC(2026, 9, 7, 10), Date.UTC(2026, 9, 7, 12), "300s"))).toEqual({ range: { startTime: "2026-10-07T10:00:00Z", endTime: "2026-10-07T12:00:00Z" }, windowSize: "300s" });
    expect(JSON.parse(rollUpBody(0, 300_000, "300s", "abc")).pageToken).toBe("abc");
  });
  it("Google's roll-up → [start, minutes, steps]: int64 counts as strings, junk and broken windows dropped, oldest first", () => {
    const w = (a: string, z: string, n: unknown) => ({ startTime: a, endTime: z, steps: { countSum: n } });
    expect(readSteps({ rollupDataPoints: [
      w("2026-10-07T10:05:00Z", "2026-10-07T10:10:00Z", "512"), w("2026-10-07T10:00:00Z", "2026-10-07T10:05:00Z", 0),
      w("2026-10-07T10:10:00Z", "2026-10-07T10:15:00Z", "99999"), w("2026-10-07T10:15:00Z", "2026-10-07T10:15:00Z", "3"), w("bad", "2026-10-07T10:20:00Z", "3"),
      { startTime: "2026-10-07T10:20:00Z", endTime: "2026-10-07T10:25:00Z" },
    ] })).toEqual([[Date.UTC(2026, 9, 7, 10, 0), 5, 0], [Date.UTC(2026, 9, 7, 10, 5), 5, 512]]);
    expect(readSteps({})).toEqual([]);
  });
  it("merging keeps old windows and replaces re-sent ones; data without steps keeps what's held", () => {
    const a = { hr: [], sleep: [], rhr: {}, hrv: {}, steps: [[1, 5, 10], [2, 5, 20]] as [number, number, number][] };
    expect(mergeBand(a, { hr: [], sleep: [], rhr: {}, hrv: {}, steps: [[2, 5, 25], [3, 5, 30]] }).steps).toEqual([[1, 5, 10], [2, 5, 25], [3, 5, 30]]);
    expect(mergeBand(a, { hr: [], sleep: [], rhr: {}, hrv: {} }).steps).toEqual([[1, 5, 10], [2, 5, 20]]);
  });
});

describe("what the app holds", () => {
  const H = 3600_000, now = Date.UTC(2026, 9, 7, 16, 0);
  it("first load: a week; then only the last 12 h, or from an hour before the newest minute if that's older", () => {
    expect(refreshFrom(null, now)).toBe(now - 7 * 86_400_000);
    const from = now - 7 * 86_400_000;
    expect(refreshFrom({ hr: [[now - 5 * 60_000, 70, 70, 70]], from }, now)).toBe(now - 12 * H);
    expect(refreshFrom({ hr: [[now - 20 * H, 70, 70, 70]], from }, now)).toBe(now - 21 * H);
    expect(refreshFrom({ hr: [], from: now - 2 * H }, now)).toBe(now - 2 * H); // never before what's held
  });
  it("merging a new window keeps the old minutes and nights, replaces re-sent ones", () => {
    const n = (id: string, start: number) => ({ id, start, end: start + H, asleepMin: 50, awakeMin: 0, toFallAsleepMin: 0, nap: false, stageMin: {}, stages: [] });
    const a = { hr: [[1, 60, 60, 60], [2, 61, 61, 61]] as [number, number, number, number][], sleep: [n("x", 0)], rhr: { "2026-10-06": 55 }, hrv: {} };
    const b = { hr: [[2, 65, 64, 66], [3, 70, 70, 70]] as [number, number, number, number][], sleep: [{ ...n("x", 0), asleepMin: 55 }, n("y", 5 * H)], rhr: { "2026-10-07": 54 }, hrv: { "2026-10-07": 40 } };
    const m = mergeBand(a, b);
    expect(m.hr).toEqual([[1, 60, 60, 60], [2, 65, 64, 66], [3, 70, 70, 70]]);
    expect(m.sleep.map((s) => [s.id, s.asleepMin])).toEqual([["x", 55], ["y", 50]]);
    expect(m.rhr).toEqual({ "2026-10-06": 55, "2026-10-07": 54 });
    expect(mergeBand(null, b)).toBe(b);
  });
});

describe("wakeFor (PLAN 56, for Tempo)", () => {
  const night = (start: string, end: string, extra: Partial<SleepSession> = {}): SleepSession => ({
    id: start, start: Date.parse(start), end: Date.parse(end), asleepMin: 391, awakeMin: 20, toFallAsleepMin: 8,
    nap: false, stageMin: {}, stages: [], ...extra,
  });
  // Budapest in October: UTC+2 → tz 120. Up 07:12 local = 05:12Z.
  const main = night("2026-10-07T22:41:00Z", "2026-10-08T05:12:00Z");

  it("the night that ended that morning, in local time", () => {
    expect(wakeFor([main], "2026-10-08", 120)).toEqual({ wokeAt: "2026-10-08T05:12:00.000Z", asleepMin: 391 });
  });

  it("not the night before, nor an afternoon nap, nor a night ending past 14:00", () => {
    const before = night("2026-10-06T22:00:00Z", "2026-10-07T05:00:00Z");
    const nap = night("2026-10-08T11:00:00Z", "2026-10-08T11:40:00Z", { nap: true, asleepMin: 35 });
    expect(wakeFor([before, nap], "2026-10-08", 120)).toBeNull();
    expect(wakeFor([night("2026-10-08T03:00:00Z", "2026-10-08T12:30:00Z")], "2026-10-08", 120)).toBeNull();
  });

  it("the day boundary is local: 23:30Z on the 7th is 01:30 on the 8th in Budapest", () => {
    const short = night("2026-10-07T20:00:00Z", "2026-10-07T23:30:00Z", { asleepMin: 200 });
    expect(wakeFor([short], "2026-10-08", 120)?.wokeAt).toBe("2026-10-07T23:30:00.000Z");
    expect(wakeFor([short], "2026-10-08", 0)).toBeNull();
  });

  it("two nights that morning (logged twice): the one with more sleep", () => {
    const first = night("2026-10-07T22:00:00Z", "2026-10-08T01:00:00Z", { asleepMin: 170 });
    expect(wakeFor([first, main], "2026-10-08", 120)?.wokeAt).toBe("2026-10-08T05:12:00.000Z");
  });

  it("bad day or time zone: nothing", () => {
    expect(wakeFor([main], "8 Oct", 120)).toBeNull();
    expect(wakeFor([main], "2026-10-08", Number.NaN)).toBeNull();
  });
});
