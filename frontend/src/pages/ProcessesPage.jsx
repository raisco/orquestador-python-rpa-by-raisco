import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Stack, Typography, Button, Grid, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, IconButton, Chip, Tooltip, Snackbar, Alert, CircularProgress,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import LayersIcon from "@mui/icons-material/LayersOutlined";

import usePoll from "../lib/usePoll";
import groupByQueue from "../lib/groupByQueue";
import { apiErrorMessage } from "../lib/apiError";
import { fmtDateTime } from "../lib/format";
import ProcessKindChip from "../components/ProcessKindChip";
import StatusChip from "../components/StatusChip";
import StatCard from "../components/StatCard";
import EmptyValue from "../components/EmptyValue";
import { fetchProcesses, createProcess, deleteProcess, fetchQueues, fetchBotScripts, runProcess } from "../api";

const EMPTY = { key: "", name: "", description: "", bot_dir: "", entrypoint: "", kind: "standalone", queue_name: "", max_concurrency: 1 };

export default function ProcessesPage() {
  const navigate = useNavigate();
  const { data: procs, refresh } = usePoll(fetchProcesses, 8000, []);
  const { data: queues } = usePoll(fetchQueues, 15000, []);
  const { data: botScripts } = usePoll(fetchBotScripts, 20000, []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [running, setRunning] = useState(() => new Set());
  const [toast, setToast] = useState(null); // { severity, message }

  const folders = Object.keys(botScripts || {});
  const filesForFolder = (botScripts || {})[form.bot_dir] || [];

  const save = async () => {
    setErr("");
    try {
      await createProcess({ ...form, queue_name: form.queue_name || null, max_concurrency: Number(form.max_concurrency) });
      setOpen(false);
      setForm(EMPTY);
      refresh();
    } catch (e) {
      setErr(apiErrorMessage(e, "No se pudo crear el proceso."));
    }
  };

  const missing = [
    !form.key && "Key",
    !form.name && "Nombre",
    !form.bot_dir && "Carpeta del bot",
    !form.entrypoint && "Entrypoint",
  ].filter(Boolean);

  const withRunning = (id, fn) => async () => {
    setRunning((s) => new Set(s).add(id));
    try {
      await fn();
    } finally {
      setRunning((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const runOne = (p) => withRunning(p.id, async () => {
    try {
      const r = await runProcess(p.id);
      setToast({ severity: "success", message: `${p.name}: ejecución #${r.execution_id} encolada` });
      refresh();
    } catch (e) {
      setToast({ severity: "error", message: apiErrorMessage(e, `No se pudo ejecutar ${p.name}.`) });
    }
  });

  const runGroup = async (queueName, group) => {
    try {
      const results = await Promise.all(group.map((p) => runProcess(p.id)));
      setToast({ severity: "success", message: `${queueName}: ${results.length} ejecución(es) encolada(s)` });
      refresh();
    } catch (e) {
      setToast({ severity: "error", message: apiErrorMessage(e, "No se pudieron ejecutar todos los procesos.") });
    }
  };

  const removeOne = async (p) => {
    if (!window.confirm(`¿Borrar el proceso "${p.name}"? Esta acción no se puede deshacer.`)) return;
    await deleteProcess(p.id);
    setToast({ severity: "success", message: `${p.name} borrado.` });
    refresh();
  };

  const { groups, loose } = groupByQueue(procs || []);
  const showVersionCol = (procs || []).some((p) => p.active_version);
  const showChainedCol = (procs || []).some((p) => p.after_process_name);

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">Procesos</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Nuevo proceso</Button>
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatCard label="Procesos" value={(procs || []).length || null} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Colas en uso" value={groups.size || null} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Sin cola asociada" value={loose.length || null} />
        </Grid>
      </Grid>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell>Key</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Entrypoint</TableCell>
              <TableCell>Conc.</TableCell>
              {showVersionCol && <TableCell>Versión</TableCell>}
              {showChainedCol && <TableCell>Encadenado</TableCell>}
              <TableCell>Última corrida</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {[...groups.entries()].map(([queueName, group]) => (
              <GroupSection
                key={queueName}
                label={queueName}
                count={group.length}
                onRunGroup={() => runGroup(queueName, group)}
                colSpan={6 + showVersionCol + showChainedCol}
              >
                {group.map((p) => (
                  <ProcRow key={p.id} p={p} navigate={navigate} onRun={runOne(p)}
                    onDelete={() => removeOne(p)} isRunning={running.has(p.id)}
                    showVersionCol={showVersionCol} showChainedCol={showChainedCol} />
                ))}
              </GroupSection>
            ))}

            {loose.length > 0 && (
              <GroupSection
                label="Sin cola asociada" count={loose.length} muted
                colSpan={6 + showVersionCol + showChainedCol}
              >
                {loose.map((p) => (
                  <ProcRow key={p.id} p={p} navigate={navigate} onRun={runOne(p)}
                    onDelete={() => removeOne(p)} isRunning={running.has(p.id)}
                    showVersionCol={showVersionCol} showChainedCol={showChainedCol} />
                ))}
              </GroupSection>
            )}

            {(procs || []).length === 0 && (
              <TableRow><TableCell colSpan={7 + showVersionCol + showChainedCol}>
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Sin procesos.</Typography>
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nuevo proceso</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Key (a-z, -, _)" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
            <TextField label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <TextField label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <TextField select label="Carpeta del bot" value={form.bot_dir}
              onChange={(e) => setForm({ ...form, bot_dir: e.target.value, entrypoint: "" })}
              helperText="Subcarpeta detectada en backend/bots/">
              {folders.length === 0 && <MenuItem value="" disabled>(no se detectaron carpetas en bots/)</MenuItem>}
              {folders.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </TextField>
            <TextField select label="Archivo a ejecutar (entrypoint)" value={form.entrypoint}
              onChange={(e) => setForm({ ...form, entrypoint: e.target.value })}
              disabled={!form.bot_dir}>
              {filesForFolder.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
            </TextField>
            <TextField select label="Tipo" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}
              helperText="dispatcher = genera ítems · performer = los procesa · standalone = no usa cola">
              <MenuItem value="standalone">standalone (sin cola)</MenuItem>
              <MenuItem value="dispatcher">dispatcher (genera ítems)</MenuItem>
              <MenuItem value="performer">performer (procesa ítems)</MenuItem>
            </TextField>
            <TextField select label={form.kind === "standalone" ? "Cola asociada (opcional)" : "Cola"} value={form.queue_name} onChange={(e) => setForm({ ...form, queue_name: e.target.value })}>
              <MenuItem value="">(ninguna)</MenuItem>
              {(queues || []).map((q) => <MenuItem key={q.id} value={q.name}>{q.name}</MenuItem>)}
            </TextField>
            <TextField type="number" label="Concurrencia máxima" value={form.max_concurrency} onChange={(e) => setForm({ ...form, max_concurrency: e.target.value })} />
            {err && <Typography variant="caption" color="error">{err}</Typography>}
            {missing.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                Faltan campos obligatorios: {missing.join(", ")}.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={save} disabled={missing.length > 0}>Crear</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        {toast && <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">{toast.message}</Alert>}
      </Snackbar>
    </Stack>
  );
}

function GroupSection({ label, count, onRunGroup, muted, colSpan, children }) {
  return (
    <>
      <TableRow sx={{ bgcolor: "action.hover" }}>
        <TableCell colSpan={colSpan} sx={{ py: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <LayersIcon fontSize="small" color={muted ? "disabled" : "action"} />
            <Typography variant="subtitle2" color={muted ? "text.secondary" : "text.primary"} sx={{ flexGrow: 1 }}>
              {label}
            </Typography>
            <Chip size="small" variant="outlined" label={`${count} proceso(s)`} />
            {onRunGroup && (
              <Button size="small" variant="contained" startIcon={<PlayArrowIcon />} onClick={onRunGroup}>
                Ejecutar todos
              </Button>
            )}
          </Stack>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}

function ProcRow({ p, navigate, onRun, onDelete, isRunning, showVersionCol, showChainedCol }) {
  return (
    <TableRow hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/processes/${p.id}`)}>
      <TableCell><Typography variant="body2" fontWeight={600} color="text.primary">{p.name}</Typography></TableCell>
      <TableCell><Typography variant="caption" color="text.secondary">{p.key}</Typography></TableCell>
      <TableCell><ProcessKindChip kind={p.kind} /></TableCell>
      <TableCell><Typography variant="caption" color="text.secondary">{p.bot_dir}/{p.entrypoint}</Typography></TableCell>
      <TableCell>{p.max_concurrency}</TableCell>
      {showVersionCol && <TableCell>{p.active_version || <EmptyValue />}</TableCell>}
      {showChainedCol && (
        <TableCell>
          {p.after_process_name ? (
            <Typography variant="caption" color="text.secondary">
              después de {p.after_process_name} ({p.after_policy === "always" ? "siempre" : "si OK"})
            </Typography>
          ) : <EmptyValue />}
        </TableCell>
      )}
      <TableCell onClick={(e) => e.stopPropagation()}>
        {p.last_status ? (
          <Tooltip title={p.last_run ? fmtDateTime(p.last_run) : ""}>
            <span><StatusChip status={p.last_status} /></span>
          </Tooltip>
        ) : <EmptyValue />}
      </TableCell>
      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
        <Tooltip title="Ejecutar">
          <span>
            <IconButton size="small" onClick={onRun} disabled={isRunning}>
              {isRunning ? <CircularProgress size={16} /> : <PlayArrowIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Borrar proceso">
          <IconButton size="small" color="error" onClick={onDelete} sx={{ ml: 1 }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}
