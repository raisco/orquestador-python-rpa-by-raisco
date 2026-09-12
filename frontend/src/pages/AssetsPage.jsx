import React, { useState } from "react";
import {
  Stack, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Box,
} from "@mui/material";
import UploadIcon from "@mui/icons-material/UploadFileOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutline";

import usePoll from "../lib/usePoll";
import EmptyValue from "../components/EmptyValue";
import { fetchAssets, uploadAsset, deleteAsset } from "../api";

export default function AssetsPage() {
  const { data, refresh } = usePoll(fetchAssets, 10000, []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);

  const save = async () => {
    if (!name || !file) return;
    await uploadAsset(name, file);
    setOpen(false); setName(""); setFile(null); refresh();
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Box>
          <Typography variant="h5">Archivos de datos</Typography>
          <Typography variant="caption" color="text.secondary">
            Archivos internos que usan los bots (plantillas, listados, config). Los administra el
            equipo de automatización — no es un canal para que el cliente final suba nada.
            El bot los descarga por nombre con <code>self.assets.download("nombre", ruta)</code>.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<UploadIcon />} onClick={() => setOpen(true)}>Subir archivo</Button>
      </Stack>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell><TableCell>Archivo</TableCell><TableCell>Tipo</TableCell>
                <TableCell>Tamaño</TableCell><TableCell>Actualizado</TableCell><TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {(data || []).map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell>{a.name}</TableCell>
                  <TableCell><Typography variant="caption">{a.filename}</Typography></TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary">{a.content_type || <EmptyValue />}</Typography></TableCell>
                  <TableCell>{(a.size / 1024).toFixed(1)} KB</TableCell>
                  <TableCell><Typography variant="caption">{a.updated_at}</Typography></TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={async () => { await deleteAsset(a.id); refresh(); }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Subir archivo de datos</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nombre lógico" value={name} onChange={(e) => setName(e.target.value)}
              helperText="El bot lo pide por este nombre. Ej: rpa_challenge_input" />
            <Button component="label" variant="outlined">
              {file ? file.name : "Elegir archivo"}
              <input hidden type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={save}>Subir</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
