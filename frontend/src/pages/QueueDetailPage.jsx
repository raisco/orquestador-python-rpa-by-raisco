import React, { useState } from "react";
import { useParams, useNavigate, Link as RouterLink } from "react-router-dom";
import {
  Stack, Typography, Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, Grid, Divider, Link,
  Alert, Button, TextField, MenuItem, Checkbox, IconButton, Tooltip,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import RefreshIcon from "@mui/icons-material/Refresh";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";

import usePoll from "../lib/usePoll";
import { fmtDateTime, fmtTime } from "../lib/format";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import StatusChip from "../components/StatusChip";
import QueueBar from "../components/QueueBar";
import EmptyValue from "../components/EmptyValue";
import { JsonBlock, JsonLinesBlock } from "../components/JsonHighlight";
import {
  fetchQueue, fetchQueueItems, fetchQueueItem, runProcess, deleteQueue,
  setQueueItemState, bulkSetQueueItemState, deleteQueueItem, bulkDeleteQueueItems,
  EVIDENCE_URL, EXECUTION_LOG_URL,
} from "../api";

const FILTERS = [
  ["", "Todos"], ["New", "Pendientes"], ["InProgress", "En curso"],
  ["Successful", "OK"], ["Failed", "Fallidos"], ["Retried", "Reintentos"], ["Abandoned", "Descartados"],
];
const TARGET_STATES = [
  ["New", "Reponer a Pendiente"],
  ["Abandoned", "Descartar"],
  ["Successful", "Marcar OK"],
  ["Failed", "Marcar Fallido"],
];
// Reponer a Pendiente = azul (misma familia que "en curso"/pendiente),
// Descartar = gris neutro, Marcar OK = verde, Marcar Fallido = ámbar
// (distinto del gris de Descartar y del rojo sólido de "Eliminar ítem").
const TARGET_BUTTON_PROPS = {
  New: { color: "info" },
  Abandoned: { sx: { color: "text.secondary", borderColor: "divider" } },
  Successful: { color: "success" },
  Failed: { color: "warning" },
};

const TIMELINE_DOT_COLOR = {
  New: "grey.500",
  InProgress: "info.main",
  Successful: "success.main",
  Failed: "error.main",
  Retried: "warning.main",
  Abandoned: "warning.main",
};

function ItemTimeline({ events }) {
  if (events.length === 0) {
    return <Typography variant="caption" color="text.secondary">Sin eventos todavía.</Typography>;
  }
  return (
    <Stack spacing={0} sx={{ mt: 1 }}>
      {events.map((ev, i) => (
        <Stack key={ev.id} direction="row" spacing={1.5} alignItems="flex-start">
          <Typography variant="caption" color="text.secondary"
            sx={{ width: 78, textAlign: "right", pt: "3px", flexShrink: 0 }}>
            {fmtTime(ev.at)}
          </Typography>
          <Stack alignItems="center" sx={{ width: 10, flexShrink: 0 }}>
            <Box sx={{
              width: 10, height: 10, borderRadius: "50%", mt: "4px", flexShrink: 0,
              bgcolor: TIMELINE_DOT_COLOR[ev.to_status] || "grey.500",
            }} />
            {i < events.length - 1 && <Box sx={{ width: "2px", flexGrow: 1, minHeight: 18, bgcolor: "divider" }} />}
          </Stack>
          <Box sx={{ pb: 1.5 }}>
            <Typography variant="body2">
              {ev.from_status || "∅"} → <b>{ev.to_status}</b>
            </Typography>
            {ev.detail && <Typography variant="caption" color="text.secondary">{ev.detail}</Typography>}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

export default function QueueDetailPage() {
  const { queueId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState([]);
  const [target, setTarget] = useState("Abandoned");

  const { data: q, refresh } = usePoll(() => fetchQueue(queueId), 3000, [queueId]);
  const { data: page, refresh: refreshItems } = usePoll(
    () => fetchQueueItems(queueId, { status: status || undefined, size: 100 }),
    3000, [queueId, status],
  );

  const c = q?.counts || {};
  const items = page?.items || [];
  const openItem = async (id) => setSelected(await fetchQueueItem(id));
  const reload = () => {
    refresh(); refreshItems();
    if (selected) fetchQueueItem(selected.id).then(setSelected).catch(() => {});
  };
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const runConsumers = async () => {
    setBusy(true);
    try { for (const p of q.consumers) await runProcess(p.id); }
    finally { setBusy(false); reload(); }
  };

  const applyToSelected = async () => {
    await bulkSetQueueItemState(queueId, { status: target, item_ids: sel });
    setSel([]); reload();
  };
  const keepOnlySelected = async () => {
    const toDrop = items.filter((i) => i.status === "New" && !sel.includes(i.id)).map((i) => i.id);
    if (!toDrop.length) return;
    if (!window.confirm(`Se descartarán ${toDrop.length} ítem(s) pendientes; quedarán solo los ${sel.length} seleccionados.`)) return;
    await bulkSetQueueItemState(queueId, { status: "Abandoned", item_ids: toDrop });
    reload();
  };
  const removeQueue = async () => {
    if (!window.confirm(`¿Eliminar la cola "${q.name}" y todos sus ítems?`)) return;
    await deleteQueue(queueId);
    navigate("/queues");
  };
  const changeItemState = async (id, st) => { await setQueueItemState(id, st); setSelected(null); reload(); };
  const removeItem = async (id) => {
    if (!window.confirm("¿Eliminar este ítem definitivamente?")) return;
    await deleteQueueItem(id);
    if (selected?.id === id) setSelected(null);
    setSel((s) => s.filter((x) => x !== id));
    reload();
  };
  const removeSelected = async () => {
    if (!window.confirm(`¿Eliminar definitivamente ${sel.length} ítem(s)?`)) return;
    await bulkDeleteQueueItems(queueId, { item_ids: sel });
    setSel([]); reload();
  };

  return (
    <Stack spacing={2}>
      <PageHeader
        to="/queues"
        title={q?.name || "Cola"}
        subtitle={q?.description}
        actions={
          <Stack direction="row" spacing={1}>
            <Button component={RouterLink} to={`/logs?queue=${queueId}`}>Ver logs</Button>
            <Button color="error" size="small" startIcon={<DeleteIcon />} onClick={removeQueue}>
              Eliminar cola
            </Button>
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid item xs={6} md={2.4}><StatCard label="Total" value={c.total ?? 0} /></Grid>
        <Grid item xs={6} md={2.4}><StatCard label="Pendientes" value={c.New ?? 0} /></Grid>
        <Grid item xs={6} md={2.4}><StatCard label="En curso" value={c.InProgress ?? 0} /></Grid>
        <Grid item xs={6} md={2.4}><StatCard label="OK" value={c.Successful ?? 0} /></Grid>
        <Grid item xs={6} md={2.4}><StatCard label="Fallidos" value={(c.Failed ?? 0) + (c.Abandoned ?? 0)} sub={`${c.Retried ?? 0} reintentos`} /></Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 2 }}><QueueBar counts={c} /></Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" gutterBottom>Genera ítems (dispatcher)</Typography>
            {(q?.producers || []).length === 0 && <Typography variant="caption" color="text.secondary">Ninguno asignado.</Typography>}
            {(q?.producers || []).map((p) => (
              <Stack key={p.id} direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="body2" sx={{ flexGrow: 1 }}>{p.name}</Typography>
                <Button size="small" startIcon={<PlayArrowIcon />} onClick={async () => { await runProcess(p.id); reload(); }}>Ejecutar</Button>
              </Stack>
            ))}
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" gutterBottom>Procesa ítems (performer)</Typography>
            {(q?.consumers || []).length === 0 && <Typography variant="caption" color="text.secondary">Ninguno asignado.</Typography>}
            {(q?.consumers || []).map((p) => (
              <Stack key={p.id} direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="body2" sx={{ flexGrow: 1 }}>{p.name}</Typography>
                <Button size="small" startIcon={<PlayArrowIcon />} onClick={async () => { await runProcess(p.id); reload(); }}>Ejecutar</Button>
              </Stack>
            ))}
          </Grid>
        </Grid>
      </Paper>

      {(c.New ?? 0) > 0 && (
        (q?.consumers || []).length > 0 ? (
          <Alert severity="info" action={<Button color="inherit" size="small" disabled={busy} onClick={runConsumers}>Procesar cola ahora</Button>}>
            Hay <b>{c.New}</b> ítem(s) pendiente(s). Ejecutá el performer para procesarlos.
          </Alert>
        ) : (
          <Alert severity="warning">
            Hay <b>{c.New}</b> ítem(s) pendiente(s) pero esta cola no tiene un proceso <b>performer</b> asignado.
          </Alert>
        )
      )}

      {/* Barra de acciones sobre selección */}
      {sel.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <Typography variant="body2"><b>{sel.length}</b> seleccionado(s)</Typography>
            <TextField select size="small" label="Acción" value={target} onChange={(e) => setTarget(e.target.value)} sx={{ minWidth: 200 }}>
              {TARGET_STATES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
            <Button size="small" variant="contained" onClick={applyToSelected}>Aplicar</Button>
            <Button size="small" onClick={keepOnlySelected}>Dejar solo estos (descartar el resto)</Button>
            <Button size="small" color="error" startIcon={<DeleteForeverIcon />} onClick={removeSelected}>
              Eliminar seleccionados
            </Button>
            <Button size="small" onClick={() => setSel([])}>Limpiar selección</Button>
          </Stack>
        </Paper>
      )}

      <Stack direction="row" spacing={3} alignItems="center">
        <TextField select size="small" label="Filtrar por estado" value={status}
          onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 220 }}>
          {FILTERS.map(([v, label]) => <MenuItem key={v || "all"} value={v}>{label}</MenuItem>)}
        </TextField>
        <Tooltip title="Recargar">
          <IconButton size="small" color="primary" onClick={reload}><RefreshIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>

      <Paper variant="outlined">
        <TableContainer sx={{ maxHeight: 520 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox size="small"
                    checked={items.length > 0 && sel.length === items.length}
                    indeterminate={sel.length > 0 && sel.length < items.length}
                    onChange={(e) => setSel(e.target.checked ? items.map((i) => i.id) : [])} />
                </TableCell>
                <TableCell>Referencia</TableCell><TableCell>Estado</TableCell><TableCell>Reintentos</TableCell>
                <TableCell>Detalle del error</TableCell><TableCell>Logs</TableCell><TableCell>Fin</TableCell><TableCell padding="checkbox" />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id} hover selected={sel.includes(i.id)} sx={{ cursor: "pointer" }} onClick={() => openItem(i.id)}>
                  <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                    <Checkbox size="small" checked={sel.includes(i.id)} onChange={() => toggle(i.id)} />
                  </TableCell>
                  <TableCell><Typography variant="body2">{i.reference || i.id.slice(0, 8)}</Typography></TableCell>
                  <TableCell><StatusChip status={i.status} /></TableCell>
                  <TableCell>{i.retry_count}</TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary">{i.exception_type || <EmptyValue />}</Typography></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {i.processing_execution_id ? (
                      <Button size="small" startIcon={<ArticleOutlinedIcon fontSize="small" />} onClick={() => openItem(i.id)}>
                        Ver
                      </Button>
                    ) : (
                      <EmptyValue />
                    )}
                  </TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary">{i.ended_at ? fmtDateTime(i.ended_at) : <EmptyValue />}</Typography></TableCell>
                  <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                    {i.status !== "InProgress" && (
                      <DeleteIcon fontSize="small" sx={{ cursor: "pointer", color: "text.secondary", "&:hover": { color: "error.main" } }}
                        onClick={() => removeItem(i.id)} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={8}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Sin ítems en este filtro.</Typography>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth maxWidth="md">
        <DialogTitle>
          Ítem {selected?.reference || selected?.id?.slice(0, 8)} <StatusChip status={selected?.status} />
        </DialogTitle>
        <DialogContent dividers>
          {selected && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2">Datos de entrada</Typography>
                <JsonBlock value={selected.specific_data} sx={preSx} />
                <Typography variant="subtitle2" sx={{ mt: 2 }}>Resultado</Typography>
                <JsonBlock value={selected.output_data} sx={preSx} />
                {selected.exception_reason && (
                  <>
                    <Typography variant="subtitle2" sx={{ mt: 2 }} color="error">{selected.exception_type}</Typography>
                    <Box component="pre" sx={preSx}>{selected.exception_reason}</Box>
                  </>
                )}
                {selected.execution && (
                  <>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 2 }}>
                      <Typography variant="subtitle2">Logs</Typography>
                      <Link href={EXECUTION_LOG_URL(selected.execution.id)} target="_blank" rel="noreferrer" variant="caption">
                        ver corrida completa #{selected.execution.id}
                      </Link>
                    </Stack>
                    {selected.item_log_isolated === false && (
                      <Typography variant="caption" color="warning.main" sx={{ display: "block", mb: 0.5 }}>
                        No se pudo aislar el log de este ítem: se muestra la corrida completa (procesó varios ítems).
                      </Typography>
                    )}
                    {selected.item_log
                      ? <JsonLinesBlock text={selected.item_log} sx={preSx} />
                      : <Box component="pre" sx={preSx}>Sin salida registrada.</Box>}
                  </>
                )}
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2">Historial del ítem</Typography>
                <ItemTimeline events={selected.events || []} />
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2">Evidencias</Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {(selected.evidence || []).length === 0 && <Typography variant="caption" color="text.secondary">Sin evidencias.</Typography>}
                  {(selected.evidence || []).map((e) => (
                    <Box key={e.id}>
                      <Link href={EVIDENCE_URL(e.id)} target="_blank" rel="noreferrer" variant="caption">{e.filename}</Link>
                      {(e.content_type || "").startsWith("image/") && (
                        <Box component="img" src={EVIDENCE_URL(e.id)} alt={e.filename}
                          sx={{ display: "block", mt: 0.5, maxWidth: "100%", border: 1, borderColor: "divider", borderRadius: 1 }} />
                      )}
                    </Box>
                  ))}
                </Stack>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Cambiar estado manualmente:</Typography>
          {TARGET_STATES.map(([v, l]) => (
            <Button key={v} size="small" variant="outlined" {...TARGET_BUTTON_PROPS[v]}
              onClick={() => changeItemState(selected.id, v)}>
              {l}
            </Button>
          ))}
          <Button size="small" color="error" startIcon={<DeleteForeverIcon />}
            disabled={selected?.status === "InProgress"} onClick={() => removeItem(selected.id)}>
            Eliminar ítem
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={() => setSelected(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

const preSx = {
  m: 0, p: 1.5, bgcolor: "action.hover", border: 1, borderColor: "divider", borderRadius: 1,
  fontSize: "0.75rem", fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap",
  wordBreak: "break-word", maxHeight: 220, overflow: "auto",
};
