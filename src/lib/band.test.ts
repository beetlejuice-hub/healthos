import { describe, expect, it } from "vitest";
import { authUrl, BAND_SCOPES, dailyFilter, lastNight, mergeMinutes, perMinute, readDaily, readHeartRate, readHrv, readSleep, readState, sampleFilter, signState, sleepFilter } from "./band";

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
