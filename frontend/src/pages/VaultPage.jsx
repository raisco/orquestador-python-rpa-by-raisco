import React, { useState, useRef, useEffect } from "react";
import {
  Stack, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Box, Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined";
import CopyIcon from "@mui/icons-material/ContentCopyOutlined";
import CheckIcon from "@mui/icons-material/Check";

import usePoll from "../lib/usePoll";
import EmptyValue from "../components/EmptyValue";
import { fetchCredentials, createCredential, deleteCredential, revealCredential } from "../api";

const AUTO_HIDE_MS = 10000;

export default function VaultPage() {
  const { data, refresh } = usePoll(fetchCredentials, 15000, []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ service_name: "", username: "", password: "", notes: "" });
  const [revealed, setRevealed] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const timers = useRef({});

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  const save = async () => {
    await createCredential(form);
    setOpen(false); setForm({ service_name: "", username: "", password: "", notes: "" }); refresh();
  };

  const hide = (id) => {
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
    setRevealed((s) => {
      if (s[id] === undefined) return s;
      const next = { ...s };
      delete next[id];
      return next;
    });
  };

  const toggleReveal = async (id) => {
    if (revealed[id] !== undefined) {
      hide(id);
      return;
    }
    const r = await revealCredential(id);
    setRevealed((s) => ({ ...s, [id]: r.password }));
    // Auto-ocultar a los 10s: es una credencial en texto plano en pantalla,
    // no conviene dejarla visible indefinidamente si te distraés.
    timers.current[id] = setTimeout(() => hide(id), AUTO_HIDE_MS);
  };

  const copy = async (id) => {
    if (revealed[id] === undefined) return;
    try {
      await navigator.clipboard.writeText(revealed[id]);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      // clipboard puede fallar en contexto no seguro (http) — no rompemos la UI por esto
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Box>
          <Typography variant="h5">Bóveda de credenciales</Typography>
          <Typography variant="caption" color="text.secondary">
            Guardadas cifradas. La contraseña en claro solo se muestra al pedirla acá (se oculta
            sola a los 10s) o cuando un bot la solicita por nombre de servicio.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Nueva credencial</Button>
      </Stack>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Servicio</TableCell><TableCell>Usuario</TableCell><TableCell>Contraseña</TableCell>
                <TableCell>Notas</TableCell><TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {(data || []).map((c) => {
                const isRevealed = revealed[c.id] !== undefined;
                return (
                  <TableRow key={c.id} hover>
                    <TableCell><Typography variant="body2" fontWeight={600} color="text.primary">{c.service_name}</Typography></TableCell>
                    <TableCell><Typography variant="body2" color="text.secondary">{c.username}</Typography></TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" fontFamily="ui-monospace, monospace">
                          {isRevealed ? revealed[c.id] : "••••••••"}
                        </Typography>
                        <Tooltip title={isRevealed ? "Ocultar" : "Mostrar"}>
                          <IconButton size="small" aria-label={isRevealed ? "Ocultar contraseña" : "Mostrar contraseña"}
                            onClick={() => toggleReveal(c.id)}>
                            {isRevealed ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                        {isRevealed && (
                          <Tooltip title={copiedId === c.id ? "Copiado" : "Copiar"}>
                            <IconButton size="small" aria-label="Copiar contraseña" onClick={() => copy(c.id)}>
                              {copiedId === c.id ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{c.notes || <EmptyValue />}</Typography></TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Borrar credencial" onClick={async () => { await deleteCredential(c.id); refresh(); }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Nueva credencial</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nombre de servicio" value={form.service_name} onChange={(e) => setForm({ ...form, service_name: e.target.value })} />
            <TextField label="Usuario" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <TextField label="Contraseña" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <TextField label="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={save}>Guardar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
