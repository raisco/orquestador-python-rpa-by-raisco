import React, { useState } from "react";
import {
  Stack, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Switch, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Box, Checkbox,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/EditOutlined";
import AddLinkIcon from "@mui/icons-material/AddLink";

import usePoll from "../lib/usePoll";
import { fmtDateTime } from "../lib/format";
import { apiErrorMessage } from "../lib/apiError";
import EmptyValue from "../components/EmptyValue";
import CronBuilder from "../components/CronBuilder";
import {
  fetchSchedules, createSchedule, updateSchedule, toggleSchedule, deleteSchedule,
  fetchProcesses, updateProcess,
} from "../api";

/** Elegí 0+ procesos que deben correr después, cada uno con su propia política de error. */
function ChainPicker({ candidates, selections, onChange }) {
  const toggle = (id) => {
    const next = { ...selections };
    if (next[id]) delete next[id];
    else next[id] = "on_success";
    onChange(next);
  };
  const setPolicy = (id, policy) => onChange({ ...selections, [id]: policy });

  if (candidates.length === 0) {
    return <Typography variant="caption" color="text.secondary">No hay otros procesos para encadenar.</Typography>;
  }
  return (
    <Stack spacing={0.5}>
      {candidates.map((p) => (
        <Stack key={p.id} direction="row" spacing={1} alignItems="center">
          <Checkbox size="small" checked={!!selections[p.id]} onChange={() => toggle(p.id)} />
          <Typography variant="body2" sx={{ flexGrow: 1 }}>{p.name}</Typography>
          {selections[p.id] && (
            <TextField select size="small" value={selections[p.id]}
              onChange={(e) => setPolicy(p.id, e.target.value)} sx={{ minWidth: 210 }}>
              <MenuItem value="on_success">Solo si terminó OK</MenuItem>
              <MenuItem value="always">Siempre (aunque falle)</MenuItem>
            </TextField>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

export default function SchedulesPage() {
  const { data, refresh } = usePoll(fetchSchedules, 8000, []);
  const { data: procs, refresh: refreshProcs } = usePoll(fetchProcesses, 20000, []);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null); // null = alta, id = edición
  const [processId, setProcessId] = useState("");
  const [description, setDescription] = useState("");
  const [cron, setCron] = useState("0 8 * * *");
  const [chainSelections, setChainSelections] = useState({}); // { [procId]: policy }
  const [chainRow, setChainRow] = useState(null); // schedule sobre la que se está editando el encadenado
  const [rowChainSelections, setRowChainSelections] = useState({});
  const [rowChainOriginalIds, setRowChainOriginalIds] = useState([]);
  const [chainErr, setChainErr] = useState("");

  const chainCandidates = (procs || []).filter((p) => String(p.id) !== String(processId));
  const rowChainCandidates = (procs || []).filter((p) => p.id !== chainRow?.process_id);

  const openChainDialog = (s) => {
    const existing = (procs || []).filter((p) => p.after_process_id === s.process_id);
    setChainRow(s);
    setRowChainSelections(Object.fromEntries(existing.map((p) => [p.id, p.after_policy])));
    setRowChainOriginalIds(existing.map((p) => p.id));
    setChainErr("");
  };
  const saveChainDialog = async () => {
    setChainErr("");
    try {
      const selectedIds = Object.keys(rowChainSelections);
      for (const id of rowChainOriginalIds) {
        if (!selectedIds.includes(String(id))) {
          await updateProcess(id, { after_process_id: null });
        }
      }
      for (const [id, policy] of Object.entries(rowChainSelections)) {
        await updateProcess(Number(id), { after_process_id: chainRow.process_id, after_policy: policy });
      }
      setChainRow(null);
      refreshProcs();
    } catch (e) {
      setChainErr(apiErrorMessage(e, "No se pudo guardar el encadenado."));
    }
  };
  const removeChain = async (procId) => {
    await updateProcess(procId, { after_process_id: null });
    refreshProcs();
  };

  const [err, setErr] = useState("");

  const openCreateDialog = () => {
    setEditId(null);
    setProcessId("");
    setDescription("");
    setCron("0 8 * * *");
    setChainSelections({});
    setErr("");
    setOpen(true);
  };
  const openEditDialog = (s) => {
    const existing = (procs || []).filter((p) => p.after_process_id === s.process_id);
    setEditId(s.id);
    setProcessId(s.process_id);
    setDescription(s.description || "");
    setCron(s.cron);
    setChainSelections(Object.fromEntries(existing.map((p) => [p.id, p.after_policy])));
    setErr("");
    setOpen(true);
  };

  const save = async () => {
    if (!processId) return;
    setErr("");
    try {
      if (editId) {
        await updateSchedule(editId, { process_id: Number(processId), cron, description });
      } else {
        await createSchedule({ process_id: Number(processId), cron, description });
      }
      for (const [id, policy] of Object.entries(chainSelections)) {
        await updateProcess(Number(id), { after_process_id: Number(processId), after_policy: policy });
      }
      setOpen(false);
      refresh();
      refreshProcs();
    } catch (e) {
      setErr(apiErrorMessage(e, "No se pudo guardar."));
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">Programaciones</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>Nueva</Button>
      </Stack>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Proceso</TableCell><TableCell>Cuándo</TableCell><TableCell>Descripción</TableCell>
                <TableCell>Próxima</TableCell><TableCell>Después corre</TableCell><TableCell>Activa</TableCell><TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {(data || []).map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>{s.process_name}</TableCell>
                  <TableCell><Typography variant="caption" fontFamily="ui-monospace, monospace">{s.cron}</Typography></TableCell>
                  <TableCell>{s.description || <EmptyValue />}</TableCell>
                  <TableCell><Typography variant="caption">{fmtDateTime(s.next_run)}</Typography></TableCell>
                  <TableCell>
                    {(procs || []).filter((p) => p.after_process_id === s.process_id).map((p) => (
                      <Stack key={p.id} direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption">
                          {p.name} ({p.after_policy === "always" ? "siempre" : "si OK"})
                        </Typography>
                        <IconButton size="small" onClick={() => removeChain(p.id)}>
                          <DeleteIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Stack>
                    ))}
                    <Button size="small" startIcon={<AddLinkIcon fontSize="small" />} onClick={() => openChainDialog(s)}>
                      Encadenar
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Switch size="small" checked={s.enabled} onChange={async () => { await toggleSchedule(s.id); refresh(); }} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEditDialog(s)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={async () => { await deleteSchedule(s.id); refresh(); }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {(data || []).length === 0 && (
                <TableRow><TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    Sin programaciones. Creá una para que un proceso corra solo.
                  </Typography>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editId ? "Editar programación" : "Nueva programación"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Proceso a ejecutar" value={processId} onChange={(e) => setProcessId(e.target.value)}>
              {(procs || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
            <TextField label="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>¿Cuándo debe correr?</Typography>
              <CronBuilder key={editId || "new"} value={cron} onChange={setCron} />
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Encadenar otros procesos (opcional, podés elegir más de uno)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Se disparan solos apenas termina el proceso de arriba. No usan cron.
              </Typography>
              <ChainPicker candidates={chainCandidates} selections={chainSelections} onChange={setChainSelections} />
            </Box>
            {err && <Typography variant="caption" color="error">{err}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={save} disabled={!processId}>{editId ? "Guardar" : "Crear"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!chainRow} onClose={() => setChainRow(null)} fullWidth maxWidth="sm">
        <DialogTitle>Encadenar después de "{chainRow?.process_name}"</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Elegí uno o más procesos. Se disparan solos apenas termina "{chainRow?.process_name}". No usan cron.
            </Typography>
            <ChainPicker candidates={rowChainCandidates} selections={rowChainSelections} onChange={setRowChainSelections} />
            {chainErr && <Typography variant="caption" color="error">{chainErr}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChainRow(null)}>Cancelar</Button>
          <Button variant="contained" onClick={saveChainDialog}>Guardar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
