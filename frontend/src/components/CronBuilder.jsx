import React, { useEffect, useMemo, useState } from "react";
import {
  Stack, TextField, MenuItem, ToggleButton, ToggleButtonGroup, Box, Typography, Chip,
} from "@mui/material";

/**
 * Constructor de expresiones cron "amigable". No hace falta saber cron:
 * elegís frecuencia y horarios, y el componente genera la expresión.
 *
 * Props: value (string cron), onChange(cron:string)
 */

const WEEKDAYS = [
  ["1", "Lun"], ["2", "Mar"], ["3", "Mié"], ["4", "Jue"],
  ["5", "Vie"], ["6", "Sáb"], ["0", "Dom"],
];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const two = (n) => String(n).padStart(2, "0");
const to12h = (h) => {
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
};

const DEFAULT_STATE = {
  freq: "daily", everyN: 30, minute: 0, hours: [8], weekdays: ["1", "2", "3", "4", "5"],
};

/** Intenta reconstruir el estado "amigable" a partir de una expresión cron existente (editar). */
function parseCron(cron) {
  const raw = cron || "0 8 * * *";
  const parts = raw.trim().split(/\s+/);
  if (parts.length !== 5) return { ...DEFAULT_STATE, freq: "manual", raw };
  const [min, hour, dom, month, dow] = parts;
  if (dom !== "*" || month !== "*") return { ...DEFAULT_STATE, freq: "manual", raw };

  if (/^\*\/\d+$/.test(min) && hour === "*" && dow === "*") {
    return { ...DEFAULT_STATE, freq: "minutes", everyN: parseInt(min.slice(2), 10), raw };
  }
  if (/^\d+$/.test(min) && /^\*\/\d+$/.test(hour) && dow === "*") {
    return { ...DEFAULT_STATE, freq: "hours", minute: parseInt(min, 10), everyN: parseInt(hour.slice(2), 10), raw };
  }
  if (/^\d+$/.test(min) && dow === "*" && /^\d+(,\d+)*$/.test(hour)) {
    return { ...DEFAULT_STATE, freq: "daily", minute: parseInt(min, 10), hours: hour.split(",").map(Number), raw };
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d(,\d)*$/.test(dow)) {
    return { ...DEFAULT_STATE, freq: "weekly", minute: parseInt(min, 10), hours: [parseInt(hour, 10)], weekdays: dow.split(","), raw };
  }
  return { ...DEFAULT_STATE, freq: "manual", raw };
}

function buildCron(s) {
  switch (s.freq) {
    case "minutes":
      return `*/${s.everyN} * * * *`;
    case "hours":
      return `${s.minute} */${s.everyN} * * *`;
    case "daily":
      return `${s.minute} ${[...s.hours].sort((a, b) => a - b).join(",") || "0"} * * *`;
    case "weekly":
      return `${s.minute} ${s.hours[0] ?? 8} * * ${[...s.weekdays].join(",") || "1"}`;
    case "manual":
      return s.raw;
    default:
      return "0 8 * * *";
  }
}

function describe(s) {
  const times = [...s.hours].sort((a, b) => a - b).map((h) => `${two(h)}:${two(s.minute)}`);
  switch (s.freq) {
    case "minutes":
      return `Cada ${s.everyN} minuto(s).`;
    case "hours":
      return `Cada ${s.everyN} hora(s), en el minuto ${s.minute}.`;
    case "daily":
      return `Todos los días a las ${times.join(" y ") || "00:00"}.`;
    case "weekly": {
      const days = s.weekdays
        .map((d) => WEEKDAYS.find(([v]) => v === d)?.[1])
        .filter(Boolean)
        .join(", ");
      return `Los días ${days || "—"} a las ${two(s.hours[0] ?? 8)}:${two(s.minute)}.`;
    }
    default:
      return "Expresión cron manual.";
  }
}

export default function CronBuilder({ value, onChange }) {
  const [s, setS] = useState(() => parseCron(value));

  const cron = useMemo(() => buildCron(s), [s]);
  useEffect(() => {
    onChange(cron);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cron]);

  const set = (patch) => setS((prev) => ({ ...prev, ...patch }));

  return (
    <Stack spacing={2}>
      <TextField select label="Frecuencia" value={s.freq} onChange={(e) => set({ freq: e.target.value })}>
        <MenuItem value="minutes">Cada X minutos</MenuItem>
        <MenuItem value="hours">Cada X horas</MenuItem>
        <MenuItem value="daily">Todos los días, a horario(s) fijo(s)</MenuItem>
        <MenuItem value="weekly">Días de la semana, a un horario</MenuItem>
        <MenuItem value="manual">Expresión cron manual</MenuItem>
      </TextField>

      {s.freq === "minutes" && (
        <TextField type="number" label="Cada cuántos minutos" value={s.everyN}
          onChange={(e) => set({ everyN: Math.max(1, Math.min(59, +e.target.value)) })} />
      )}

      {s.freq === "hours" && (
        <Stack direction="row" spacing={2}>
          <TextField type="number" label="Cada cuántas horas" value={s.everyN}
            onChange={(e) => set({ everyN: Math.max(1, Math.min(23, +e.target.value)) })} />
          <TextField type="number" label="Minuto" value={s.minute}
            onChange={(e) => set({ minute: Math.max(0, Math.min(59, +e.target.value)) })} />
        </Stack>
      )}

      {s.freq === "daily" && (
        <Stack spacing={1.5}>
          <Typography variant="body2">
            Horas del día (elegí una o más; tocá una hora ya elegida para sacarla)
          </Typography>
          <ToggleButtonGroup
            size="small"
            value={s.hours}
            onChange={(_, v) => set({ hours: v })}
            sx={{ flexWrap: "wrap", gap: 0.5, "& .MuiToggleButtonGroup-grouped": { border: 1, borderColor: "divider", borderRadius: 1 } }}
          >
            {HOURS.map((h) => (
              <ToggleButton key={h} value={h} sx={{ minWidth: 44, px: 1 }}>{two(h)}</ToggleButton>
            ))}
          </ToggleButtonGroup>
          <TextField type="number" label="Minuto (para todas las horas)" value={s.minute}
            onChange={(e) => set({ minute: Math.max(0, Math.min(59, +e.target.value)) })} sx={{ maxWidth: 260 }} />
        </Stack>
      )}

      {s.freq === "weekly" && (
        <Stack spacing={2}>
          <ToggleButtonGroup
            size="small"
            value={s.weekdays}
            onChange={(_, v) => set({ weekdays: v })}
          >
            {WEEKDAYS.map(([v, label]) => (
              <ToggleButton key={v} value={v}>{label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Stack direction="row" spacing={2}>
            <TextField select label="Hora (formato 24h)" value={s.hours[0] ?? 8}
              onChange={(e) => set({ hours: [+e.target.value] })}
              helperText={`= ${to12h(s.hours[0] ?? 8)}`} sx={{ minWidth: 180 }}>
              {HOURS.map((h) => <MenuItem key={h} value={h}>{two(h)}:00 ({to12h(h)})</MenuItem>)}
            </TextField>
            <TextField type="number" label="Minuto" value={s.minute}
              onChange={(e) => set({ minute: Math.max(0, Math.min(59, +e.target.value)) })} />
          </Stack>
        </Stack>
      )}

      {s.freq === "manual" && (
        <TextField label="Cron (5 campos)" value={s.raw}
          onChange={(e) => set({ raw: e.target.value })}
          helperText="min hora díames mes díasem — ej: 0 8,12 * * 1-5" />
      )}

      <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
        <Typography variant="body2">{describe(s)}</Typography>
        <Chip label={cron} size="small" sx={{ mt: 1, fontFamily: "ui-monospace, monospace" }} />
      </Box>
    </Stack>
  );
}
