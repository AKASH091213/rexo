"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuditEvent, DeviceSettings, DeviceSnapshot, SessionUser, TelemetryPoint, TelemetryRange } from "@iot/shared";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "../lib/api";
import { createDashboardSocket } from "../lib/socket";
import { GoogleLoginButton } from "./google-login-button";

const rangeOptions: TelemetryRange[] = ["24h", "7d", "30d"];
const COMMAND_PENDING_MS = 5000;

type PendingCommandState = Partial<
  Record<"valve" | "motor", { value: boolean; expiresAt: number }>
>;

function formatTimeLabel(timestamp: string, range: TelemetryRange) {
  const date = new Date(timestamp);
  if (range === "24h") {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function DashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null);
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [range, setRange] = useState<TelemetryRange>("24h");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [sendingCommandType, setSendingCommandType] = useState<"valve" | "motor" | null>(null);
  const [pendingCommands, setPendingCommands] = useState<PendingCommandState>({});

  function mergePendingSnapshot(nextSnapshot: DeviceSnapshot): DeviceSnapshot {
    const now = Date.now();
    const valvePending = pendingCommands.valve;
    const motorPending = pendingCommands.motor;

    return {
      ...nextSnapshot,
      valve: valvePending && valvePending.expiresAt > now ? valvePending.value : nextSnapshot.valve,
      motor: motorPending && motorPending.expiresAt > now ? motorPending.value : nextSnapshot.motor
    };
  }

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const session = await api.getSession();
        if (!active || !session.authenticated || !session.user) {
          setLoading(false);
          return;
        }

        setSessionUser(session.user);
      } catch {
        setLoading(false);
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionUser) {
      return;
    }

    let active = true;

    async function loadDashboard() {
      const dashboard = await api.getDashboard();
      const deviceTelemetry = await api.getTelemetry(dashboard.device.deviceId, range);

      if (!active) {
        return;
      }

      setSnapshot(mergePendingSnapshot(dashboard.device));
      setSettings(dashboard.settings);
      setEvents(dashboard.recentEvents);
      setTelemetry(deviceTelemetry);
      setLoading(false);
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [sessionUser, range]);

  useEffect(() => {
    if (!sessionUser || !snapshot) {
      return;
    }

    const interval = setInterval(() => {
      void (async () => {
        try {
          const dashboard = await api.getDashboard();
          const deviceTelemetry = await api.getTelemetry(dashboard.device.deviceId, range);
          setSnapshot(mergePendingSnapshot(dashboard.device));
          setSettings(dashboard.settings);
          setEvents(dashboard.recentEvents);
          setTelemetry(deviceTelemetry);
        } catch {
          // Keep the existing UI state if a background refresh fails.
        }
      })();
    }, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [sessionUser, snapshot?.deviceId, range]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const socket = createDashboardSocket();
    socket.emit("join-device", snapshot.deviceId);
    socket.on(
      "telemetry:update",
      (payload: { telemetry: TelemetryPoint; snapshot: DeviceSnapshot }) => {
        setSnapshot(mergePendingSnapshot(payload.snapshot));
        setTelemetry((current) => [...current.slice(-249), payload.telemetry]);
        setPendingCommands((current) => {
          const next = { ...current };

          if (current.valve && payload.snapshot.valve === current.valve.value) {
            delete next.valve;
          }

          if (current.motor && payload.snapshot.motor === current.motor.value) {
            delete next.motor;
          }

          return next;
        });
      }
    );
    socket.on("settings:update", (payload: DeviceSettings) => {
      setSettings(payload);
    });
    socket.on("event:new", (event: AuditEvent) => {
      setEvents((current) => [event, ...current].slice(0, 20));
    });

    return () => {
      socket.disconnect();
    };
  }, [snapshot?.deviceId, pendingCommands]);

  const chartData = useMemo(
    () =>
      telemetry.map((point) => ({
        label: formatTimeLabel(point.receivedAt, range),
        waterLevel: point.waterLevel,
        flowRate: point.flowRate,
        totalLitres: point.totalLitres
      })),
    [telemetry, range]
  );

  async function handleGoogleLogin(credential: string) {
    try {
      const session = await api.loginWithGoogle(credential);
      setSessionUser(session.user);
      setLoginError(null);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed");
    }
  }

  async function handleActuatorToggle(type: "valve" | "motor") {
    if (!snapshot) {
      return;
    }

    const nextValue = !snapshot[type];
    const previousSnapshot = snapshot;
    const expiresAt = Date.now() + COMMAND_PENDING_MS;
    setSendingCommandType(type);
    setPendingCommands((current) => ({
      ...current,
      [type]: { value: nextValue, expiresAt }
    }));
    setSnapshot({
      ...snapshot,
      [type]: nextValue
    });
    try {
      await api.sendCommand(snapshot.deviceId, { type, value: nextValue });
      setEvents((current) => current);
    } catch (error) {
      setSnapshot(previousSnapshot);
      setPendingCommands((current) => {
        const next = { ...current };
        delete next[type];
        return next;
      });
      throw error;
    } finally {
      setSendingCommandType(null);
    }
  }

  useEffect(() => {
    if (!pendingCommands.valve && !pendingCommands.motor) {
      return;
    }

    const timeout = setTimeout(() => {
      const now = Date.now();
      setPendingCommands((current) => {
        const next = { ...current };
        if (next.valve && next.valve.expiresAt <= now) delete next.valve;
        if (next.motor && next.motor.expiresAt <= now) delete next.motor;
        return next;
      });
    }, 500);

    return () => clearTimeout(timeout);
  }, [pendingCommands]);

  async function handleSettingsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) {
      return;
    }

    setIsSavingSettings(true);
    try {
      const updated = await api.updateSettings(settings.deviceId, settings);
      setSettings(updated);
    } finally {
      setIsSavingSettings(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-slate-200">
        <div className="glass-panel rounded-3xl px-8 py-6">Loading control center...</div>
      </main>
    );
  }

  if (!sessionUser) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <section className="glass-panel grid w-full max-w-6xl overflow-hidden rounded-[32px] lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col justify-between gap-10 bg-dashboard-grid p-10">
            <div className="space-y-6">
              <p className="inline-flex rounded-full border border-white/10 px-4 py-1 text-sm uppercase tracking-[0.24em] text-sky-200">
                AquaPulse Control Center
              </p>
              <div className="space-y-4">
                <h1 className="max-w-xl font-[var(--font-heading)] text-5xl font-semibold leading-tight">
                  Operate your water system from one secure live dashboard.
                </h1>
                <p className="max-w-lg text-lg text-slate-300">
                  Track tank levels, monitor water flow, switch the motor remotely, and keep your team aligned with realtime system intelligence.
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Live telemetry", "Socket-based realtime readings"],
                ["Protected control", "Google sign-in for staff access"],
                ["30-day history", "Charts and event visibility"]
              ].map(([title, description]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h2 className="font-semibold text-white">{title}</h2>
                  <p className="mt-2 text-sm text-slate-300">{description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center p-8 lg:p-12">
            <div className="mx-auto w-full max-w-md space-y-6">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-lagoon">Staff Login</p>
                <h2 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">
                  Sign in with Google
                </h2>
                <p className="mt-3 text-slate-300">
                  Use your approved Google account to access monitoring, settings, and device controls.
                </p>
              </div>
              <GoogleLoginButton onCredential={handleGoogleLogin} />
              {loginError ? <p className="text-sm text-red-300">{loginError}</p> : null}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!snapshot || !settings) {
    return null;
  }

  const alertItems: Array<{ label: string; active: boolean }> = [
    { label: "Low water warning", active: snapshot.alertState.lowWater },
    { label: "High water warning", active: snapshot.alertState.highWater },
    { label: "Offline warning", active: snapshot.alertState.offline }
  ];

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="glass-panel flex flex-col gap-5 rounded-[28px] px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm uppercase tracking-[0.24em] text-sky-200">AquaPulse Control Center</p>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  snapshot.isOnline ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
                }`}
              >
                {snapshot.isOnline ? "Device Online" : "Device Offline"}
              </span>
            </div>
            <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold">Water System Operations Dashboard</h1>
            <p className="mt-2 text-slate-300">
              Welcome, {sessionUser.name}. Last telemetry received{" "}
              {snapshot.lastSeenAt ? new Date(snapshot.lastSeenAt).toLocaleString() : "not yet"}.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-medium text-white">{sessionUser.name}</p>
              <p className="text-sm text-slate-300">{sessionUser.email}</p>
            </div>
            <button
              type="button"
              onClick={() => void api.logout().then(() => location.reload())}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-white/30 hover:bg-white/5"
            >
              Logout
            </button>
          </div>
        </header>

        {!snapshot.isOnline ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            Live telemetry has stopped. The dashboard is showing the last known device state until new MQTT data arrives.
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Water Level",
              value: `${snapshot.waterLevel.toFixed(1)} cm`,
              accent: "text-sky-200"
            },
            {
              label: "Flow Rate",
              value: `${snapshot.flowRate.toFixed(2)} L/min`,
              accent: "text-lagoon"
            },
            {
              label: "Total Volume",
              value: `${snapshot.totalLitres.toFixed(2)} L`,
              accent: "text-amber-200"
            },
            {
              label: "Supply Valve",
              value: snapshot.valve ? "Open" : "Closed",
              accent: snapshot.valve ? "text-emerald-300" : "text-slate-200"
            },
            {
              label: "Tank Motor",
              value: snapshot.motor ? "Running" : "Stopped",
              accent: snapshot.motor ? "text-emerald-300" : "text-slate-200"
            },
            {
              label: "Person Detection",
              value: snapshot.personDetected ? "Detected" : "Not Detected",
              accent: snapshot.personDetected ? "text-emerald-300" : "text-slate-200"
            }
          ].map((card) => (
            <article key={card.label} className="glass-panel rounded-3xl p-5">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{card.label}</p>
              <p className={`mt-4 text-3xl font-semibold ${card.accent}`}>{card.value}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
          <article className="glass-panel rounded-[28px] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Telemetry trends</p>
                <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold">Realtime tank and flow history</h2>
              </div>
              <div className="flex gap-2">
                {rangeOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRange(option)}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      range === option ? "bg-sky-400 text-ink" : "bg-white/5 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-8 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="label" stroke="#8BA1BE" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis stroke="#8BA1BE" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#091523",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 16
                    }}
                  />
                  <Line type="monotone" dataKey="waterLevel" stroke="#6DA7FF" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="flowRate" stroke="#00A7A0" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>

          <div className="flex flex-col gap-6">
            <article className="glass-panel rounded-[28px] p-6">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Actuator Control</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold">Valve and motor control</h2>
              <p className="mt-3 text-sm text-slate-300">
                Send independent MQTT commands for the water-supply solenoid valve and the tank-filling motor.
              </p>
              <div className="mt-6 grid gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-white">Solenoid Valve</h3>
                      <p className="mt-1 text-sm text-slate-300">Controls water supply for user usage.</p>
                    </div>
                    <span className={`text-sm font-medium ${snapshot.valve ? "text-emerald-300" : "text-slate-300"}`}>
                      {snapshot.valve ? "Open" : "Closed"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleActuatorToggle("valve")}
                    disabled={sendingCommandType !== null}
                    className={`mt-4 w-full rounded-2xl px-4 py-4 text-base font-semibold transition ${
                      snapshot.valve ? "bg-flame text-white hover:brightness-110" : "bg-lagoon text-white hover:brightness-110"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {sendingCommandType === "valve" ? "Sending valve command..." : snapshot.valve ? "Close Valve" : "Open Valve"}
                  </button>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-white">Tank Motor</h3>
                      <p className="mt-1 text-sm text-slate-300">Controls the motor used for tank water filling.</p>
                    </div>
                    <span className={`text-sm font-medium ${snapshot.motor ? "text-emerald-300" : "text-slate-300"}`}>
                      {snapshot.motor ? "Running" : "Stopped"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleActuatorToggle("motor")}
                    disabled={sendingCommandType !== null}
                    className={`mt-4 w-full rounded-2xl px-4 py-4 text-base font-semibold transition ${
                      snapshot.motor ? "bg-flame text-white hover:brightness-110" : "bg-sky-400 text-ink hover:brightness-110"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {sendingCommandType === "motor" ? "Sending motor command..." : snapshot.motor ? "Turn Motor Off" : "Turn Motor On"}
                  </button>
                </div>
              </div>
            </article>

            <article className="glass-panel rounded-[28px] p-6">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Alerts</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold">Current system state</h2>
              <div className="mt-5 grid gap-3">
                {alertItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                    <span className="text-sm text-slate-200">{item.label}</span>
                    <span className={`text-sm font-medium ${item.active ? "text-red-300" : "text-emerald-300"}`}>
                      {item.active ? "Active" : "Normal"}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                  <span className="text-sm text-slate-200">Person near tap</span>
                  <span className={`text-sm font-medium ${snapshot.personDetected ? "text-emerald-300" : "text-slate-300"}`}>
                    {snapshot.personDetected ? "Detected" : "Not detected"}
                  </span>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <article className="glass-panel rounded-[28px] p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Threshold Settings</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold">Safety and alert preferences</h2>
            <form className="mt-6 space-y-5" onSubmit={(event) => void handleSettingsSubmit(event)}>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Auto cutoff (sec)</span>
                  <input
                    type="number"
                    value={settings.autoCutoffTimeoutSec}
                    onChange={(event) =>
                      setSettings({ ...settings, autoCutoffTimeoutSec: Number(event.target.value) })
                    }
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-sky-300"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Min tank level (cm)</span>
                  <input
                    type="number"
                    value={settings.minTankLevel}
                    onChange={(event) => setSettings({ ...settings, minTankLevel: Number(event.target.value) })}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-sky-300"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Max tank level (cm)</span>
                  <input
                    type="number"
                    value={settings.maxTankLevel}
                    onChange={(event) => setSettings({ ...settings, maxTankLevel: Number(event.target.value) })}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-sky-300"
                  />
                </label>
              </div>

              <div className="grid gap-3">
                {[
                  ["lowWater", "Low water alerts"],
                  ["highWater", "High water alerts"],
                  ["offline", "Offline alerts"],
                  ["autoCutoff", "Auto cutoff alerts"]
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <span className="text-sm text-slate-200">{label}</span>
                    <input
                      type="checkbox"
                      checked={settings.alerts[key as keyof DeviceSettings["alerts"]]}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          alerts: {
                            ...settings.alerts,
                            [key]: event.target.checked
                          }
                        })
                      }
                      className="h-4 w-4 accent-sky-400"
                    />
                  </label>
                ))}
              </div>

              <button
                type="submit"
                disabled={isSavingSettings}
                className="rounded-2xl bg-sky-400 px-5 py-3 font-semibold text-ink transition hover:brightness-110 disabled:opacity-60"
              >
                {isSavingSettings ? "Saving..." : "Save settings"}
              </button>
            </form>
          </article>

          <article className="glass-panel rounded-[28px] p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Activity Feed</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold">Recent device and user events</h2>
            <div className="mt-6 space-y-3">
              {events.map((event) => (
                <div key={event.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-200">
                      {event.type}
                    </span>
                    <span className="text-xs text-slate-400">{new Date(event.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-100">{event.message}</p>
                  {event.actorName ? <p className="mt-2 text-xs text-slate-400">By {event.actorName}</p> : null}
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
