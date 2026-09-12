import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Grid, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, Button, Stack, Accordion, AccordionSummary, AccordionDetails, Chip,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LayersIcon from "@mui/icons-material/LayersOutlined";

import usePoll from "../lib/usePoll";
import groupByQueue from "../lib/groupByQueue";
import StatCard from "../components/StatCard";
import StatusChip from "../components/StatusChip";
import ProcessKindChip from "../components/ProcessKindChip";
import EmptyValue from "../components/EmptyValue";
import { fetchOverview, fetchProcesses, runProcess } from "../api";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: ov } = usePoll(fetchOverview, 5000, []);
  const { data: procs, refresh } = usePoll(fetchProcesses, 5000, []);

  const runOne = async (id) => { await runProcess(id); refresh(); };
  const runGroup = async (group) => {
    await Promise.all(group.map((p) => runProcess(p.id)));
    refresh();
  };

  const { groups, loose } = groupByQueue(procs || []);

  return (
    <Stack spacing={3}>
      <Typography variant="h5">Dashboard</Typography>

      <Grid container spacing={2}>
        <Grid item xs={6} md={3}><StatCard label="Procesos" value={ov?.processes} sub={`${ov?.queues ?? 0} colas`} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Ejecuciones 24h" value={ov?.executions_24h} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Tasa de éxito 24h" value={ov?.success_rate_24h != null ? `${ov.success_rate_24h}%` : null} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="En ejecución" value={ov?.active_now} sub={`${ov?.items_pending ?? 0} items pendientes`} /></Grid>
      </Grid>

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
            <DashProcTable procs={group} navigate={navigate} onRun={runOne} />
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
          <DashProcTable procs={loose} navigate={navigate} onRun={runOne} />
        </Paper>
      )}
    </Stack>
  );
}

function DashProcTable({ procs, navigate, onRun }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Proceso</TableCell>
            <TableCell>Tipo</TableCell>
            <TableCell>Versión activa</TableCell>
            <TableCell>Éxito 7d</TableCell>
            <TableCell>Última corrida</TableCell>
            <TableCell align="right">Acción</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {procs.map((p) => (
            <TableRow key={p.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/processes/${p.id}`)}>
              <TableCell>
                <Typography variant="body2" fontWeight={600} color="text.primary">{p.name}</Typography>
                <Typography variant="caption" color="text.secondary">{p.key}</Typography>
              </TableCell>
              <TableCell><ProcessKindChip kind={p.kind} /></TableCell>
              <TableCell>
                {p.active_version
                  ? <Typography variant="body2">{p.active_version}</Typography>
                  : <Typography variant="caption" color="text.secondary">sin versión</Typography>}
              </TableCell>
              <TableCell>
                {p.success_rate_7d != null
                  ? (
                    <Typography variant="body2" fontWeight={600}
                      color={p.success_rate_7d >= 80 ? "success.main" : p.success_rate_7d >= 50 ? "warning.main" : "error.main"}>
                      {p.success_rate_7d}%
                    </Typography>
                  )
                  : <EmptyValue />}
              </TableCell>
              <TableCell>
                {p.last_status ? <StatusChip status={p.last_status} /> : <EmptyValue />}
              </TableCell>
              <TableCell align="right">
                <Button variant="outlined" startIcon={<PlayArrowIcon />} onClick={(e) => { e.stopPropagation(); onRun(p.id); }}>
                  Ejecutar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
