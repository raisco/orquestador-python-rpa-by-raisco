import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Stack, Typography, Paper, List, ListItemButton, ListItemText, ListItemIcon, Box, Chip,
  Grid, IconButton, Tooltip, TextField, MenuItem, Checkbox, Button,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DownloadIcon from "@mui/icons-material/DownloadOutlined";
import CopyIcon from "@mui/icons-material/ContentCopyOutlined";
import CheckIcon from "@mui/icons-material/Check";
import DeleteIcon from "@mui/icons-material/DeleteOutline";

import usePoll from "../lib/usePoll";
import { fmtDateTime, copyText } from "../lib/format";
import StatusChip from "../components/StatusChip";
import { JsonLinesBlock } from "../components/JsonHighlight";
import http, { fetchExecutions, fetchExecutionLog, fetchProcesses, fetchQueues, deleteExecution, deleteExecutions } from "../api";

export default function LogsPage() {
  const [sp, setSp] = useSearchParams();
  const processId = sp.get("process") || "";
  const queueId = sp.get("queue") || "";

  const { data: processes } = usePoll(fetchProcesses, 30000, []);
  const { data: queues } = usePoll(fetchQueues, 30000, []);
  const { data: execs, refresh: refreshExecs } = usePoll(
    () => fetchExecutions({ process_id: processId || undefined, queue_id: queueId || undefined, limit: 200 }),
    4000, [processId, queueId],
  );

  const [sel, setSel] = useState(null);
  const [log, setLog] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checked, setChecked] = useState(() => new Set());

  const setFilter = (key, value) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    setSp(next, { replace: true });
    setSel(null);
  };

  useEffect(() => {
    if (execs && execs.length) {
      if (sel == null || !execs.some((e) => e.id === sel)) setSel(execs[0].id);
    } else {
      setSel(null);
      setLog("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execs]);

  const load = async (id) => {
    if (id == null) return;
    setLoading(true);
    try {
      setLog(await fetchExecutionLog(id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(sel);
    const running = execs?.find((e) => e.id === sel)?.status === "RUNNING";
    if (!running) return undefined;
    const t = setInterval(() => load(sel), 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const copy = async () => {
    const ok = await copyText(log || "");
    setCopied(ok ? "Copiado" : "No se pudo copiar — usá Descargar");
    setTimeout(() => setCopied(false), 2000);
  };

  const selExec = execs?.find((e) => e.id === sel);

  const remove = async () => {
    if (!selExec) return;
    if (!window.confirm(`¿Borrar la ejecución #${selExec.id}? Se elimina también su log del disco.`)) return;
    await deleteExecution(selExec.id);
    setSel(null);
    setLog("");
    refreshExecs();
  };

  const deletable = (execs || []).filter((e) => e.status !== "RUNNING");
  const toggleCheck = (id) => setChecked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allChecked = deletable.length > 0 && deletable.every((e) => checked.has(e.id));
  const someChecked = deletable.some((e) => checked.has(e.id));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(deletable.map((e) => e.id)));

  const removeSelected = async () => {
    const ids = [...checked];
    if (ids.length === 0) return;
    if (!window.confirm(`¿Borrar ${ids.length} ejecución(es) y sus logs del disco? Esta acción no se puede deshacer.`)) return;
    await deleteExecutions(ids);
    if (ids.includes(sel)) { setSel(null); setLog(""); }
    setChecked(new Set());
    refreshExecs();
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">Logs</Typography>
        <Typography variant="caption" color="text.secondary">
          Filtrá por proceso o cola para no ver todo mezclado. Los archivos completos también
          quedan en <code>storage/logs/&lt;id&gt;.log</code> en el servidor.
        </Typography>
      </Box>

      <Stack direction="row" spacing={2} flexWrap="wrap">
        <TextField select size="small" label="Proceso" value={processId} sx={{ minWidth: 220 }}
          onChange={(e) => setFilter("process", e.target.value)}>
          <MenuItem value="">Todos</MenuItem>
          {(processes || []).map((p) => <MenuItem key={p.id} value={String(p.id)}>{p.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Cola" value={queueId} sx={{ minWidth: 200 }}
          onChange={(e) => setFilter("queue", e.target.value)}>
          <MenuItem value="">Todas</MenuItem>
          {(queues || []).map((q) => <MenuItem key={q.id} value={String(q.id)}>{q.name}</MenuItem>)}
        </TextField>
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ maxHeight: 560, overflow: "auto" }}>
            {(execs || []).length > 0 && (
              <Stack direction="row" alignItems="center" spacing={1}
                sx={{ px: 1, py: 0.5, borderBottom: 1, borderColor: "divider", position: "sticky", top: 0, bgcolor: "background.paper", zIndex: 1 }}>
                <Checkbox size="small" checked={allChecked} indeterminate={someChecked && !allChecked} onChange={toggleAll} />
                {checked.size > 0 ? (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
                      {checked.size} seleccionada(s)
                    </Typography>
                    <Button size="small" color="error" startIcon={<DeleteIcon fontSize="small" />} onClick={removeSelected}>
                      Borrar
                    </Button>
                  </>
                ) : (
                  <Typography variant="caption" color="text.secondary">Seleccionar todos</Typography>
                )}
              </Stack>
            )}
            <List dense disablePadding>
              {(execs || []).map((e) => (
                <ListItemButton key={e.id} selected={e.id === sel} onClick={() => setSel(e.id)}>
                  <ListItemIcon sx={{ minWidth: 36 }} onClick={(ev) => ev.stopPropagation()}>
                    <Checkbox size="small" edge="start" checked={checked.has(e.id)}
                      disabled={e.status === "RUNNING"} onChange={() => toggleCheck(e.id)} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2">#{e.id}</Typography>
                        <StatusChip status={e.status} />
                      </Stack>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {e.process_name} · {fmtDateTime(e.started_at || e.created_at)}
                      </Typography>
                    }
                  />
                </ListItemButton>
              ))}
              {(execs || []).length === 0 && (
                <Box sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Sin corridas para este filtro.</Typography></Box>
              )}
            </List>
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ p: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                {selExec ? `Ejecución #${selExec.id} — ${selExec.process_name}` : "Elegí una corrida"}
              </Typography>
              {selExec && (
                <>
                  <Tooltip title={copied || "Copiar todo el log"}>
                    <IconButton size="small" onClick={copy}>
                      {copied === "Copiado" ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Refrescar"><IconButton size="small" onClick={() => load(sel)}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Descargar .log">
                    <IconButton size="small" component="a"
                      href={`${http.defaults.baseURL}/executions/${selExec.id}/log?download=1`}>
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={selExec.status === "RUNNING" ? "No se puede borrar una ejecución en curso" : "Borrar ejecución y su log del disco"}>
                    <span>
                      <IconButton size="small" color="error" disabled={selExec.status === "RUNNING"} onClick={remove}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </>
              )}
            </Stack>
            {log ? (
              <JsonLinesBlock text={log} sx={{
                m: 0, p: 2, bgcolor: "#0F172A", color: "#E2E8F0", minHeight: 460, maxHeight: 560,
                overflow: "auto", fontSize: "0.78rem", fontFamily: "ui-monospace, monospace",
                whiteSpace: "pre-wrap", opacity: loading ? 0.6 : 1,
              }} />
            ) : (
              <Box sx={{
                m: 0, p: 2, bgcolor: "#0F172A", color: "#E2E8F0", minHeight: 460,
                fontSize: "0.78rem", fontFamily: "ui-monospace, monospace",
              }}>
                (sin salida)
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}
