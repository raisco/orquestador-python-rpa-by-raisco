import React from "react";
import { NavLink } from "react-router-dom";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import DashboardIcon from "@mui/icons-material/GridViewOutlined";
import ProcessIcon from "@mui/icons-material/PrecisionManufacturingOutlined";
import QueueIcon from "@mui/icons-material/LayersOutlined";
import LogsIcon from "@mui/icons-material/ReceiptLongOutlined";
import TerminalIcon from "@mui/icons-material/TerminalOutlined";
import FilesIcon from "@mui/icons-material/FolderZipOutlined";
import ScheduleIcon from "@mui/icons-material/ScheduleOutlined";
import AssetIcon from "@mui/icons-material/FolderOutlined";
import VaultIcon from "@mui/icons-material/VpnKeyOutlined";

export const DRAWER_WIDTH = 232;

const SECTIONS = [
  {
    header: "Monitoreo",
    items: [
      { to: "/", label: "Dashboard", icon: DashboardIcon, end: true },
      { to: "/executions", label: "Ejecuciones", icon: LogsIcon },
      { to: "/logs", label: "Logs", icon: TerminalIcon },
      { to: "/files", label: "Archivos y evidencias", icon: FilesIcon },
    ],
  },
  {
    header: "Automatizaciones",
    items: [
      { to: "/processes", label: "Procesos", icon: ProcessIcon },
      { to: "/queues", label: "Colas", icon: QueueIcon },
      { to: "/schedules", label: "Programaciones", icon: ScheduleIcon },
    ],
  },
  {
    header: "Recursos (equipo de automatización)",
    items: [
      { to: "/assets", label: "Archivos de datos", icon: AssetIcon },
      { to: "/vault", label: "Bóveda de credenciales", icon: VaultIcon },
    ],
  },
];

export default function NavDrawer() {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" },
      }}
    >
      <Toolbar />
      <Box sx={{ overflow: "auto", py: 1 }}>
        {SECTIONS.map((section) => (
          <List
            key={section.header}
            dense
            subheader={
              <ListSubheader disableSticky sx={{ bgcolor: "transparent", lineHeight: "32px", fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {section.header}
              </ListSubheader>
            }
          >
            {section.items.map(({ to, label, icon: Icon, end }) => (
              <ListItemButton
                key={to}
                component={NavLink}
                to={to}
                end={end}
                sx={{
                  mx: 1,
                  borderRadius: 1,
                  "&.active": {
                    bgcolor: "action.selected",
                    borderLeft: "3px solid",
                    borderColor: "primary.main",
                    "& .MuiListItemIcon-root": { color: "primary.main" },
                    "& .MuiListItemText-primary": { color: "primary.main", fontWeight: 600 },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: "text.secondary" }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={label} />
              </ListItemButton>
            ))}
          </List>
        ))}
        <Box sx={{ px: 2.5, pt: 1 }}>
          <Typography variant="caption">v4.0 · runtime local</Typography>
        </Box>
      </Box>
    </Drawer>
  );
}
