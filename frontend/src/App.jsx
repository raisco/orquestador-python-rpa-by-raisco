import React, { useContext } from "react";
import { Routes, Route, Link as RouterLink, useLocation } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeIcon from "@mui/icons-material/WbSunnyOutlined";

import ColorModeContext from "./ColorModeContext";

import NavDrawer, { DRAWER_WIDTH } from "./components/NavDrawer";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardPage from "./pages/DashboardPage";
import ProcessesPage from "./pages/ProcessesPage";
import ProcessDetailPage from "./pages/ProcessDetailPage";
import QueuesPage from "./pages/QueuesPage";
import QueueDetailPage from "./pages/QueueDetailPage";
import ExecutionsPage from "./pages/ExecutionsPage";
import ExecutionDetailPage from "./pages/ExecutionDetailPage";
import LogsPage from "./pages/LogsPage";
import FilesPage from "./pages/FilesPage";
import SchedulesPage from "./pages/SchedulesPage";
import AssetsPage from "./pages/AssetsPage";
import VaultPage from "./pages/VaultPage";

export default function App() {
  const colorMode = useContext(ColorModeContext);
  const isDark = colorMode.mode === "dark";
  const location = useLocation();

  return (
    <Box sx={{ display: "flex" }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar variant="dense">
          <Box
            component={RouterLink}
            to="/"
            sx={{
              display: "flex", alignItems: "center", gap: 1.25, mr: 2,
              textDecoration: "none", color: "inherit",
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: "text.primary" }}>
              Orquestador de Automatizaciones
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title={isDark ? "Modo día" : "Modo noche"}>
            <IconButton onClick={colorMode.toggle} color="inherit" sx={{ mr: 1 }}>
              {isDark ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
          <Chip label="Runtime local" size="small" variant="outlined" />
        </Toolbar>
      </AppBar>

      <NavDrawer />

      <Box
        component="main"
        sx={{ flexGrow: 1, p: 3, width: `calc(100% - ${DRAWER_WIDTH}px)`, minHeight: "100vh" }}
      >
        <Toolbar variant="dense" />
        <Box sx={{ mt: 2 }}>
          <ErrorBoundary key={location.pathname + location.search}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/processes" element={<ProcessesPage />} />
            <Route path="/processes/:processId" element={<ProcessDetailPage />} />
            <Route path="/queues" element={<QueuesPage />} />
            <Route path="/queues/:queueId" element={<QueueDetailPage />} />
            <Route path="/executions" element={<ExecutionsPage />} />
            <Route path="/executions/:executionId" element={<ExecutionDetailPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/schedules" element={<SchedulesPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/vault" element={<VaultPage />} />
          </Routes>
          </ErrorBoundary>
        </Box>
      </Box>
    </Box>
  );
}
