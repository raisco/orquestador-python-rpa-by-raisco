import React, { useState } from "react";
import { useParams, useNavigate, Link as RouterLink } from "react-router-dom";
import {
  Stack, Typography, Button, Tabs, Tab, Grid, Card, CardContent, Paper, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Box, Alert,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PublishIcon from "@mui/icons-material/Publish";
import LinkIcon from "@mui/icons-material/Link";
import HistoryToggleOffIcon from "@mui/icons-material/HistoryToggleOff";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend,
} from "recharts";

import usePoll from "../lib/usePoll";
import { fmtDateTime, fmtDuration } from "../lib/format";
import { apiErrorMessage } from "../lib/apiError";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import StatusChip from "../components/StatusChip";
import ProcessKindChip from "../components/ProcessKindChip";
import EmptyValue from "../components/EmptyValue";
import {
  fetchProcess, runProcess, fetchProcessSummary, fetchProcessTimeseries,
  fetchDurationHistogram, fetchQueueThroughput, fetchExecutions, fetchVersions,
  publishVersion, activateVersion, updateProcess, fetchQueues, fetchBotScripts,
  fetchProcesses,
} from "../api";

function useChartColors() {
  const t = useTheme();
  return {
    success: t.palette.success.main,
    failed: t.palette.error.main,
    primary: t.palette.primary.main,
    warn: t.palette.warning.main,
    grid: t.palette.divider,
    axis: t.palette.text.secondary,
    paper: t.palette.background.paper,
    text: t.palette.text.primary,
  };
}

function ProcessMetaChips({ p }) {
  const theme = useTheme();
  if (!p) return null;
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
      {p.kind && p.kind !== "standalone" && <ProcessKindChip kind={p.kind} />}
      <Chip
        size="small"
        variant="outlined"
        label={p.key}
        sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.7rem" }}
      />
      <Chip
        size="small"
        variant="outlined"
        label={`${p.bot_dir}/${p.entrypoint}`}
        sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.7rem" }}
      />
      {p.after_process_name && (
        <Chip
          size="small"
          icon={<LinkIcon fontSize="small" />}
          label={`después de "${p.after_process_name}" (${p.after_policy === "always" ? "siempre" : "si OK"})`}
          sx={{
            bgcolor: alpha(theme.palette.warning.main, 0.18),
            color: theme.palette.warning.main,
            fontWeight: 600,
            border: `1px solid ${alpha(theme.palette.warning.main, 0.5)}`,
            "& .MuiChip-icon": { color: theme.palette.warning.main },
          }}
        />
      )}
    </Stack>
  );
}

export default function ProcessDetailPage() {
  const { processId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const { data: p, refresh } = usePoll(() => fetchProcess(processId), 6000, [processId]);

  return (
    <Stack spacing={2}>
      <PageHeader
        to="/processes"
        title={p?.name || "…"}
        subtitle={p ? <ProcessMetaChips p={p} /> : null}
        actions={
          <Stack direction="row" spacing={1}>
            <Button component={RouterLink} to={`/logs?process=${processId}`}>Ver logs</Button>
            <Button variant="contained" startIcon={<PlayArrowIcon />}
              onClick={async () => { await runProcess(processId); refresh(); }}>
              Ejecutar ahora
            </Button>
          </Stack>
        }
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label="Resumen" />
        <Tab label="Ejecuciones" />
        <Tab label="Versiones" />
        <Tab label="Configuración" />
      </Tabs>

      {tab === 0 && <OverviewTab processId={processId} navigate={navigate} />}
      {tab === 1 && <ExecutionsTab processId={processId} navigate={navigate} />}
      {tab === 2 && <VersionsTab processId={processId} onChange={refresh} />}
      {tab === 3 && <ConfigTab process={p} onSaved={refresh} />}
    </Stack>
  );
}

function ConfigTab({ process, onSaved }) {
  const { data: queues } = usePoll(fetchQueues, 20000, []);
  const { data: botScripts } = usePoll(fetchBotScripts, 20000, []);
  const { data: allProcesses } = usePoll(fetchProcesses, 20000, []);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  React.useEffect(() => {
    if (process && !form) {
      setForm({
        key: process.key || "",
        name: process.name || "",
        description: process.description || "",
        kind: process.kind || "standalone",
        bot_dir: process.bot_dir || "",
        entrypoint: process.entrypoint || "",
        queue_name: process.queue_name || "",
        max_concurrency: process.max_concurrency ?? 1,
        after_process_id: process.after_process_id || "",
        after_policy: process.after_policy || "on_success",
      });
    }
  }, [process, form]);

  if (!form) return null;
  const set = (patch) => { setForm({ ...form, ...patch }); setSaved(false); setErr(""); };
  const folders = Object.keys(botScripts || {});
  const filesForFolder = (botScripts || {})[form.bot_dir] || [];

  const save = async () => {
    setErr("");
    try {
      const updated = await updateProcess(process.id, {
        ...form,
        max_concurrency: Number(form.max_concurrency),
        after_process_id: form.after_process_id === "" ? null : Number(form.after_process_id),
      });
      // Resincronizamos el formulario con lo que realmente quedó en el
      // servidor (la respuesta del PATCH), en vez de esperar al próximo
      // poll del padre — si no, el formulario queda con el estado local
      // viejo para siempre y da la sensación de que "no guardó".
      setForm({
        key: updated.key || "",
        name: updated.name || "",
        description: updated.description || "",
        kind: updated.kind || "standalone",
        bot_dir: updated.bot_dir || "",
        entrypoint: updated.entrypoint || "",
        queue_name: updated.queue_name || "",
        max_concurrency: updated.max_concurrency ?? 1,
        after_process_id: updated.after_process_id || "",
        after_policy: updated.after_policy || "on_success",
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
      onSaved && onSaved();
    } catch (e) {
      setSaved(false);
      setErr(apiErrorMessage(e, "No se pudo guardar."));
    }
  };

  const otherProcesses = (allProcesses || []).filter((p) => p.id !== process.id);

  return (
    <Card>
      <CardContent>
        <Stack spacing={2} sx={{ maxWidth: 480 }}>
          <TextField label="Key (a-z, -, _)" value={form.key} onChange={(e) => set({ key: e.target.value })}
            helperText="Identificador único del proceso. Cambiarlo no afecta ejecuciones ni versiones pasadas." />
          <TextField label="Nombre" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          <TextField label="Descripción" value={form.description} onChange={(e) => set({ description: e.target.value })} />
          <TextField select label="Carpeta del bot" value={folders.includes(form.bot_dir) ? form.bot_dir : ""}
            onChange={(e) => set({ bot_dir: e.target.value, entrypoint: "" })}
            helperText={folders.includes(form.bot_dir) ? "Subcarpeta en backend/bots/" : `Actual: "${form.bot_dir}" (no detectada) — elegí una`}>
            {folders.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </TextField>
          <TextField select label="Archivo a ejecutar (entrypoint)"
            value={filesForFolder.includes(form.entrypoint) ? form.entrypoint : ""}
            onChange={(e) => set({ entrypoint: e.target.value })} disabled={!filesForFolder.length}>
            {filesForFolder.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
          </TextField>
          <TextField select label="Tipo" value={form.kind} onChange={(e) => set({ kind: e.target.value })}
            helperText="dispatcher = genera ítems · performer = los procesa · standalone = no usa cola">
            <MenuItem value="standalone">standalone (sin cola)</MenuItem>
            <MenuItem value="dispatcher">dispatcher (genera ítems)</MenuItem>
            <MenuItem value="performer">performer (procesa ítems)</MenuItem>
          </TextField>
          <TextField select label="Cola de trabajo" value={form.queue_name}
            onChange={(e) => set({ queue_name: e.target.value })}
            helperText="El bot recibe el id de esta cola en QUEUE_ID. Los dispatcher/performer necesitan una.">
            <MenuItem value="">(ninguna)</MenuItem>
            {(queues || []).map((q) => <MenuItem key={q.id} value={q.name}>{q.name}</MenuItem>)}
          </TextField>
          <TextField type="number" label="Concurrencia máxima" value={form.max_concurrency}
            onChange={(e) => set({ max_concurrency: e.target.value })} />

          <TextField select label="Ejecutar después de otro proceso (opcional)" value={form.after_process_id}
            onChange={(e) => set({ after_process_id: e.target.value })}
            helperText="Encadena este proceso: se dispara automáticamente cuando termina el elegido. No usa cron.">
            <MenuItem value="">(ninguno — no depende de otro proceso)</MenuItem>
            {otherProcesses.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          {form.after_process_id && (
            <TextField select label="Si ese proceso falla" value={form.after_policy}
              onChange={(e) => set({ after_policy: e.target.value })}
              helperText="Qué hacer con este proceso según cómo terminó del que depende.">
              <MenuItem value="on_success">No ejecutar (cortar la cadena)</MenuItem>
              <MenuItem value="always">Ejecutar igual (seguir la cadena)</MenuItem>
            </TextField>
          )}
          {err && <Alert severity="error">{err}</Alert>}
          {saved && <Alert severity="success">Cambios guardados.</Alert>}
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" onClick={save}>Guardar</Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>{title}</Typography>
        <ResponsiveContainer width="100%" height={260}>{children}</ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ processId, navigate }) {
  const C = useChartColors();
  const axis = { fontSize: 11, stroke: C.axis, tick: { fill: C.axis } };
  const tip = {
    contentStyle: { background: C.paper, border: `1px solid ${C.grid}`, borderRadius: 6, color: C.text },
    labelStyle: { color: C.text },
    itemStyle: { color: C.text },
  };
  const { data: s } = usePoll(() => fetchProcessSummary(processId, 7), 8000, [processId]);
  const { data: ts } = usePoll(() => fetchProcessTimeseries(processId, 14), 20000, [processId]);
  const { data: hist } = usePoll(() => fetchDurationHistogram(processId, 14), 20000, [processId]);
  const { data: thr } = usePoll(() => fetchQueueThroughput(processId, 24), 15000, [processId]);

  const MIN_DAYS_WITH_DATA = 3;
  const daysWithData = (ts || []).filter((d) => (d.success || 0) + (d.failed || 0) > 0).length;
  const hasEnoughHistory = ts != null && daysWithData >= MIN_DAYS_WITH_DATA;

  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        <Grid item xs={6} md={3}><StatCard label="Tasa de éxito" value={s?.success_rate != null ? `${s.success_rate}%` : null} sub={`${s?.runs ?? 0} corridas (7d)`} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Duración media" value={fmtDuration(s?.avg_duration_s)} sub={`p95 ${fmtDuration(s?.p95_duration_s)}`} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Items procesados" value={s?.items_total} sub={`${s?.items_business ?? 0} excepción negocio`} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="En ejecución" value={s?.active_now} /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Éxito vs. fallo por día (14d)</Typography>
              {hasEnoughHistory ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={ts || []}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="ts" tickFormatter={(t) => String(t).slice(5)} {...axis} />
                    <YAxis {...axis} allowDecimals={false} />
                    <Tooltip {...tip} /><Legend />
                    <Area type="monotone" dataKey="success" name="Éxito" stackId="1" stroke={C.success} fill={C.success} fillOpacity={0.15} />
                    <Area type="monotone" dataKey="failed" name="Fallo" stackId="1" stroke={C.failed} fill={C.failed} fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ height: 260, color: "text.secondary" }}>
                  <HistoryToggleOffIcon sx={{ fontSize: 36, opacity: 0.5 }} />
                  <Typography variant="body2" color="text.secondary">Aún no hay suficiente historial</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Hace falta actividad en al menos {MIN_DAYS_WITH_DATA} días distintos para graficar la tendencia.
                  </Typography>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <ChartCard title="Histograma de duración">
            <BarChart data={hist || []}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="bucket" {...axis} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip {...tip} />
              <Bar dataKey="count" name="Corridas" fill={C.primary} />
            </BarChart>
          </ChartCard>
        </Grid>
        <Grid item xs={12}>
          <ChartCard title="Throughput de la cola (por hora, 24h)">
            <BarChart data={thr || []}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="ts" tickFormatter={(t) => String(t).slice(11)} {...axis} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip {...tip} /><Legend />
              <Bar dataKey="successful" name="Successful" stackId="a" fill={C.success} />
              <Bar dataKey="failed" name="Failed" stackId="a" fill={C.failed} />
              <Bar dataKey="retried" name="Retried" stackId="a" fill={C.warn} />
            </BarChart>
          </ChartCard>
        </Grid>
      </Grid>
    </Stack>
  );
}

const TRIGGER_LABEL = { MANUAL: "Manual", QUEUE: "Cola", SCHEDULE: "Programado", CHAIN: "Encadenado" };

function ExecutionsTab({ processId, navigate }) {
  const { data } = usePoll(() => fetchExecutions(processId), 4000, [processId]);
  return (
    <Paper variant="outlined">
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell><TableCell>Trigger</TableCell><TableCell>Estado</TableCell>
              <TableCell>Inicio</TableCell><TableCell>Duración</TableCell><TableCell>Ejecutado por</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data || []).map((e) => (
              <TableRow key={e.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/executions/${e.id}`)}>
                <TableCell>{e.id}</TableCell>
                <TableCell><Chip label={TRIGGER_LABEL[e.trigger] || e.trigger} size="small" variant="outlined" /></TableCell>
                <TableCell><StatusChip status={e.status} /></TableCell>
                <TableCell><Typography variant="caption">{fmtDateTime(e.started_at)}</Typography></TableCell>
                <TableCell>{fmtDuration(e.duration_s)}</TableCell>
                <TableCell><Typography variant="caption">{e.worker_id || <EmptyValue />}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

function VersionsTab({ processId, onChange }) {
  const { data, refresh } = usePoll(() => fetchVersions(processId), 10000, [processId]);
  const [open, setOpen] = useState(false);
  const [changelog, setChangelog] = useState("");

  const publish = async () => {
    await publishVersion(processId, changelog);
    setOpen(false); setChangelog(""); refresh(); onChange && onChange();
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Button variant="contained" startIcon={<PublishIcon />} onClick={() => setOpen(true)}>
          Publicar versión (snapshot del código actual)
        </Button>
      </Box>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Versión</TableCell><TableCell>Commit</TableCell><TableCell>Changelog</TableCell>
                <TableCell>Fecha</TableCell><TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {(data || []).map((v) => (
                <TableRow key={v.id} hover>
                  <TableCell>
                    {v.version}{" "}
                    {v.is_active && <Chip label="activa" size="small" color="success" variant="outlined" />}
                  </TableCell>
                  <TableCell><Typography variant="caption">{v.commit_sha ? v.commit_sha.slice(0, 10) : "sin git"}</Typography></TableCell>
                  <TableCell>{v.changelog || <EmptyValue />}</TableCell>
                  <TableCell><Typography variant="caption">{v.created_at}</Typography></TableCell>
                  <TableCell align="right">
                    {!v.is_active && (
                      <Button size="small" onClick={async () => { await activateVersion(processId, v.id); refresh(); onChange && onChange(); }}>
                        Activar (rollback)
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Publicar versión</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Se copia la carpeta del bot a un snapshot inmutable y se registra el commit git actual.
            Esta versión queda activa; las próximas corridas la usan.
          </Typography>
          <TextField label="Changelog" fullWidth multiline minRows={3} value={changelog}
            onChange={(e) => setChangelog(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={publish}>Publicar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
