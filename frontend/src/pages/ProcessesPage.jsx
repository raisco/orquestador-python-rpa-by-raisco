import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Stack, Typography, Button, Grid, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, IconButton, Chip, Tooltip, Snackbar, Alert, CircularProgress, InputAdornment,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import LayersIcon from "@mui/icons-material/LayersOutlined";
import SearchIcon from "@mui/icons-material/SearchOutlined";
import ClearIcon from "@mui/icons-material/Clear";

import usePoll from "../lib/usePoll";
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
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState("");

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

  const runFiltered = async () => {
    try {
      const results = await Promise.all(visibleProcs.map((p) => runProcess(p.id)));
      setToast({ severity: "success", message: `${results.length} ejecución(es) encolada(s)` });
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

  const q = search.trim().toLowerCase();
  const matches = (p) => {
    if (queueFilter === "__none__" ? !!p.queue_name : queueFilter && p.queue_name !== queueFilter) return false;
    return !q || [p.name, p.key, p.bot_dir, p.entrypoint].join(" ").toLowerCase().includes(q);
  };
  const allProcs = procs || [];
  const visibleProcs = allProcs.filter(matches);
  const filtering = q.length > 0 || queueFilter.length > 0;
  const noResults = filtering && visibleProcs.length === 0;

  const queueNames = [...new Set(allProcs.filter((p) => p.queue_name).map((p) => p.queue_name))];
  const showVersionCol = allProcs.some((p) => p.active_version);
  const showChainedCol = allProcs.some((p) => p.after_process_name);
  const colCount = 7 + showVersionCol + showChainedCol;

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Typography variant="h5">Procesos</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Nuevo proceso</Button>
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatCard label="Procesos" value={allProcs.length || null} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Colas en uso" value={queueNames.length || null} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Sin cola asociada" value={allProcs.filter((p) => !p.queue_name).length || null} />
        </Grid>
      </Grid>

      <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center">
        <TextField
          size="small"
          placeholder="Buscar por nombre, key o entrypoint…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 280 }}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: search && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearch("")}><ClearIcon fontSize="small" /></IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField select size="small" label="Cola" value={queueFilter} sx={{ minWidth: 180 }}
          onChange={(e) => setQueueFilter(e.target.value)}>
          <MenuItem value="">Todas</MenuItem>
          <MenuItem value="__none__">Sin cola</MenuItem>
          {queueNames.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
        </TextField>
        {filtering && visibleProcs.length > 0 && (
          <Button size="small" variant="outlined" startIcon={<PlayArrowIcon />} onClick={runFiltered}>
            Ejecutar {visibleProcs.length === allProcs.length ? "todos" : `estos (${visibleProcs.length})`}
          </Button>
        )}
      </Stack>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell>Key</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Cola</TableCell>
              <TableCell>Entrypoint</TableCell>
              <TableCell>Conc.</TableCell>
              {showVersionCol && <TableCell>Versión</TableCell>}
              {showChainedCol && <TableCell>Encadenado</TableCell>}
              <TableCell>Última corrida</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleProcs.map((p) => (
              <ProcRow key={p.id} p={p} navigate={navigate} onRun={runOne(p)}
                onDelete={() => removeOne(p)} isRunning={running.has(p.id)}
                showVersionCol={showVersionCol} showChainedCol={showChainedCol} />
            ))}

            {allProcs.length === 0 && (
              <TableRow><TableCell colSpan={colCount}>
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Sin procesos.</Typography>
              </TableCell></TableRow>
            )}
            {noResults && (
              <TableRow><TableCell colSpan={colCount}>
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  Ningún proceso coincide con los filtros{search ? ` "${search}"` : ""}.
                </Typography>
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
              {(queues || []).map((qq) => <MenuItem key={qq.id} value={qq.name}>{qq.name}</MenuItem>)}
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

function ProcRow({ p, navigate, onRun, onDelete, isRunning, showVersionCol, showChainedCol }) {
  return (
    <TableRow hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/processes/${p.id}`)}>
      <TableCell><Typography variant="body2" fontWeight={600} color="text.primary">{p.name}</Typography></TableCell>
      <TableCell><Typography variant="caption" color="text.secondary">{p.key}</Typography></TableCell>
      <TableCell><ProcessKindChip kind={p.kind} /></TableCell>
      <TableCell>
        {p.queue_name ? (
          <Chip size="small" variant="outlined" icon={<LayersIcon />} label={p.queue_name} />
        ) : (
          <Tooltip title="No tiene cola asignada — click para editar el proceso y asociarle una">
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
              No posee
            </Typography>
          </Tooltip>
        )}
      </TableCell>
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
