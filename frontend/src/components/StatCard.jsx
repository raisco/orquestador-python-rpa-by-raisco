import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import EmptyValue from "./EmptyValue";

export default function StatCard({ label, value, sub }) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ py: 2 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}
        >
          {label}
        </Typography>
        <Typography variant="h4" sx={{ my: 0.5, fontWeight: 700, color: "text.primary", lineHeight: 1.15 }}>
          {value ?? <EmptyValue variant="h4" />}
        </Typography>
        {sub != null && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  );
}
