import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Stack, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, IconButton, Accordion, AccordionSummary, AccordionDetails, Chip, Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LayersIcon from "@mui/icons-material/LayersOutlined";

import usePoll from "../lib/usePoll";
import groupByQueue from "../lib/groupByQueue";
import { apiErrorMessage } from "../lib/apiError";
import ProcessKindChip from "../components/ProcessKindChip";
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

  const runOne = async (id) => { await runProcess(id); refresh(); };
  const runGroup = async (group) => {
    await Promise.all(group.map((p) => runProcess(p.id)));
    refresh();
  };
  const removeOne = async (id) => { await deleteProcess(id); refresh(); };

  const { groups, loose } = groupByQueue(procs || []);

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">Procesos</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Nuevo proceso</Button>
      </Stack>

      {[...groups.entries()].map(([queueName, group]) => (
        <Accordion key={queueName} defaultExpanded disableGutters variant="outlined">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexGrow: 1, pr: 1 }}>
              <LayersIcon fontSize="small" color="action" />
              <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>{queueName}</Typography>
              <Chip size="small" variant="outlined" label={`${group.length} proceso(s)`} />
              <Button size="small" variant="contained" startIcon={<PlayArrowIcon />}
                onClick={(e) => { e.stopPropagation(); runGroup(group); }}>
                Ejecutar todos
              </Button>
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <ProcTable procs={group} navigate={navigate} onRun={runOne} onDelete={removeOne} />
          </AccordionDetails>
        </Accordion>
      ))}

      {loose.length > 0 && (
        <Paper variant="outlined">
          {groups.size > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: "block" }}>
              Sin cola asociada
            </Typography>
          )}
          <ProcTable procs={loose} navigate={navigate} onRun={runOne} onDelete={removeOne} />
        </Paper>
      )}

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
    </Stack>
  );
}

function ProcTable({ procs, navigate, onRun, onDelete }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Nombre</TableCell><TableCell>Key</TableCell><TableCell>Tipo</TableCell><TableCell>Entrypoint</TableCell>
            <TableCell>Conc.</TableCell><TableCell>Versión</TableCell><TableCell>Encadenado</TableCell><TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {procs.map((p) => (
            <TableRow key={p.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/processes/${p.id}`)}>
              <TableCell><Typography variant="body2" fontWeight={600} color="text.primary">{p.name}</Typography></TableCell>
              <TableCell><Typography variant="caption" color="text.secondary">{p.key}</Typography></TableCell>
              <TableCell><ProcessKindChip kind={p.kind} /></TableCell>
              <TableCell><Typography variant="caption" color="text.secondary">{p.bot_dir}/{p.entrypoint}</Typography></TableCell>
              <TableCell>{p.max_concurrency}</TableCell>
              <TableCell>{p.active_version || <EmptyValue />}</TableCell>
              <TableCell>
                {p.after_process_name ? (
                  <Typography variant="caption" color="text.secondary">
                    después de {p.after_process_name} ({p.after_policy === "always" ? "siempre" : "si OK"})
                  </Typography>
                ) : <EmptyValue />}
              </TableCell>
              <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                <Tooltip title="Ejecutar">
                  <IconButton size="small" onClick={() => onRun(p.id)}>
                    <PlayArrowIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <IconButton size="small" onClick={async () => onDelete(p.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
          {procs.length === 0 && (
            <TableRow><TableCell colSpan={8}>
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Sin procesos.</Typography>
            </TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
