import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Stack, Typography, Grid, Card, CardContent, Box, Chip, Button, Link } from "@mui/material";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import CopyIcon from "@mui/icons-material/ContentCopyOutlined";
import DownloadIcon from "@mui/icons-material/DownloadOutlined";
import FileIcon from "@mui/icons-material/InsertDriveFileOutlined";

import usePoll from "../lib/usePoll";
import { fmtDateTime, fmtDuration, copyText } from "../lib/format";
import PageHeader from "../components/PageHeader";
import StatusChip from "../components/StatusChip";
import EmptyValue from "../components/EmptyValue";
import { JsonLinesBlock } from "../components/JsonHighlight";
import http, { fetchExecution, fetchExecutionLog, deleteExecution, EVIDENCE_URL } from "../api";

export default function ExecutionDetailPage() {
  const { executionId } = useParams();
  const navigate = useNavigate();
  const { data: e } = usePoll(() => fetchExecution(executionId), 2500, [executionId]);
  const running = e?.status === "RUNNING" || e?.status === "PENDING";
  // el log se refresca rápido mientras corre, y lento cuando terminó
  const { data: log } = usePoll(
    () => fetchExecutionLog(executionId), running ? 2000 : 15000, [executionId, running],
  );

  const [copied, setCopied] = useState(false);

  const remove = async () => {
    if (!window.confirm(`¿Borrar la ejecución #${executionId}? Se elimina también su log.`)) return;
    await deleteExecution(executionId);
    navigate("/executions");
  };
  const copy = async () => {
    const ok = await copyText(log || "");
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Stack spacing={2}>
      <PageHeader
        title={`Ejecución #${executionId}`}
        subtitle={e?.process_name}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <StatusChip status={e?.status} />
            {running && <Chip label="log en vivo" size="small" color="info" variant="outlined" />}
            <Button color="error" size="small" startIcon={<DeleteIcon />} disabled={running} onClick={remove}>
              Borrar
            </Button>
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid item xs={6} md={3}><Meta k="Proceso" v={e?.process_name} /></Grid>
        <Grid item xs={6} md={3}><Meta k="Trigger" v={e?.trigger} /></Grid>
        <Grid item xs={6} md={3}><Meta k="Duración" v={fmtDuration(e?.duration_s)} /></Grid>
        <Grid item xs={6} md={3}><Meta k="Exit code" v={e?.exit_code ?? "—"} /></Grid>
        <Grid item xs={6} md={3}><Meta k="Ejecutado por" v={e?.worker_id} /></Grid>
        <Grid item xs={6} md={3}><Meta k="Versión" v={e?.version_id ?? "—"} /></Grid>
        <Grid item xs={6} md={3}><Meta k="Inicio" v={fmtDateTime(e?.started_at)} /></Grid>
        <Grid item xs={6} md={3}><Meta k="Fin" v={fmtDateTime(e?.finished_at)} /></Grid>
      </Grid>

      {(e?.evidence || []).length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Archivos y evidencias</Typography>
            <Stack spacing={1}>
              {e.evidence.map((ev) => (
                <Stack key={ev.id} direction="row" spacing={1} alignItems="center">
                  <FileIcon fontSize="small" color="action" />
                  <Link href={EVIDENCE_URL(ev.id)} target="_blank" rel="noreferrer" variant="body2">
                    {ev.filename}
                  </Link>
                  <Typography variant="caption" color="text.secondary">
                    {(ev.size / 1024).toFixed(1)} KB
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>Log (stdout + stderr)</Typography>
            <Button size="small" startIcon={<CopyIcon />} onClick={copy}>
              {copied ? "Copiado" : "Copiar"}
            </Button>
            <Button size="small" startIcon={<DownloadIcon />} component="a"
              href={`${http.defaults.baseURL}/executions/${executionId}/log?download=1`}>
              Descargar
            </Button>
          </Stack>
          {log ? (
            <JsonLinesBlock text={log} sx={{
              m: 0, p: 2, bgcolor: "#0F172A", color: "#E2E8F0", borderRadius: 1,
              fontSize: "0.78rem", fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap",
              maxHeight: 520, overflow: "auto",
            }} />
          ) : (
            <Box sx={{
              m: 0, p: 2, bgcolor: "#0F172A", color: "#E2E8F0", borderRadius: 1,
              fontSize: "0.78rem", fontFamily: "ui-monospace, monospace",
            }}>
              (sin salida todavía)
            </Box>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

function Meta({ k, v }) {
  const empty = v == null || v === "" || v === "—";
  return (
    <Card>
      <CardContent sx={{ py: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</Typography>
        <Typography variant="body2" sx={{ mt: 0.5, wordBreak: "break-all" }}>{empty ? <EmptyValue /> : v}</Typography>
      </CardContent>
    </Card>
  );
}
