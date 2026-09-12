import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Stack, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Checkbox, Button, IconButton, Tooltip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/DeleteOutline";

import usePoll from "../lib/usePoll";
import StatusChip from "../components/StatusChip";
import EmptyValue from "../components/EmptyValue";
import { FmtDateTime, FmtDuration } from "../components/Fmt";
import { fetchExecutions, deleteExecution, deleteExecutions } from "../api";

export default function ExecutionsPage() {
  const navigate = useNavigate();
  const { data, refresh } = usePoll(() => fetchExecutions(), 4000, []);
  const [sel, setSel] = useState([]);

  const rows = data || [];
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allChecked = rows.length > 0 && sel.length === rows.length;

  const removeOne = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm(`¿Borrar la ejecución #${id}? Se elimina también su log.`)) return;
    await deleteExecution(id);
    setSel((s) => s.filter((x) => x !== id));
    refresh();
  };
  const removeSelected = async () => {
    if (!window.confirm(`¿Borrar ${sel.length} ejecución(es)? Se eliminan también sus logs.`)) return;
    await deleteExecutions(sel);
    setSel([]);
    refresh();
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">Historial de ejecuciones</Typography>
        {sel.length > 0 && (
          <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={removeSelected}>
            Borrar {sel.length} seleccionada(s)
          </Button>
        )}
      </Stack>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={allChecked}
                    indeterminate={sel.length > 0 && !allChecked}
                    onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.id) : [])}
                  />
                </TableCell>
                <TableCell>#</TableCell><TableCell>Proceso</TableCell><TableCell>Trigger</TableCell>
                <TableCell>Estado</TableCell><TableCell>Inicio</TableCell><TableCell>Duración</TableCell>
                <TableCell>Ejecutado por</TableCell><TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id} hover selected={sel.includes(e.id)} sx={{ cursor: "pointer" }}
                  onClick={() => navigate(`/executions/${e.id}`)}>
                  <TableCell padding="checkbox" onClick={(ev) => ev.stopPropagation()}>
                    <Checkbox size="small" checked={sel.includes(e.id)} onChange={() => toggle(e.id)} />
                  </TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary">{e.id}</Typography></TableCell>
                  <TableCell><Typography variant="body2" fontWeight={600} color="text.primary">{e.process_name || e.process_id}</Typography></TableCell>
                  <TableCell><Chip label={e.trigger} size="small" variant="outlined" /></TableCell>
                  <TableCell><StatusChip status={e.status} /></TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary"><FmtDateTime iso={e.started_at} /></Typography></TableCell>
                  <TableCell><FmtDuration seconds={e.duration_s} /></TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary">{e.worker_id || <EmptyValue />}</Typography></TableCell>
                  <TableCell align="right" onClick={(ev) => ev.stopPropagation()}>
                    <Tooltip title="Borrar">
                      <span>
                        <IconButton size="small" disabled={e.status === "RUNNING"} onClick={(ev) => removeOne(e.id, ev)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={9}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Sin ejecuciones.</Typography>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  );
}
