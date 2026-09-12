import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Stack, Typography, Button, Grid, Card, CardActionArea, CardContent, CardActions, Box,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Divider,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutline";

import usePoll from "../lib/usePoll";
import QueueBar, { STATUS_META } from "../components/QueueBar";
import EmptyValue from "../components/EmptyValue";
import { fetchQueues, createQueue, deleteQueue } from "../api";

export default function QueuesPage() {
  const navigate = useNavigate();
  const { data, refresh } = usePoll(fetchQueues, 4000, []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", max_retries: 1, retry_delay_seconds: 0 });

  const save = async () => {
    await createQueue({
      ...form,
      max_retries: Number(form.max_retries),
      retry_delay_seconds: Number(form.retry_delay_seconds),
    });
    setOpen(false);
    setForm({ name: "", description: "", max_retries: 1, retry_delay_seconds: 0 });
    refresh();
  };

  const remove = async (q) => {
    if (!window.confirm(`¿Eliminar la cola "${q.name}" y todos sus ítems? Los procesos que la usan quedarán sin cola.`)) return;
    await deleteQueue(q.id);
    refresh();
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Box>
          <Typography variant="h5">Colas de trabajo</Typography>
          <Typography variant="caption" color="text.secondary">
            Cada cola es una lista de ítems. Un proceso los <b>genera</b> y otro los <b>procesa</b>.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Nueva cola</Button>
      </Stack>

      <Grid container spacing={2}>
        {(data || []).map((q) => {
          const c = q.counts || {};
          const done = (c.Successful || 0) + (c.Failed || 0) + (c.Abandoned || 0);
          const pct = c.total ? Math.round((100 * done) / c.total) : 0;
          return (
            <Grid item xs={12} md={6} key={q.id}>
              <Card>
                <CardActionArea onClick={() => navigate(`/queues/${q.id}`)}>
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box>
                        <Typography variant="h6">{q.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {q.description || <EmptyValue />}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: "right" }}>
                        <Typography variant="h5">{c.total || 0}</Typography>
                        <Typography variant="caption" color="text.secondary">ítems · {pct}% resueltos</Typography>
                      </Box>
                    </Stack>

                    <Box sx={{ mt: 2 }}><QueueBar counts={c} /></Box>

                    <Stack direction="row" spacing={2} sx={{ mt: 1.5, flexWrap: "wrap" }}>
                      {["Failed", "Retried", "InProgress", "New", "Successful"].map((k) => (
                        <Stack key={k} direction="row" spacing={0.75} alignItems="center">
                          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: STATUS_META[k].color, flexShrink: 0 }} />
                          <Typography variant="caption">{STATUS_META[k].label}: <b>{c[k] || 0}</b></Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </CardContent>
                </CardActionArea>
                <CardActions sx={{ justifyContent: "flex-end", borderTop: 1, borderColor: "divider" }}>
                  <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => remove(q)}>
                    Eliminar cola
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          );
        })}
        {(data || []).length === 0 && (
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary">Todavía no hay colas.</Typography>
          </Grid>
        )}
      </Grid>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Nueva cola</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <TextField label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Divider />
            <TextField type="number" label="Reintentos automáticos por ítem" value={form.max_retries}
              onChange={(e) => setForm({ ...form, max_retries: e.target.value })}
              helperText="Si un ítem falla por error técnico, cuántas veces se reintenta." />
            <TextField type="number" label="Espera entre reintentos (segundos)" value={form.retry_delay_seconds}
              onChange={(e) => setForm({ ...form, retry_delay_seconds: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={save}>Crear</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
