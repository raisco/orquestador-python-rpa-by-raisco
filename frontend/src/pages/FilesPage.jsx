import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Stack, Typography, Paper, List, ListItemButton, ListItemText, Box,
  Grid, IconButton, Tooltip, TextField, MenuItem, Link,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import FileIcon from "@mui/icons-material/InsertDriveFileOutlined";
import FolderOffOutlinedIcon from "@mui/icons-material/FolderOffOutlined";

import usePoll from "../lib/usePoll";
import { fmtDateTime } from "../lib/format";
import StatusChip from "../components/StatusChip";
import { fetchExecutions, fetchExecution, fetchProcesses, fetchQueues, EVIDENCE_URL } from "../api";

export default function FilesPage() {
  const [sp, setSp] = useSearchParams();
  const processId = sp.get("process") || "";
  const queueId = sp.get("queue") || "";

  const { data: processes } = usePoll(fetchProcesses, 30000, []);
  const { data: queues } = usePoll(fetchQueues, 30000, []);
  const { data: execs } = usePoll(
    () => fetchExecutions({ process_id: processId || undefined, queue_id: queueId || undefined, limit: 200 }),
    4000, [processId, queueId],
  );

  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

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
      setDetail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execs]);

  const load = async (id) => {
    if (id == null) return;
    setLoading(true);
    try {
      setDetail(await fetchExecution(id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(sel);
    const running = execs?.find((e) => e.id === sel)?.status === "RUNNING";
    if (!running) return undefined;
    const t = setInterval(() => load(sel), 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const selExec = execs?.find((e) => e.id === sel);
  const evidence = detail?.evidence || [];

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">Archivos y evidencias</Typography>
        <Typography variant="caption" color="text.secondary">
          Filtrá por proceso o cola. Son los archivos que cada corrida adjuntó
          (capturas de error, reportes de salida, etc.) — mismo criterio que Logs.
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
            <List dense disablePadding>
              {(execs || []).map((e) => (
                <ListItemButton key={e.id} selected={e.id === sel} onClick={() => setSel(e.id)}>
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
                <Tooltip title="Refrescar">
                  <IconButton size="small" onClick={() => load(sel)}><RefreshIcon fontSize="small" /></IconButton>
                </Tooltip>
              )}
            </Stack>
            <Box sx={{ p: 2, minHeight: 460, maxHeight: 560, overflow: "auto", opacity: loading ? 0.6 : 1 }}>
              {evidence.length === 0 && (
                <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 6, color: "text.secondary" }}>
                  <FolderOffOutlinedIcon sx={{ fontSize: 40, opacity: 0.5 }} />
                  <Typography variant="body2" color="text.secondary">
                    {selExec ? "Esta corrida no adjuntó archivos." : "Elegí una corrida a la izquierda."}
                  </Typography>
                </Stack>
              )}
              <Stack spacing={1.5}>
                {evidence.map((ev) => (
                  <Stack key={ev.id} direction="row" spacing={1} alignItems="center">
                    <FileIcon fontSize="small" color="action" />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Link href={EVIDENCE_URL(ev.id)} target="_blank" rel="noreferrer" variant="body2"
                        sx={{ wordBreak: "break-all" }}>
                        {ev.filename}
                      </Link>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {(ev.size / 1024).toFixed(1)} KB · {fmtDateTime(ev.created_at)}
                      </Typography>
                      {(ev.content_type || "").startsWith("image/") && (
                        <Box component="img" src={EVIDENCE_URL(ev.id)} alt={ev.filename}
                          sx={{ display: "block", mt: 0.5, maxWidth: 360, border: 1, borderColor: "divider", borderRadius: 1 }} />
                      )}
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}
